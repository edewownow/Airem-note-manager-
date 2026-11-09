/**
 * 2.0.0-autofill.3 (autofill plan phase 1c) — WHO keeps the vault's two phone-bound secrets:
 *   - the PEPPER (32 random bytes mixed into the PIN and secret-question keys), and
 *   - the FINGERPRINT copy of the folder key.
 * Until now: expo-secure-store. From now: the Kotlin vault core (modules/memoairem-vault,
 * VaultKeys.kt), on Android's own Keystore — the step the autofill service needs.
 *
 * MOVING OVER, safely, one secret at a time (state in plain storage "vault_keys", no secrets):
 *   - pepper: the next time it is needed, the SAME value is written to Kotlin and READ BACK; only an
 *     exact match moves it (and deletes the old copy). No module, a v1 module, a failed self-check,
 *     an error or a mismatch → it stays where it was. The value never changes, so no PIN or answer
 *     has to be re-entered and nothing about the folder changes.
 *   - fingerprint: Android only lets a fingerprint-bound copy be made WITH a fingerprint, so it moves
 *     on a fingerprint unlock: the old copy opens the folder, then one more touch makes the Kotlin
 *     copy ("kotlin-new"). The old copy is kept until the Kotlin one has opened the folder once.
 * Every function here returns a result; none throws.
 */
import * as SecureStore from 'expo-secure-store';
import { persist } from './persist';
import { keyCore } from './vaultNative';

const PEPPER_NAME = 'memoairem_vault_pepper'; // expo-secure-store (1.13 – 2.0.0-autofill.2)
const BIO_NAME = 'memoairem_vault_bio'; // expo-secure-store, requireAuthentication
const AT = 'vault_keys'; // {"pepper":"kotlin","bio":"kotlin"|"kotlin-new"} — where each one lives now

type Where = { pepper?: 'kotlin'; bio?: 'kotlin' | 'kotlin-new' };

function where(): Where {
  try {
    return JSON.parse(persist.getString(AT) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
function setWhere(w: Where): void {
  if (!w.pepper && !w.bio) persist.delete(AT);
  else persist.set(AT, JSON.stringify(w));
}

const isPepper = (p: string | null | undefined): p is string => !!p && /^[0-9a-f]{64}$/.test(p);

/** "kotlin" or "expo" — for the logs and the tests. */
export function keysAt(): { pepper: string; bio: string } {
  const w = where();
  return { pepper: w.pepper ?? 'expo', bio: w.bio ?? 'expo' };
}

/* ---------------- pepper ---------------- */

/** Write to Kotlin and read back. True only when the copy there is exact. */
async function moveToKotlin(value: string): Promise<boolean> {
  const core = await keyCore();
  if (!core) return false;
  try {
    await core.secretPut!('pepper', value);
    const back = await core.secretGet!('pepper');
    if (back !== value) {
      console.log('[private] keys: Kotlin read-back differed — pepper stays in the old store');
      return false;
    }
    setWhere({ ...where(), pepper: 'kotlin' });
    await SecureStore.deleteItemAsync(PEPPER_NAME).catch(() => {});
    console.log('[private] keys: PIN secret now kept by the Kotlin core');
    return true;
  } catch (e) {
    console.log('[private] keys: Kotlin could not take the PIN secret:', String((e as any)?.message ?? e));
    return false;
  }
}

/** The pepper, or null when it's gone (Keystore reset → the recovery key is the way in). */
export async function getPepper(): Promise<string | null> {
  const w = where();
  if (w.pepper === 'kotlin') {
    const core = await keyCore();
    const v = core ? await core.secretGet!('pepper').catch(() => null) : null;
    if (isPepper(v)) return v;
    const old = await SecureStore.getItemAsync(PEPPER_NAME).catch(() => null); // belt and braces
    if (isPepper(old)) return old;
    if (!core) {
      // a build without the Kotlin core can't read it — the value is still safe in Kotlin's store
      console.log('[private] keys: the PIN secret is in the Kotlin core, which this build lacks');
    }
    return null;
  } else {
    const p = await SecureStore.getItemAsync(PEPPER_NAME).catch(() => null);
    if (isPepper(p)) {
      await moveToKotlin(p); // best effort — p is returned either way
      return p;
    }
    return null;
  }
}

/** The pepper is held by the Kotlin core, but this build has none (an older build) — not a reset. */
export async function pepperNeedsNewerBuild(): Promise<boolean> {
  return where().pepper === 'kotlin' && !(await keyCore());
}

/** Store a NEW pepper (setup; a Keystore that was wiped). Kotlin when it can, else the old store. */
export async function setPepper(value: string): Promise<void> {
  if (await moveToKotlin(value)) return;
  await SecureStore.setItemAsync(PEPPER_NAME, value);
  const w = where();
  delete w.pepper;
  setWhere(w);
}

/* ---------------- fingerprint copy of the folder key ---------------- */

/** fromOld = opened from the expo-secure-store copy → move it once the folder has opened (bioMove). */
/** confirm = the first open of a new Kotlin copy → call bioConfirm once the folder has opened. */
export type BioOpen = { ok: true; k: string; fromOld?: boolean; confirm?: boolean } | { ok: false; reason: 'invalidated' | 'cancelled' | 'error' };

const codeOf = (e: any): string => String(e?.code ?? e?.message ?? e);

/** Make the fingerprint copy (Android asks for the fingerprint). True when made. */
export async function bioSave(k: string, title = 'Turn on fingerprint unlock'): Promise<boolean> {
  const core = await keyCore();
  if (core && core.bioAvailable!()) {
    try {
      await core.bioSave!(k, title);
      setWhere({ ...where(), bio: 'kotlin-new' });
      console.log('[private] keys: fingerprint copy made by the Kotlin core');
      return true;
    } catch (e) {
      const c = codeOf(e);
      if (/CANCELLED|LOCKOUT/.test(c)) return false;
      console.log('[private] keys: Kotlin fingerprint copy failed (' + c + ') — using the old store');
    }
  }
  try {
    await SecureStore.setItemAsync(BIO_NAME, k, { requireAuthentication: true, authenticationPrompt: title });
    const w = where();
    delete w.bio;
    setWhere(w);
    return true;
  } catch {
    return false;
  }
}

async function openOld(): Promise<BioOpen> {
  try {
    const k = await SecureStore.getItemAsync(BIO_NAME, { requireAuthentication: true, authenticationPrompt: 'Unlock private folder' });
    return k ? { ok: true, k } : { ok: false, reason: 'invalidated' };
  } catch {
    return { ok: false, reason: 'cancelled' };
  }
}

/** Open the fingerprint copy (Kotlin's, else the old store's — then fromOld). */
export async function bioOpen(): Promise<BioOpen> {
  const w = where();
  const core = await keyCore();
  if (w.bio && core) {
    try {
      const k = await core.bioOpen!('Unlock private folder');
      return { ok: true, k, confirm: w.bio === 'kotlin-new' };
    } catch (e) {
      const c = codeOf(e);
      if (/CANCELLED|LOCKOUT/.test(c)) return { ok: false, reason: 'cancelled' };
      if (/INVALIDATED|NONE/.test(c)) {
        // a fingerprint was added (Android destroyed the key). An old copy made BEFORE the move
        // was destroyed by the same change, so the PIN is the way in — as before.
        const x = where();
        delete x.bio;
        setWhere(x);
        return { ok: false, reason: 'invalidated' };
      }
      console.log('[private] keys: Kotlin fingerprint open failed (' + c + ')');
      if (w.bio === 'kotlin-new') {
        const old = await openOld(); // the old copy is still there
        return old.ok ? { ...old, fromOld: true } : old;
      }
      return { ok: false, reason: 'error' };
    }
  }
  if (w.bio === 'kotlin') {
    // a build without the Kotlin core: its fingerprint copy can't be read here
    return { ok: false, reason: 'error' };
  }
  const r = await openOld();
  return r.ok ? { ...r, fromOld: true } : r;
}

/** The new Kotlin copy has OPENED the folder (key proven): now the old copy can go. */
export async function bioConfirm(): Promise<void> {
  if (where().bio !== 'kotlin-new') return;
  setWhere({ ...where(), bio: 'kotlin' });
  await SecureStore.deleteItemAsync(BIO_NAME, { requireAuthentication: true }).catch(() => {});
  console.log('[private] keys: fingerprint unlock now fully on the Kotlin core');
}

/**
 * After a fingerprint unlock from the OLD store has opened the folder (so the key is proven right):
 * one more touch makes the Kotlin copy. The old copy stays until the Kotlin one has opened it once.
 */
export async function bioMove(k: string): Promise<boolean> {
  const core = await keyCore();
  if (!core || !core.bioAvailable!()) return false;
  return bioSave(k, 'Touch again to finish the security update');
}

export async function bioDelete(): Promise<void> {
  const core = await keyCore();
  if (core) await core.bioDelete!().catch(() => {});
  await SecureStore.deleteItemAsync(BIO_NAME, { requireAuthentication: true }).catch(() => {});
  const w = where();
  delete w.bio;
  setWhere(w);
}

/** Everything, both stores (Delete private folder). */
export async function deleteAllKeys(): Promise<void> {
  const core = await keyCore();
  if (core) {
    await core.secretDelete!('pepper').catch(() => {});
    await core.bioDelete!().catch(() => {});
  }
  await SecureStore.deleteItemAsync(PEPPER_NAME).catch(() => {});
  await SecureStore.deleteItemAsync(BIO_NAME, { requireAuthentication: true }).catch(() => {});
  persist.delete(AT);
}
