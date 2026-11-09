/**
 * Private folder — an ENCRYPTED store for passwords, notes, documents and private photos.
 *
 * 1.13.0 — "vault v3" (the user: "protect users from being locked out … recovery key, PIN code"):
 *   - Encrypted at rest as before: its own MMKV instance, AES-256, key K = 32 random characters.
 *     K is now NEVER kept in the open. It exists only in three locked copies (lib/vaultCrypto.ts):
 *       • FINGERPRINT — a Keystore entry with requireAuthentication: Android itself refuses to hand it
 *         over without a STRONG biometric (the old check was only a screen in front of a plain key).
 *         Adding a fingerprint makes Android destroy it → the PIN opens, and it's set up again.
 *       • MemoAirem PIN (6 digits, the user's choice "fingerprint OR own PIN"): the PHONE's PIN no
 *         longer opens the folder. Wrong PINs pause 30 s → 1 h; nothing is ever wiped by guessing.
 *       • RECOVERY KEY (25 characters, shown once, written down by the user): opens the folder when
 *         the PIN is forgotten or the Keystore is gone, and opens BACKUP FILES on a new phone.
 *   - Tamper check: an HMAC over the item list (and each photo). MMKV's own AES-CFB can't detect a
 *     changed byte; this can.
 *   - Backup file (exportBackup / readBackup): every item and photo, plus the Gemini key and the
 *     Harbor link when they are set, AES-256-GCM with a key from the recovery key. The user keeps
 *     it wherever they like (Drive, e-mail, USB) — it's unreadable without the recovery key. No server.
 *   - 1.10–1.12 folders ("legacy": plain key in the Keystore, phone lock): open once with the phone
 *     lock, then the user sets a PIN and gets a recovery key; the plain key is then deleted.
 *
 * Unchanged rules: private items NEVER enter AppContext (no Harbor, Gemini, log, export, questions,
 * spoken answers); Settings → Reset doesn't touch it; Android backup is off (allowBackup:false).
 *
 * Records keep the FIXED shape (`Rec`, invariant 1): see PrivateInput and lib/privateDocs.ts.
 */
import { createMMKV, deleteMMKV, type MMKV } from 'react-native-mmkv';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { getRandomBytes } from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { deleteAsync, readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { persist } from './persist';
import { loadAiLink, saveAiLink } from './settings';
import { loadSyncConfig, saveSyncConfig, type SyncConfig } from './sync';
import type { AiLink, Rec } from '../types';
import { PRIVATE_DOC_TYPE, dueDocCount, packDocNotes, type DocTag } from './privateDocs';
import { normalizeSite } from './sites';
import { checkVaultCore, storeCore, vaultEngine, type NativeVault, coreNow, indexCore } from './vaultNative';
import { copyAll, dualDb, kotlinDb, type Db } from './vaultStore';
import * as Keys from './vaultKeys';

// 2.0.0-autofill.2: check the Kotlin vault core once at start (falls back to JS by itself).
void checkVaultCore();
import {
  PIN_SCRYPT_N,
  QUESTION_SCRYPT_N,
  answerProblem,
  questionKey,
  backupKey,
  bytesToHex,
  formatRecoveryKey,
  hexToBytes,
  isValidPin,
  mac,
  macKey,
  makeRecoveryKey,
  normalizeRecoveryKey,
  openBackup,
  packBackup,
  pinKey,
  pinPause,
  recoveryWrapKey,
  sealText,
  unsealText,
  type BackupHeader,
  type Sealed,
} from './vaultCrypto';

/** The storage name 1.10.0–1.10.10 used for every private folder (kept readable for old folders). */
const LEGACY_ID = 'vault';
/**
 * 1.10–1.12 SecureStore entry: JSON {"v":2,"id","k"} (or, before 1.10.11, the key alone). Deleted once
 * the folder moves to v3.
 */
const KEY_NAME = 'memoairem_vault_key';
// v3's fingerprint copy of K and the 32-byte PIN pepper: kept by lib/vaultKeys.ts (the Kotlin core
// since 2.0.0-autofill.3, expo-secure-store before).
/** PLAIN storage: v3 locked copies + settings (all ciphertext or harmless). */
const META = 'vault_v3';
const FAILS = 'vault_pin_fails';
const MARKER = 'vault_created'; // PLAIN storage: only "a private folder exists"
const CANARY_KEY = 'canary';
const CANARY = 'memoairem-private-v1'; // read back on every open: proves the key matches the file
const ITEMS = 'items';
/** A count only, outside the locked folder, so the dock can say "2 due" without names or numbers. */
const DUE_DOCS = 'private_due';
const ITEMS_MAC = 'items_mac';
const BACKUP_KEY = 'backup_key'; // inside the vault: hex key for backup files (from the recovery key)
const IMG = (id: string) => `img:${id}`;
const IMG_MAC = (id: string) => `imgmac:${id}`;

const AAD_PIN = 'memoairem v3 pin';
const AAD_REC = 'memoairem v3 recovery';
const AAD_SQ = 'memoairem v3 question';

let open: Db | null = null;
let openKey: string | null = null; // K while unlocked — needed to change the PIN, re-add the fingerprint …
let tampered = false;

/**
 * WHY EACH FOLDER HAS ITS OWN STORAGE NAME (1.10.11 fix). MMKV keeps ONE open copy per storage name
 * for the whole app session, and a second open of the same name hands back that copy and IGNORES
 * the key passed in (MMKV core 2.4.1, MMKV.cpp getMMKVWithID). A new folder always gets a brand-new
 * name, a delete removes the storage through MMKV itself, and `opened` refuses to ever open a name
 * with a second key in one session.
 */
const opened = new Map<string, string>(); // storage name → the key it was opened with this session
let currentId: string | null = null;

interface KeyEntry {
  id: string;
  k: string;
}

interface Meta {
  v: 3;
  id: string;
  n: number; // scrypt cost used for `pin`
  salt: string; // hex
  pin: Sealed; // K under the PIN key
  rec: Sealed; // K under the recovery key
  bio: boolean; // a fingerprint copy was made (it may since have been destroyed by Android)
  created: string;
  /** voice.38: K under name + e-mail + secret answer (+ Keystore pepper). The question is plain text. */
  sq?: { q: string; salt: string; n: number; wrap: Sealed };
  /**
   * 2.0.0-autofill.3: a check value of K (HMAC from K, reveals nothing). A key that doesn't match is
   * refused BEFORE the storage is opened — MMKV may treat a file opened with a wrong key as damaged.
   */
  kc?: string;
  /** 2.0.0-autofill.4: where the entries live — absent = MMKV; "kotlin-new" = moving; "kotlin" = Kotlin core */
  store?: 'kotlin-new' | 'kotlin';
}

function readEntry(raw: string | null): KeyEntry | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    if (j && typeof j.k === 'string' && typeof j.id === 'string' && /^vault-[A-Za-z0-9_-]{8,}$/.test(j.id)) {
      return { id: j.id, k: j.k };
    }
  } catch {
    /* not JSON — a 1.10.0–1.10.10 entry */
  }
  return { id: LEGACY_ID, k: raw };
}

function readMeta(): Meta | null {
  const raw = persist.getString(META);
  if (!raw) return null;
  try {
    const m = JSON.parse(raw);
    return m && m.v === 3 && typeof m.id === 'string' && m.pin && m.rec ? (m as Meta) : null;
  } catch {
    return null;
  }
}

function writeMeta(m: Meta): void {
  persist.set(META, JSON.stringify(m));
  syncAutofillPin(m);
}

/**
 * 2.0.0-autofill.8 (phase 3): autofill may ask for the PIN — the Kotlin core keeps the PIN's locked
 * copy of K {n, salt, iv, ct}: ciphertext, useless without the PIN AND this phone's Keystore secret.
 * null removes it. Older cores: nothing (autofill then offers fingerprint only).
 */
function syncAutofillPin(m: Meta | null): void {
  try {
    coreNow()?.autofillPinSync?.(m ? JSON.stringify({ n: m.n, salt: m.salt, iv: m.pin.iv, ct: m.pin.ct }) : null);
  } catch {
    /* an older core */
  }
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function randomChars(n: number): string {
  const b = getRandomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHABET[b[i] & 63];
  return s;
}

/** 32 characters from a 64-letter alphabet = 192 random bits, MMKV's 32-byte AES-256 key slot. */
function newKey(): string {
  return randomChars(32);
}

const iv12 = () => getRandomBytes(12);

export type UnlockResult =
  | { ok: true; created: boolean; tampered?: boolean }
  | {
      ok: false;
      reason: 'no-lock' | 'cancelled' | 'key-lost' | 'error' | 'setup' | 'wrong-pin' | 'wait' | 'bio-changed' | 'no-bio' | 'wrong-key';
      message: string;
      /** wrong-pin / wait: seconds before the next try */
      waitSeconds?: number;
    };

/* ---------------- state ---------------- */

export type VaultMode = 'none' | 'legacy' | 'v3';

/** none = no folder yet · legacy = a 1.10–1.12 folder (phone lock) · v3 = PIN + recovery key. */
export function vaultMode(): VaultMode {
  if (readMeta()) return 'v3';
  return persist.getString(MARKER) === '1' ? 'legacy' : 'none';
}

/** Has a private folder ever been set up on this phone? (Plain flag — reveals nothing else.) */
export function vaultExists(): boolean {
  return vaultMode() !== 'none';
}

export function isUnlocked(): boolean {
  return open != null;
}

/** v3: is fingerprint unlock switched on? */
export function biometricOn(): boolean {
  return !!readMeta()?.bio;
}

/** Does this phone have a STRONG biometric enrolled (what the Keystore lock needs)? */
export async function strongBiometricReady(): Promise<boolean> {
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    return level === LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG;
  } catch {
    return false;
  }
}

/* ---------------- opening ---------------- */

/** Open the storage with K (never a second key for one name in a session), check canary + integrity. */
const KC_LABEL = 'memoairem-folder-key-check';
const keyCheck = (k: string) => mac(macKey(k), KC_LABEL);

/**
 * 2.0.0-autofill.4: where this folder's entries live (Meta.store) — MMKV (absent), moving
 * ("kotlin-new": Kotlin is read, both are written), or the Kotlin core's store ("kotlin").
 */
/** An older build met a folder moved to the Kotlin core (keys or storage): say so — nothing is lost. */
const NEEDS_NEWER: UnlockResult = {
  ok: false,
  reason: 'error',
  message: 'Your private folder was moved to MemoAirem’s newer storage, which this version can’t open. Install the latest MemoAirem — nothing is lost.',
};
let openCore: NativeVault | null = null; // the Kotlin store open right now (closed by lockVault)
let createdInKotlin = false; // finishSetup: the new folder was made in the Kotlin store

function openMmkv(entry: KeyEntry): MMKV | UnlockResult {
  const before = opened.get(entry.id);
  if (before !== undefined && before !== entry.k) {
    // Never reached by design — a guard so MMKV's cached copy is never used with another key.
    return { ok: false, reason: 'error', message: 'Close and reopen MemoAirem, then unlock again.' };
  }
  const db = createMMKV({ id: entry.id, encryptionKey: entry.k, encryptionType: 'AES-256' });
  opened.set(entry.id, entry.k);
  return db;
}
const isMmkv = (x: MMKV | UnlockResult): x is MMKV => !('ok' in x);

/** Open the storage with K (checked first), check canary + integrity; move it to Kotlin when it can. */
async function openWith(entry: KeyEntry, created: boolean): Promise<UnlockResult> {
  const meta = readMeta();
  const mine = !!meta && meta.id === entry.id;
  if (!created && mine && meta!.kc && meta!.kc !== keyCheck(entry.k)) {
    // never open the storage with a key that isn't the folder's (see Meta.kc)
    console.log('[private] a folder key that does not match was refused before opening');
    return { ok: false, reason: 'error', message: 'That didn’t open the private folder. Use your PIN or recovery key.' };
  }
  const unreadable: UnlockResult = {
    ok: false,
    reason: 'key-lost',
    message:
      entry.id === LEGACY_ID
        ? 'This private folder was damaged by a bug in MemoAirem 1.10.0–1.10.10 (fixed now) and can’t be read. Delete it and start a new one — the new folder won’t have this problem.'
        : 'The private folder couldn’t be read with this key. Nothing was changed.',
  };
  const where = mine ? meta!.store : undefined;
  const core = await storeCore();
  let db: Db | null = null;

  if (!created && (where === 'kotlin' || where === 'kotlin-new')) {
    if (!core) return NEEDS_NEWER;
    let fine = false;
    try {
      core.storeOpen!(entry.id, entry.k);
      fine = core.storeGet!(CANARY_KEY) === CANARY;
    } catch (e) {
      console.log('[private] storage: Kotlin store could not be read:', String((e as any)?.message ?? e));
    }
    if (fine && where === 'kotlin-new') {
      // the Kotlin store has opened the folder on a NEW start → it's proven: the old copy can go
      try {
        deleteMMKV(entry.id);
      } catch {
        /* not there */
      }
      opened.delete(entry.id);
      writeMeta({ ...readMeta()!, store: 'kotlin' });
      console.log('[private] storage: folder now fully in the Kotlin core (old copy removed)');
    }
    if (fine) {
      db = kotlinDb(core);
      openCore = core;
    } else if (where === 'kotlin-new') {
      // the old copy is complete and current (written alongside) — use it, try again next time
      console.log('[private] storage: using the old copy; the Kotlin store will be checked again');
      try {
        core.storeClose!();
        core.storeDelete!(entry.id);
      } catch {
        /* best effort */
      }
      writeMeta({ ...readMeta()!, store: undefined });
    } else {
      return unreadable;
    }
  }

  if (!db) {
    if (created && core) {
      // a NEW folder goes straight into the Kotlin store
      try {
        core.storeOpen!(entry.id, entry.k);
        core.storeSet!(CANARY_KEY, CANARY);
        if (core.storeGet!(CANARY_KEY) === CANARY) {
          db = kotlinDb(core);
          openCore = core;
          createdInKotlin = true;
          console.log('[private] storage: new folder made in the Kotlin core');
        }
      } catch (e) {
        console.log('[private] storage: Kotlin store unavailable for the new folder:', String((e as any)?.message ?? e));
      }
    }
  }

  if (!db) {
    const m = openMmkv(entry);
    if (!isMmkv(m)) return m;
    if (created) {
      m.set(CANARY_KEY, CANARY); // the marker is set by finishSetup, AFTER the locked copies exist
      createdInKotlin = false;
    } else if (m.getString(CANARY_KEY) !== CANARY) {
      return unreadable;
    }
    db = m;
    // MOVE: a v3 folder in MMKV, a Kotlin core with storage → copy everything, read every entry back
    const cur = readMeta();
    if (!created && core && cur && cur.id === entry.id && !cur.store) {
      try {
        core.storeDelete!(entry.id); // start clean: a copy left by an interrupted attempt is redone whole
        core.storeOpen!(entry.id, entry.k);
        const kdb = kotlinDb(core);
        const r = copyAll(m, kdb);
        if (r.ok) {
          writeMeta({ ...readMeta()!, store: 'kotlin-new' });
          db = dualDb(kdb, m);
          openCore = core;
          console.log(`[private] storage: ${r.count} entries copied to the Kotlin core and read back — old copy kept until the next start`);
        } else {
          console.log('[private] storage: not moved —', r.why);
          core.storeClose!();
          core.storeDelete!(entry.id);
        }
      } catch (e) {
        console.log('[private] storage: not moved —', String((e as any)?.message ?? e));
      }
    }
  }

  open = db;
  openKey = entry.k;
  currentId = entry.id;
  if (persist.getString(ERASE_REQ)) {
    persist.delete(ERASE_REQ); // 2.0.0-autofill.9: the owner unlocked normally — a pending erase is cancelled
    console.log('[private] erase request cancelled by a normal unlock');
  }
  // 2.0.0-autofill.5: say where the folder is, at every unlock (diagnostics — no names, no values)
  const at = readMeta()?.store;
  // 2.0.0-autofill.6: the autofill service may open this folder only once it is fully in the Kotlin store
  try {
    core?.autofillSync?.(at === 'kotlin' ? entry.id : null);
    syncAutofillPin(at === 'kotlin' ? readMeta() : null); // 2.0.0-autofill.8: the PIN inside autofill
    if (at === 'kotlin') syncAutofillIndex(listPrivate()); // 2.0.0-autofill.9: where to offer
  } catch {
    /* an older core */
  }
  console.log(
    `[private] storage: ${at === 'kotlin' ? 'Kotlin core' : at === 'kotlin-new' ? 'moving (Kotlin + old copy)' : 'old store (MMKV)'}` +
      (core ? '' : ' — this build has no Kotlin storage'),
  );
  // first open after 2.0.0-autofill.3: remember the key check (the key is proven by the canary)
  const m2 = readMeta();
  if (m2 && m2.id === entry.id && !m2.kc) writeMeta({ ...m2, kc: keyCheck(entry.k) });
  // integrity: an item list written by v3 carries a MAC; a changed byte shows up here
  const raw = db.getString(ITEMS);
  const tag = db.getString(ITEMS_MAC);
  tampered = !!(raw && tag && tag !== mac(macKey(entry.k), raw));
  if (raw && !tag) db.set(ITEMS_MAC, mac(macKey(entry.k), raw)); // first open after the update
  return tampered ? { ok: true, created, tampered: true } : { ok: true, created };
}

/**
 * 1.10–1.12 folders only: the phone's lock (fingerprint / face / phone PIN), then the plain key.
 * A v3 folder never opens this way — it goes to unlockWithBiometric / unlockWithPin.
 */
export async function unlockVault(): Promise<UnlockResult> {
  try {
    const mode = vaultMode();
    if (mode === 'v3') return unlockWithBiometric();
    if (mode === 'none') {
      return { ok: false, reason: 'setup', message: 'Set up your private folder: choose a PIN and save your recovery key.' };
    }
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (level === LocalAuthentication.SecurityLevel.NONE) {
      return {
        ok: false,
        reason: 'no-lock',
        message: 'Set a screen lock on your phone first (PIN, pattern or fingerprint) to open your old private folder.',
      };
    }
    const auth = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock private folder',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    if (!auth.success) return { ok: false, reason: 'cancelled', message: 'Private folder stays locked.' };
    const entry = readEntry(await SecureStore.getItemAsync(KEY_NAME));
    if (!entry) {
      // The folder was made, but its key is gone (Keystore cleared). A new key can't read it.
      return {
        ok: false,
        reason: 'key-lost',
        message: 'The private folder’s key is no longer on this phone, so its contents can’t be read. You can delete it and start a new one.',
      };
    }
    return await openWith(entry, false);
  } catch (e: any) {
    return { ok: false, reason: 'error', message: 'Could not open the private folder: ' + String(e?.message ?? e) };
  }
}

/** v3: fingerprint. Android only releases the key after a STRONG biometric. */
export async function unlockWithBiometric(): Promise<UnlockResult> {
  const m = readMeta();
  if (!m) return { ok: false, reason: 'setup', message: 'Set up your private folder first.' };
  if (!m.bio) return { ok: false, reason: 'no-bio', message: 'Enter your PIN.' };
  // 2.0.0-autofill.3: the Kotlin core's fingerprint copy, or the old store's (lib/vaultKeys.ts)
  const b = await Keys.bioOpen();
  if (!b.ok) {
    if (b.reason === 'invalidated') {
      // Android destroyed it (fingerprints changed). The PIN opens; the copy is made again after.
      return {
        ok: false,
        reason: 'bio-changed',
        message: 'Your phone’s fingerprints changed, so fingerprint unlock was reset for safety. Enter your PIN — then it’s set up again.',
      };
    }
    return { ok: false, reason: 'cancelled', message: 'Enter your PIN, or tap Fingerprint to try again.' };
  }
  cleanupLegacy();
  const r = await openWith({ id: m.id, k: b.k }, false);
  if (r.ok && b.confirm) await Keys.bioConfirm(); // the new Kotlin copy proved itself — drop the old one
  if (r.ok && b.fromOld) await Keys.bioMove(b.k); // the key is proven — move the copy (one more touch)
  return r;
}

function readFails(): { n: number; until: number } {
  let f = { n: 0, until: 0 };
  try {
    const j = JSON.parse(persist.getString(FAILS) ?? '');
    f = { n: Number(j.n) || 0, until: Number(j.until) || 0 };
  } catch {
    /* none */
  }
  // 2.0.0-autofill.8: ONE count for the app and autofill — the stricter of the two wins
  try {
    const k = coreNow()?.failsGet?.();
    if (k) f = { n: Math.max(f.n, Number(k.n) || 0), until: Math.max(f.until, Number(k.until) || 0) };
  } catch {
    /* an older core */
  }
  return f;
}

function writeFails(n: number, until: number): void {
  persist.set(FAILS, JSON.stringify({ n, until }));
  try {
    coreNow()?.failsSet?.(n, until);
  } catch {
    /* an older core */
  }
}

function clearFails(): void {
  persist.delete(FAILS);
  try {
    coreNow()?.failsSet?.(0, 0);
  } catch {
    /* an older core */
  }
}

/** Seconds before another PIN may be tried (0 = now). */
export function pinWaitSeconds(now = Date.now()): number {
  const f = readFails();
  return f.until > now ? Math.ceil((f.until - now) / 1000) : 0;
}

/** 2.0.0-autofill.3: the pepper lives in the Kotlin core when it can (lib/vaultKeys.ts moves it). */
async function getPepper(create: boolean): Promise<string | null> {
  const p = await Keys.getPepper();
  if (p || !create) return p;
  const fresh = bytesToHex(getRandomBytes(32));
  await Keys.setPepper(fresh);
  return fresh;
}

/** Try a PIN against the locked copy. Counts wrong tries; returns K or a refusal. */
async function tryPin(pin: string): Promise<{ k: string } | UnlockResult> {
  const m = readMeta();
  if (!m) return { ok: false, reason: 'setup', message: 'Set up your private folder first.' };
  const wait = pinWaitSeconds();
  if (wait > 0) return { ok: false, reason: 'wait', waitSeconds: wait, message: `Too many wrong PINs. Try again in ${showWait(wait)}.` };
  if (!isValidPin(pin)) return { ok: false, reason: 'wrong-pin', message: 'Enter your 6-digit PIN.' };
  const pepper = await getPepper(false);
  if (!pepper) {
    if (await Keys.pepperNeedsNewerBuild()) return NEEDS_NEWER;
    return {
      ok: false,
      reason: 'key-lost',
      message: 'This phone’s security keys were reset, so the PIN can’t open the folder. Use your recovery key.',
    };
  }
  try {
    await checkVaultCore();
    const t0 = Date.now();
    const key = await pinKey(pin, m.salt, pepper, m.n);
    console.log(`[private] PIN check ${Date.now() - t0} ms (${vaultEngine()})`); // timing only — never the PIN
    const k = unsealText(key, m.pin, AAD_PIN);
    clearFails();
    return { k };
  } catch {
    const f = readFails();
    const n = f.n + 1;
    const pause = pinPause(n);
    writeFails(n, pause ? Date.now() + pause * 1000 : 0);
    return {
      ok: false,
      reason: 'wrong-pin',
      waitSeconds: pause || undefined,
      message: pause ? `Wrong PIN. Try again in ${showWait(pause)}.` : `Wrong PIN. ${5 - n > 0 ? `${5 - n} more before a pause.` : ''}`.trim(),
    };
  }
}

/** v3: the MemoAirem PIN. */
export async function unlockWithPin(pin: string): Promise<UnlockResult> {
  const m = readMeta();
  const r = await tryPin(pin);
  if (!('k' in r)) return r;
  cleanupLegacy();
  return await openWith({ id: m!.id, k: r.k }, false);
}

/**
 * v3: the recovery key — for a forgotten PIN or a wiped Keystore. The folder opens; the caller must
 * then ask for a NEW PIN (setPin), which also makes a fresh Keystore secret.
 */
export async function unlockWithRecovery(typed: string): Promise<UnlockResult> {
  const m = readMeta();
  if (!m) return { ok: false, reason: 'setup', message: 'Set up your private folder first.' };
  const code = normalizeRecoveryKey(typed);
  if (!code) return { ok: false, reason: 'wrong-key', message: 'A recovery key is 25 letters and numbers, like ABCDE-12345-…' };
  try {
    const k = unsealText(recoveryWrapKey(code), m.rec, AAD_REC);
    clearFails();
    return await openWith({ id: m.id, k }, false);
  } catch {
    return { ok: false, reason: 'wrong-key', message: 'That recovery key doesn’t open this folder. Check each character.' };
  }
}

function showWait(s: number): string {
  return s < 60 ? `${s} seconds` : s < 3600 ? `${Math.ceil(s / 60)} minutes` : '1 hour';
}

/** Delete the 1.10–1.12 plain key once a v3 folder exists. Best-effort. */
function cleanupLegacy(): void {
  void SecureStore.deleteItemAsync(KEY_NAME).catch(() => {});
}

/**
 * A fresh check before a password is SHOWN or copied. v3 with fingerprint on: a biometric only (the
 * phone's PIN is NOT accepted — the user's choice). Otherwise 'pin': the screen asks for the
 * MemoAirem PIN and calls checkPin. Legacy folders: the phone's lock, as before.
 */
export async function confirmReveal(): Promise<'ok' | 'pin' | 'cancel'> {
  const mode = vaultMode();
  try {
    if (mode === 'v3') {
      if (!biometricOn()) return 'pin';
      const r = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Show password',
        cancelLabel: 'Use PIN',
        disableDeviceFallback: true,
        biometricsSecurityLevel: 'strong',
      });
      return r.success ? 'ok' : 'pin';
    }
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Show password',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return r.success ? 'ok' : 'cancel';
  } catch {
    return mode === 'v3' ? 'pin' : 'cancel';
  }
}

/** The MemoAirem PIN as a re-check (show / copy a password). Wrong tries count. */
export async function checkPin(pin: string): Promise<UnlockResult> {
  const r = await tryPin(pin);
  return 'k' in r ? { ok: true, created: false } : r;
}

/** Close the store. Nothing can be read again until the next unlock. */
export function lockVault(): void {
  open = null;
  try {
    openCore?.storeClose?.();
  } catch {
    /* already closed */
  }
  openCore = null;
  openKey = null;
  tampered = false;
}

/** The last open found the item list changed outside MemoAirem. */
export function wasTampered(): boolean {
  return tampered;
}

function db(): Db {
  if (!open) throw new Error('Private folder is locked');
  return open;
}

/* ---------------- setup (new folder, or a legacy folder moving to v3) ---------------- */

interface PendingSetup {
  pin: string;
  code: string; // normalized recovery key
  restore: BackupPayload | null;
}
let pending: PendingSetup | null = null;

/**
 * Step 1 of setup: remember the PIN, make (or reuse, when restoring a backup) the recovery key and
 * return it to SHOW. Nothing is written until finishSetup — if the app dies here, nothing changed.
 * A legacy folder must be unlocked first (unlockVault) so its key can be moved.
 */
export function beginSetup(pin: string, opts: { recoveryKey?: string; restore?: BackupPayload | null } = {}): string {
  if (!isValidPin(pin)) throw new Error('PIN must be 6 digits');
  const reuse = opts.recoveryKey ? normalizeRecoveryKey(opts.recoveryKey) : null;
  const code = reuse ?? normalizeRecoveryKey(makeRecoveryKey(getRandomBytes(25)))!;
  pending = { pin, code, restore: opts.restore ?? null };
  return formatRecoveryKey(code);
}

export function cancelSetup(): void {
  pending = null;
}

/** The last 5 characters, for "type the last group to show you wrote it down". */
export function recoveryCheckMatches(typed: string): boolean {
  if (!pending) return false;
  const t = typed.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return t === pending.code.slice(-5);
}

/**
 * Step 2: write the locked copies. For a legacy folder that is open, K moves over unchanged (no
 * re-encryption); otherwise a new folder (and, when restoring, the backup's items) is created.
 * `biometric`: also make the fingerprint copy (Android asks for the fingerprint once).
 */
export async function finishSetup(opts: { biometric: boolean }): Promise<UnlockResult & { restored?: number; gemini?: boolean; harbor?: boolean }> {
  if (!pending) return { ok: false, reason: 'error', message: 'Setup was interrupted — start again.' };
  const p = pending;
  try {
    let entry: KeyEntry;
    let created = false;
    if (open && openKey && currentId && vaultMode() === 'legacy') {
      entry = { id: currentId, k: openKey };
    } else {
      if (vaultMode() !== 'none') return { ok: false, reason: 'error', message: 'A private folder already exists.' };
      entry = { id: `vault-${randomChars(12)}`, k: newKey() };
      created = true;
    }
    const pepper = bytesToHex(getRandomBytes(32));
    await Keys.setPepper(pepper);
    const salt = bytesToHex(getRandomBytes(16));
    await checkVaultCore();
    const pk = await pinKey(p.pin, salt, pepper, PIN_SCRYPT_N);
    const meta: Meta = {
      v: 3,
      id: entry.id,
      n: PIN_SCRYPT_N,
      salt,
      pin: sealText(pk, iv12(), entry.k, AAD_PIN),
      rec: sealText(recoveryWrapKey(p.code), iv12(), entry.k, AAD_REC),
      bio: false,
      created: new Date().toISOString(),
      kc: keyCheck(entry.k),
    };
    if (created) {
      const r = await openWith(entry, true);
      if (!r.ok) return r;
      if (createdInKotlin) meta.store = 'kotlin'; // 2.0.0-autofill.4: new folders start in the Kotlin core
    }
    db().set(BACKUP_KEY, bytesToHex(backupKey(p.code)));
    let restored: number | undefined;
    let gemini = false;
    let harbor = false;
    if (p.restore) {
      restored = mergeItems(p.restore);
      const links = applyBackupLinks(p.restore);
      gemini = links.gemini;
      harbor = links.harbor;
    }
    writeMeta(meta); // from here the folder is v3
    if (meta.store === 'kotlin') {
      // 2.0.0-autofill.8: a NEW folder is in the Kotlin store from the start — autofill may use it now
      try {
        (await storeCore())?.autofillSync?.(meta.id);
        syncAutofillIndex(listPrivate()); // 2.0.0-autofill.9 (restored items too)
      } catch {
        /* an older core */
      }
    }
    persist.set(MARKER, '1');
    clearFails();
    await SecureStore.deleteItemAsync(KEY_NAME).catch(() => {});
    pending = null;
    if (opts.biometric) await enableBiometric().catch(() => false); // fingerprint is optional — never fails setup
    return { ok: true, created, restored, gemini, harbor };
  } catch (e: any) {
    return { ok: false, reason: 'error', message: 'Could not finish setting up: ' + String(e?.message ?? e) };
  }
}

/* ---------------- changing the locks (folder open) ---------------- */

function needOpen(): { m: Meta; k: string } {
  const m = readMeta();
  if (!open || !openKey || !m) throw new Error('Private folder is locked');
  return { m, k: openKey };
}

/** New PIN (also after the recovery key). Makes a fresh Keystore secret too. */
export async function setPin(pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error('PIN must be 6 digits');
  const { m, k } = needOpen();
  // voice.38: KEEP the Keystore secret when it's there — the secret question is locked with it too.
  // Only when the Keystore was wiped is a new one made (and the old question can't work any more).
  const had = await getPepper(false);
  const pepper = had ?? (await getPepper(true))!;
  const salt = bytesToHex(getRandomBytes(16));
  await checkVaultCore();
  const pk = await pinKey(pin, salt, pepper, PIN_SCRYPT_N);
  const next: Meta = { ...m, n: PIN_SCRYPT_N, salt, pin: sealText(pk, iv12(), k, AAD_PIN) };
  if (!had) delete next.sq;
  writeMeta(next);
  clearFails();
}

/* ---------------- secret question (voice.38) ---------------- */

/** The question text when one is set (shown on the locked screen), else null. */
export function secretQuestion(): string | null {
  return readMeta()?.sq?.q ?? null;
}

/** Why this question / answer won't do, or null. */
export function secretQuestionProblem(question: string, answer: string, name: string, email: string): string | null {
  if (!name.trim()) return 'Add your name first (Settings → You).';
  return answerProblem(question, answer, name, email);
}

/** Set (or replace) the question. Folder open; uses the name + e-mail given (the profile's). */
export async function setSecretQuestion(question: string, answer: string, name: string, email: string): Promise<void> {
  const problem = secretQuestionProblem(question, answer, name, email);
  if (problem) throw new Error(problem);
  const { m, k } = needOpen();
  const pepper = (await getPepper(true))!;
  const salt = bytesToHex(getRandomBytes(16));
  await checkVaultCore();
  const key = await questionKey(name, email, answer, salt, pepper, QUESTION_SCRYPT_N);
  writeMeta({ ...m, sq: { q: question.trim().slice(0, 160), salt, n: QUESTION_SCRYPT_N, wrap: sealText(key, iv12(), k, AAD_SQ) } });
}

export function removeSecretQuestion(): void {
  const m = readMeta();
  if (!m) return;
  const next = { ...m };
  delete next.sq;
  writeMeta(next);
}

/**
 * Forgot PIN, this phone: name + e-mail + the answer. Wrong tries share the PIN's pauses. The
 * caller then asks for a NEW PIN (setPin).
 */
export async function unlockWithQuestion(name: string, email: string, answer: string): Promise<UnlockResult> {
  const m = readMeta();
  if (!m?.sq) return { ok: false, reason: 'setup', message: 'No secret question is set. Use your recovery key.' };
  const wait = pinWaitSeconds();
  if (wait > 0) return { ok: false, reason: 'wait', waitSeconds: wait, message: `Too many wrong tries. Try again in ${showWait(wait)}.` };
  const pepper = await getPepper(false);
  if (!pepper) {
    if (await Keys.pepperNeedsNewerBuild()) return NEEDS_NEWER;
    return { ok: false, reason: 'key-lost', message: 'This phone’s security keys were reset, so the secret question can’t open the folder. Use your recovery key.' };
  }
  try {
    await checkVaultCore();
    const key = await questionKey(name, email, answer, m.sq.salt, pepper, m.sq.n);
    const k = unsealText(key, m.sq.wrap, AAD_SQ);
    clearFails();
    cleanupLegacy();
    return await openWith({ id: m.id, k }, false);
  } catch {
    const f = readFails();
    const n = f.n + 1;
    const pause = pinPause(n);
    writeFails(n, pause ? Date.now() + pause * 1000 : 0);
    return {
      ok: false,
      reason: 'wrong-key',
      waitSeconds: pause || undefined,
      message: pause
        ? `That didn’t match. Try again in ${showWait(pause)}.`
        : 'That didn’t match. Check your name and e-mail as you set them, and the answer.',
    };
  }
}

/** Fingerprint on: Android asks for the fingerprint once to lock the copy. False if it can't. */
export async function enableBiometric(): Promise<boolean> {
  const { m, k } = needOpen();
  if (!(await strongBiometricReady())) return false;
  const made = await Keys.bioSave(k); // Kotlin core when it can, else the old store
  writeMeta({ ...needOpen().m, bio: made });
  return made;
}

export async function disableBiometric(): Promise<void> {
  const m = readMeta();
  if (m) writeMeta({ ...m, bio: false });
  await Keys.bioDelete();
}

let pendingRotate: string | null = null;

/** A NEW recovery key (the old one stops working once confirmed). Returns it to show. */
export function beginNewRecoveryKey(): string {
  needOpen();
  pendingRotate = normalizeRecoveryKey(makeRecoveryKey(getRandomBytes(25)))!;
  return formatRecoveryKey(pendingRotate);
}

export function newRecoveryCheckMatches(typed: string): boolean {
  if (!pendingRotate) return false;
  const t = typed.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return t === pendingRotate.slice(-5);
}

export function commitNewRecoveryKey(): void {
  const { m, k } = needOpen();
  if (!pendingRotate) throw new Error('No new recovery key');
  writeMeta({ ...m, rec: sealText(recoveryWrapKey(pendingRotate), iv12(), k, AAD_REC) });
  db().set(BACKUP_KEY, bytesToHex(backupKey(pendingRotate)));
  pendingRotate = null;
}

/* ---------------- autofill (2.0.0-autofill.6) ---------------- */

export interface AutofillStatus {
  supported: boolean; // Android 8+
  enabled: boolean; // MemoAirem is the phone's autofill service
  folder: boolean; // the folder is in the Kotlin store, so autofill can open it
  fingerprint: boolean; // fingerprint unlock is kept by the Kotlin core
  pin?: boolean; // 2.0.0-autofill.8: autofill can ask for the PIN (absent on older cores)
  index?: boolean; // 2.0.0-autofill.9: the coded site list is there (absent on older cores)
}

/** Null on a build without the autofill service. */
export async function autofillStatus(): Promise<AutofillStatus | null> {
  const core = await storeCore();
  try {
    return core?.autofillStatus ? core.autofillStatus() : null;
  } catch {
    return null;
  }
}

/** Android's "choose your autofill service" screen. */
export async function autofillOpenSettings(): Promise<boolean> {
  const core = await storeCore();
  try {
    return core?.autofillOpenSettings ? core.autofillOpenSettings() : false;
  } catch {
    return false;
  }
}

/* ---------------- items ---------------- */

export function listPrivate(): Rec[] {
  const raw = db().getString(ITEMS);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as Rec[]) : [];
  } catch {
    return [];
  }
}

function writeItems(items: Rec[]): void {
  const raw = JSON.stringify(items);
  db().set(ITEMS, raw);
  if (openKey) db().set(ITEMS_MAC, mac(macKey(openKey), raw));
  syncAutofillIndex(items);
  rememberDueDocs(items);
}

/** Remember how many documents need attention. The dock reads this while the folder is locked. */
export function rememberDueDocs(items: Rec[]): void {
  const n = dueDocCount(items);
  if (n > 0) persist.set(DUE_DOCS, String(n));
  else persist.delete(DUE_DOCS);
}

/** Documents expired or due within 6 months. 0 until the folder has been opened once on this version. */
export function privateDueCount(): number {
  const n = Number(persist.getString(DUE_DOCS) ?? '0');
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 99) : 0;
}

/**
 * 2.0.0-autofill.9 (user: autofill "keeps bothering me" on sites with nothing saved): the Kotlin core
 * keeps a CODED list of the places that have a login (one-way tags — no names), so the locked
 * autofill service offers "Unlock to fill" only there. Rebuilt at every unlock and every change;
 * only for a folder fully in the Kotlin store (the one autofill can open). null = forget it.
 */
function syncAutofillIndex(items: Rec[] | null): void {
  try {
    const core = indexCore();
    if (!core) return;
    if (items === null) return core.autofillIndexSync!(null);
    if (readMeta()?.store !== 'kotlin') return;
    const sites = items.filter((r) => !isPrivateDoc(r) && !isPrivateNote(r) && r.location && r.notes).map((r) => r.location as string);
    core.autofillIndexSync!(sites);
  } catch {
    /* an older core */
  }
}

function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${randomChars(9)}`;
}

/**
 * A private item is three fields (1.10.2): what it's for, the username, the password — plus an
 * optional photo. Inside the vault they map onto the FIXED record shape: title = what it's for,
 * people = username, notes = password (the password is the only field masked on screen).
 */
export interface PrivateInput {
  /** 1.10.12: 'password' (title / username / password) or 'note' (title / content — ID numbers,
   *  codes, anything). Default: the edited item's kind, else 'password'. */
  kind?: PrivateKind;
  title: string; // what it's for — shown, and spoken by password search
  username: string; // → rec.people — shown, never spoken (password items only)
  password: string; // → rec.notes — masked until tapped, never spoken (password items)
  content?: string; // → rec.notes — the note's text, shown in full once unlocked (note items)
  /** 2.0.0-autofill.1: password items — the website or app (→ rec.location; a web address is kept as its host) */
  site?: string;
  /** voice.28 — DOCUMENT items (see lib/privateDocs.ts for the mapping onto the fixed shape) */
  doc?: { no: string; issued: string | null; expires: string | null; place: string; notes: string; tag?: DocTag | null };
  photo?: PrivatePhoto | null; // a new photo (replaces any old one)
  removePhoto?: boolean; // editing: drop the existing photo
}

export interface PrivatePhoto {
  base64: string; // full image, JPEG, long edge ≤ 2000 px
  thumb: string; // data: URI, 240 px
}

export type PrivateKind = 'password' | 'note' | 'doc';

/** Note items (ID numbers, codes …) are stored with this type; passwords keep "private". */
export const PRIVATE_NOTE_TYPE = 'private-note';

export function isPrivateNote(r: Rec): boolean {
  return r.type === PRIVATE_NOTE_TYPE;
}

/** voice.28: a document (passport, seaman's book …) — lib/privateDocs.ts. */
export function isPrivateDoc(r: Rec): boolean {
  return r.type === PRIVATE_DOC_TYPE;
}

function kindOf(r: Rec | undefined): PrivateKind {
  return !r ? 'password' : isPrivateDoc(r) ? 'doc' : isPrivateNote(r) ? 'note' : 'password';
}

function putPhoto(imageId: string, base64: string): void {
  db().set(IMG(imageId), base64);
  if (openKey) db().set(IMG_MAC(imageId), mac(macKey(openKey), base64));
}

function dropPhoto(imageId: string): void {
  db().remove(IMG(imageId));
  db().remove(IMG_MAC(imageId));
}

/* ---------------- import (2.0.0-autofill.7) ---------------- */

export interface ImportReport {
  added: number;
  duplicates: number; // same site + username already in the folder (or twice in the file) — skipped
  notesLeftOut: number; // added logins whose note couldn't come along (a password item has no notes field)
}

/**
 * Add logins from a password export (lib/importCsv.ts) — ONE write for all of them. A login whose
 * site + username is already in the folder is skipped (the folder's copy is kept as it is).
 */
export function importLogins(list: { title: string; site: string | null; username: string; password: string; hasNote: boolean }[]): ImportReport {
  const items = listPrivate();
  const keyOf = (site: string | null | undefined, user: string | null | undefined, title: string, pass: string) =>
    site || user ? `s:${(site ?? '').toLowerCase()}\u0000${(user ?? '').toLowerCase()}` : `t:${title.toLowerCase()}\u0000${pass}`;
  const have = new Set(items.filter((r) => r.type === 'private').map((r) => keyOf(r.location, r.people, r.title, r.notes ?? '')));
  const add: Rec[] = [];
  let duplicates = 0;
  let notesLeftOut = 0;
  for (const l of list) {
    if (!l.password) continue;
    const k = keyOf(l.site, l.username, l.title, l.password);
    if (have.has(k)) {
      duplicates++;
      continue;
    }
    have.add(k);
    if (l.hasNote) notesLeftOut++;
    add.push({
      id: newId('p'),
      type: 'private',
      title: (l.title || l.site || 'Login').slice(0, 200),
      date: null,
      time: null,
      location: l.site || null,
      people: l.username || null,
      notes: l.password,
      via: 'private',
      imageId: null,
      thumb: null,
    });
  }
  if (add.length) writeItems([...add, ...items]);
  return { added: add.length, duplicates, notesLeftOut };
}

/** Add a new private item, or update `editingId`. Returns the stored record. */
export function savePrivate(input: PrivateInput, editingId?: string | null): Rec | null {
  const items = listPrivate();
  const prior = editingId ? items.find((r) => r.id === editingId) : undefined;
  const kind: PrivateKind = input.kind ?? kindOf(prior);
  const title = input.title.trim();
  const doc = kind === 'doc' ? input.doc ?? { no: '', issued: null, expires: null, place: '', notes: '' } : null;
  const username = doc ? doc.no.trim() : kind === 'note' ? '' : input.username.trim();
  const notes = doc ? packDocNotes(doc.issued, doc.notes, doc.tag) ?? '' : (kind === 'note' ? input.content ?? '' : input.password).trim();
  const place = doc ? doc.place.trim() : kind === 'password' ? normalizeSite(input.site) ?? '' : '';
  if (!title && !username && !notes && !place && !doc?.expires && !input.photo) return null;

  let imageId = prior?.imageId ?? null;
  let thumb = prior?.thumb ?? null;
  if ((input.removePhoto || input.photo) && imageId) {
    dropPhoto(imageId);
    imageId = null;
    thumb = null;
  }
  if (input.photo) {
    imageId = newId('pi');
    putPhoto(imageId, input.photo.base64);
    thumb = input.photo.thumb;
  }

  const rec: Rec = {
    id: prior?.id ?? newId('p'),
    type: kind === 'doc' ? PRIVATE_DOC_TYPE : kind === 'note' ? PRIVATE_NOTE_TYPE : 'private',
    // Never fall back to the note for a title: titles are shown in lists and SPOKEN by password
    // search, the note may be the password or ID number itself (1.10.2).
    title: (
      title ||
      (input.photo || prior?.imageId ? 'Photo' : kind === 'doc' ? 'Document' : kind === 'note' ? 'Private note' : 'Private item')
    ).slice(0, 200),
    date: doc?.expires ?? null, // documents: the EXPIRY date (sorting + the in-folder warning)
    time: null,
    location: place || null, // documents: place of issue
    people: username || null,
    notes: notes || null,
    via: 'private',
    imageId,
    thumb,
  };
  writeItems(prior ? items.map((r) => (r.id === rec.id ? rec : r)) : [rec, ...items]);
  return rec;
}

export function removePrivate(id: string): void {
  const items = listPrivate();
  const gone = items.find((r) => r.id === id);
  if (gone?.imageId) dropPhoto(gone.imageId);
  writeItems(items.filter((r) => r.id !== id));
  try {
    db().trim();
  } catch {
    /* best-effort */
  }
}

/** The full-size photo as a data: URI, for viewing inside the unlocked folder only. Null if changed. */
export function privatePhoto(imageId: string | null): string | null {
  if (!imageId) return null;
  const b = db().getString(IMG(imageId));
  if (!b) return null;
  const tag = db().getString(IMG_MAC(imageId));
  if (openKey) {
    if (!tag) putPhoto(imageId, b); // first view after the update: protect it from now on
    else if (tag !== mac(macKey(openKey), b)) return null;
  }
  return 'data:image/jpeg;base64,' + b;
}

/* ---------------- backup file ---------------- */

/** What a backup carries: every item, every full photo, and the phone's Gemini key and Harbor link. */
export interface BackupPayload {
  items: Rec[];
  imgs: Record<string, string>;
  link?: AiLink;
  harbor?: SyncConfig;
}

function backupLinks(): Pick<BackupPayload, 'link' | 'harbor'> {
  const link = loadAiLink();
  const harbor = loadSyncConfig();
  return {
    ...(link.apiKey ? { link } : {}),
    ...(harbor ? { harbor } : {}),
  };
}

function keptLinks(raw: { link?: Partial<AiLink>; harbor?: Partial<SyncConfig> }): Pick<BackupPayload, 'link' | 'harbor'> {
  const apiKey = (raw.link?.apiKey ?? '').trim();
  const model = (raw.link?.model ?? '').trim();
  const baseUrl = (raw.harbor?.baseUrl ?? '').trim().replace(/\/+$/, '');
  const harborKey = (raw.harbor?.apiKey ?? '').trim();
  return {
    ...(apiKey ? { link: { provider: 'gemini' as const, apiKey, model: model || 'gemini-2.5-flash' } } : {}),
    ...(baseUrl && harborKey ? { harbor: { baseUrl, apiKey: harborKey } } : {}),
  };
}

/** Write a backup's Gemini key and Harbor link onto this phone. Empty fields are left as they are. */
export function applyBackupLinks(p: BackupPayload): { gemini: boolean; harbor: boolean } {
  const kept = keptLinks(p);
  if (kept.link) saveAiLink(kept.link);
  if (kept.harbor) saveSyncConfig(kept.harbor);
  return { gemini: !!kept.link, harbor: !!kept.harbor };
}

/** The encrypted backup file's text (folder open). Readable only with the recovery key. */
export function exportBackup(owner: { name: string; email: string } | null): string {
  needOpen();
  const keyHex = db().getString(BACKUP_KEY);
  if (!keyHex) throw new Error('No backup key — make a new recovery key first.');
  const items = listPrivate();
  const imgs: Record<string, string> = {};
  for (const r of items) {
    if (r.imageId) {
      const b = db().getString(IMG(r.imageId));
      if (b) imgs[r.imageId] = b;
    }
  }
  const header: BackupHeader = { app: 'MemoAirem', v: 1, created: new Date().toISOString(), owner };
  persist.set(BACKUP_AT, String(Date.now())); // 2.0.0-autofill.9: for the delete warning (a time only)
  return packBackup(hexToBytes(keyHex), iv12(), header, JSON.stringify({ items, imgs, ...backupLinks() } satisfies BackupPayload));
}

export type ReadBackup =
  | { ok: true; payload: BackupPayload; header: BackupHeader }
  | { ok: false; message: string };

/** Open a backup file with the recovery key typed. Nothing is written. */
export function readBackup(text: string, typedKey: string): ReadBackup {
  const code = normalizeRecoveryKey(typedKey);
  if (!code) return { ok: false, message: 'A recovery key is 25 letters and numbers, like ABCDE-12345-…' };
  const r = openBackup(backupKey(code), text);
  if (!r.ok) {
    return {
      ok: false,
      message: r.reason === 'not-a-backup' ? 'That file isn’t a MemoAirem private backup.' : 'That recovery key doesn’t open this backup.',
    };
  }
  try {
    const p = JSON.parse(r.payload) as BackupPayload;
    if (!Array.isArray(p.items)) throw new Error('bad');
    return { ok: true, payload: { items: p.items, imgs: p.imgs ?? {}, ...keptLinks(p) }, header: r.header };
  } catch {
    return { ok: false, message: 'That backup is damaged.' };
  }
}

/** Add a backup's items to the OPEN folder; ones already here (same id) are skipped. Returns how many were added. */
export function mergeItems(p: BackupPayload): number {
  const items = listPrivate();
  const have = new Set(items.map((r) => r.id));
  const add: Rec[] = [];
  for (const r of p.items) {
    if (!r || typeof r.id !== 'string' || have.has(r.id)) continue;
    const photo = r.imageId ? p.imgs[r.imageId] : undefined;
    if (r.imageId && photo) putPhoto(r.imageId, photo);
    add.push({ ...r, via: 'private', imageId: r.imageId && photo ? r.imageId : null });
  }
  if (add.length) writeItems([...add, ...items]);
  return add.length;
}

/* ---------------- delete ---------------- */

/**
 * Delete the whole private folder: every item and photo, its storage files, every key and copy, and
 * the marker. Works while LOCKED too (for a lost key and a forgotten PIN + recovery key).
 */
/* ---------------- deleting safely (2.0.0-autofill.9) ---------------- */

const BACKUP_AT = 'vault_backup_at';
const ERASE_REQ = 'vault_erase_request';
/** From the LOCKED screen the folder can be erased only a day after asking (a normal unlock cancels). */
export const ERASE_WAIT_MS = 24 * 3600 * 1000;

/** When a backup file was last made on this phone (null = never). */
export function lastBackupAt(): number | null {
  const n = Number(persist.getString(BACKUP_AT));
  return n > 0 ? n : null;
}

/** An erase asked for from the locked screen: when, and how long until it may run (0 = now). */
export function eraseRequest(now = Date.now()): { since: number; readyIn: number } | null {
  const since = Number(persist.getString(ERASE_REQ));
  if (!(since > 0)) return null;
  return { since, readyIn: Math.max(0, since + ERASE_WAIT_MS - now) };
}

export function startEraseRequest(now = Date.now()): void {
  if (!eraseRequest(now)) persist.set(ERASE_REQ, String(now));
}

export function cancelEraseRequest(): void {
  persist.delete(ERASE_REQ);
}

export async function deleteVault(): Promise<void> {
  lockVault();
  pending = null;
  pendingRotate = null;
  let entry: KeyEntry | null = null;
  try {
    entry = readEntry(await SecureStore.getItemAsync(KEY_NAME));
  } catch {
    entry = null;
  }
  const ids = new Set<string>([LEGACY_ID]);
  if (entry) ids.add(entry.id);
  const m = readMeta();
  if (m) ids.add(m.id);
  if (currentId) ids.add(currentId);
  const core = await storeCore();
  for (const id of ids) {
    try {
      deleteMMKV(id);
    } catch {
      /* not there — nothing to remove */
    }
    opened.delete(id);
    try {
      core?.storeDelete?.(id); // 2.0.0-autofill.4: the Kotlin core's copy too
    } catch {
      /* not there */
    }
  }
  try {
    core?.autofillSync?.(null); // 2.0.0-autofill.6: autofill has no folder to open any more
    syncAutofillPin(null); // 2.0.0-autofill.8: nor the PIN's locked copy
    syncAutofillIndex(null); // 2.0.0-autofill.9: nor the coded site list and its secret
  } catch {
    /* an older core */
  }
  currentId = null;
  await SecureStore.deleteItemAsync(KEY_NAME).catch(() => {});
  await Keys.deleteAllKeys(); // both stores: Kotlin core + the old expo-secure-store copies
  persist.delete(META);
  clearFails();
  persist.delete(MARKER);
  persist.delete(ERASE_REQ);
  persist.delete(BACKUP_AT);
  persist.delete(DUE_DOCS);
}

/* ---------------- photos ---------------- */

/**
 * Turn a camera / picker image into a private photo. The stored picture keeps the original
 * pixels (a JPEG is kept as shot; anything else is saved as JPEG at full size). The card uses a
 * 240 px picture. Every temporary file is deleted, so no readable copy is left outside the
 * encrypted store. A photo picked from the gallery still exists in the gallery.
 */
export async function preparePrivatePhoto(uri: string): Promise<PrivatePhoto | null> {
  const temp: string[] = [];
  try {
    const raw = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
    let full = raw;
    if (!raw.startsWith('/9j/')) {
      const src = await ImageManipulator.manipulate(uri).renderAsync();
      const saved = await src.saveAsync({ base64: true, compress: 1, format: SaveFormat.JPEG });
      if (saved.uri) temp.push(saved.uri);
      if (!saved.base64) return null;
      full = saved.base64;
    }
    const small = await ImageManipulator.manipulate(uri).resize({ width: 240 }).renderAsync();
    const th = await small.saveAsync({ base64: true, compress: 0.6, format: SaveFormat.JPEG });
    if (th.uri) temp.push(th.uri);
    if (!th.base64) return null;
    return { base64: full, thumb: 'data:image/jpeg;base64,' + th.base64 };
  } catch {
    return null;
  } finally {
    await Promise.all(
      [uri, ...temp].map((u) => (u && u.startsWith('file:') ? deleteAsync(u, { idempotent: true }).catch(() => {}) : null)),
    );
  }
}
