/**
 * Private folder v3 crypto (1.13.0) — pure functions, no React Native imports, so the node sims test
 * exactly what runs on the phone. Pure JS (@noble, audited, no native rebuild).
 *
 * The folder's own key (K, the MMKV AES-256 key, unchanged since 1.10) is never stored in the open.
 * It is kept in three LOCKED COPIES ("wraps"), each AES-256-GCM (tamper-proof: a changed byte fails):
 *   - fingerprint: Android Keystore entry that only opens after a STRONG biometric (lib/vault.ts)
 *   - PIN:        key = HKDF( scrypt(6-digit PIN, salt) ‖ pepper ). The pepper is 32 random bytes
 *                 in the Keystore — so a copied app file alone can't be PIN-guessed off the phone.
 *   - recovery:   key = HKDF( 25-character recovery key ≈ 125 random bits ). Needs nothing from the
 *                 phone, so it still opens the folder when the Keystore is wiped.
 * The backup file is encrypted with a key that is ALSO derived from the recovery key, so a backup
 * made on this phone opens on a new phone with the key you wrote down — and nothing else.
 */
import { gcm } from '@noble/ciphers/aes';
import { scryptAsync } from '@noble/hashes/scrypt';
import { hkdf } from '@noble/hashes/hkdf';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha2';
import { utf8ToBytes, bytesToHex, hexToBytes, concatBytes } from '@noble/hashes/utils';

export { bytesToHex, hexToBytes };

/**
 * 2.0.0-autofill.2: WHO runs scrypt (the slow part of the PIN / secret-question check). JavaScript
 * (@noble) by default; lib/vaultNative.ts swaps in the Kotlin vault core once it has proven, at
 * this start, that it gives the very same bytes. Same inputs → same key either way.
 */
export type ScryptFn = (password: Uint8Array, salt: Uint8Array, opts: { N: number; r: number; p: number; dkLen: number }) => Promise<Uint8Array>;
export const jsScrypt: ScryptFn = (password, salt, opts) => scryptAsync(password, salt, opts);
let runScrypt: ScryptFn = jsScrypt;
export function useScrypt(fn: ScryptFn): void {
  runScrypt = fn;
}

/** scrypt cost for the PIN. Stored with each wrap, so it can be raised later without breaking old ones. */
export const PIN_SCRYPT_N = 1 << 14;
export const PIN_LENGTH = 6;

const SALT = utf8ToBytes('memoairem-private');
const enc = (s: string) => utf8ToBytes(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

/* ---------------- base64 (no Buffer on Hermes; fast enough for multi-MB backups) ---------------- */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_REV = (() => {
  const t = new Int16Array(256).fill(-1);
  for (let i = 0; i < 64; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

export function toB64(b: Uint8Array): string {
  const parts: string[] = [];
  const CHUNK = 3 * 4096;
  for (let off = 0; off < b.length; off += CHUNK) {
    const end = Math.min(off + CHUNK, b.length);
    let s = '';
    for (let i = off; i < end; i += 3) {
      const n = (b[i] << 16) | ((i + 1 < end ? b[i + 1] : 0) << 8) | (i + 2 < end ? b[i + 2] : 0);
      s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < end ? B64[(n >> 6) & 63] : '=') + (i + 2 < end ? B64[n & 63] : '=');
    }
    parts.push(s);
  }
  return parts.join('');
}

export function fromB64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64_REV[clean.charCodeAt(i)];
    const b = B64_REV[clean.charCodeAt(i + 1)];
    const c = i + 2 < clean.length ? B64_REV[clean.charCodeAt(i + 2)] : -1;
    const d = i + 3 < clean.length ? B64_REV[clean.charCodeAt(i + 3)] : -1;
    const n = (a << 18) | (b << 12) | ((c < 0 ? 0 : c) << 6) | (d < 0 ? 0 : d);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (c >= 0 && o < out.length) out[o++] = (n >> 8) & 255;
    if (d >= 0 && o < out.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

/* ---------------- AES-256-GCM ---------------- */

export interface Sealed {
  iv: string; // hex, 12 bytes
  ct: string; // base64, ciphertext + 16-byte tag
}

/** `iv` must be 12 FRESH random bytes per call (the caller passes them — Hermes has no getRandomValues). */
export function seal(key: Uint8Array, iv: Uint8Array, plain: Uint8Array, aad: string): Sealed {
  return { iv: bytesToHex(iv), ct: toB64(gcm(key, iv, enc(aad)).encrypt(plain)) };
}

/** Throws when the key is wrong or anything was changed. */
export function unseal(key: Uint8Array, s: Sealed, aad: string): Uint8Array {
  return gcm(key, hexToBytes(s.iv), enc(aad)).decrypt(fromB64(s.ct));
}

export const sealText = (key: Uint8Array, iv: Uint8Array, text: string, aad: string) => seal(key, iv, enc(text), aad);
export const unsealText = (key: Uint8Array, s: Sealed, aad: string) => dec(unseal(key, s, aad));

/* ---------------- PIN ---------------- */

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

/** A PIN anyone would try first — refused at setup. */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true; // 000000, 111111 …
  const up = '01234567890';
  const down = '09876543210';
  if (up.includes(pin) || down.includes(pin)) return true; // 123456, 654321 …
  return ['121212', '112233', '123123', '696969', '159753', '147258', '258456'].includes(pin);
}

export async function pinKey(pin: string, saltHex: string, pepperHex: string, n: number = PIN_SCRYPT_N): Promise<Uint8Array> {
  const slow = await runScrypt(enc(pin), hexToBytes(saltHex), { N: n, r: 8, p: 1, dkLen: 32 });
  return hkdf(sha256, concatBytes(slow, hexToBytes(pepperHex)), SALT, 'pin-wrap v3', 32);
}

/* ---------------- secret question (voice.38) ---------------- */

/**
 * The user's design: name + e-mail + the answer to ONE secret question opens the folder when the PIN
 * is forgotten — on THIS phone only. Name and e-mail add no secrecy (others know them); the answer
 * does. So the key also takes the Keystore pepper (like the PIN): the files alone can't be guessed
 * off the phone, and every try goes through the app's pauses. It never opens a backup file.
 */
export const QUESTION_SCRYPT_N = 1 << 15;

/** "Ocean Star!" = "ocean   star" = "OCEANSTAR" — capitals, spaces and punctuation don't matter. */
export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // accents: "Peñafrancia" = "penafrancia"
    .replace(/[^a-z0-9]/g, '');
}

const COMMON_ANSWERS = new Set([
  '123', '1234', '12345', '123456', 'password', 'secret', 'none', 'na', 'nothing', 'idk', 'yes', 'no',
  'test', 'abc', 'qwerty', 'god', 'jesus', 'love', 'mama', 'papa', 'mom', 'dad', 'philippines', 'manila',
]);

/** Why this answer is too weak, or null when it's fine. */
export function answerProblem(question: string, answer: string, name: string, email: string): string | null {
  const a = normalizeAnswer(answer);
  if (normalizeAnswer(question).length < 8) return 'Write a question of at least a few words.';
  if (a.length < 4) return 'The answer needs at least 4 letters or numbers.';
  if (COMMON_ANSWERS.has(a)) return 'That answer is too easy to guess.';
  if (/^(\d)\1+$/.test(a)) return 'That answer is too easy to guess.';
  const n = normalizeAnswer(name);
  const e = normalizeAnswer(email.split('@')[0] ?? '');
  if ((n && (a === n || n.includes(a))) || (e && (a === e || e.includes(a)))) return 'The answer can’t be your name or e-mail.';
  if (normalizeAnswer(question).includes(a)) return 'The answer can’t be words from the question.';
  return null;
}

export async function questionKey(name: string, email: string, answer: string, saltHex: string, pepperHex: string, n: number = QUESTION_SCRYPT_N): Promise<Uint8Array> {
  const input = `${normalizeAnswer(name)}\u0000${email.trim().toLowerCase()}\u0000${normalizeAnswer(answer)}`;
  const slow = await runScrypt(enc(input), hexToBytes(saltHex), { N: n, r: 8, p: 1, dkLen: 32 });
  return hkdf(sha256, concatBytes(slow, hexToBytes(pepperHex)), SALT, 'question-wrap v3', 32);
}

/* ---------------- recovery key ---------------- */

/** Crockford base32 — no I, L, O, U, so it can't be misread when written down. */
const RK_ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const RECOVERY_CHARS = 25; // 25 × 5 bits = 125 random bits

/** 25 random bytes in → "K7M2Q-…" (5 groups of 5). Each byte & 31 is uniform (256 = 8 × 32). */
export function makeRecoveryKey(random: Uint8Array): string {
  if (random.length < RECOVERY_CHARS) throw new Error('need 25 random bytes');
  let s = '';
  for (let i = 0; i < RECOVERY_CHARS; i++) s += RK_ALPHA[random[i] & 31];
  return formatRecoveryKey(s);
}

/** What was typed → the 25 characters, or null. Forgives spaces, dashes, lower case, O/0 and I/L/1. */
export function normalizeRecoveryKey(typed: string): string | null {
  const s = typed
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (s.length !== RECOVERY_CHARS) return null;
  for (const c of s) if (!RK_ALPHA.includes(c)) return null;
  return s;
}

export function formatRecoveryKey(s: string): string {
  return (s.match(/.{1,5}/g) ?? []).join('-');
}

export function recoveryWrapKey(normalized: string): Uint8Array {
  return hkdf(sha256, enc(normalized), SALT, 'recovery-wrap v3', 32);
}

export function backupKey(normalized: string): Uint8Array {
  return hkdf(sha256, enc(normalized), SALT, 'backup v1', 32);
}

/* ---------------- integrity of the stored items ---------------- */

/** MMKV's own encryption (AES-CFB) hides the data but can't tell if it was changed — this can. */
export function macKey(folderKey: string): Uint8Array {
  return hkdf(sha256, enc(folderKey), SALT, 'items-mac v3', 32);
}

export function mac(key: Uint8Array, text: string): string {
  return bytesToHex(hmac(sha256, key, enc(text)));
}

/* ---------------- backup file ---------------- */

export const BACKUP_MAGIC = 'memoairem_private_backup';

export interface BackupHeader {
  app: 'MemoAirem';
  v: 1;
  created: string; // ISO
  owner: { name: string; email: string } | null;
}

export interface BackupFile {
  [BACKUP_MAGIC]: 1;
  h: string; // the header as JSON — authenticated (any change → won't open)
  iv: string;
  ct: string;
}

export function packBackup(key: Uint8Array, iv: Uint8Array, header: BackupHeader, payload: string): string {
  const h = JSON.stringify(header);
  const s = seal(key, iv, enc(payload), h);
  const file: BackupFile = { [BACKUP_MAGIC]: 1, h, iv: s.iv, ct: s.ct };
  return JSON.stringify(file);
}

export type OpenBackup =
  | { ok: true; header: BackupHeader; payload: string }
  | { ok: false; reason: 'not-a-backup' | 'wrong-key' };

export function readBackupHeader(text: string): BackupHeader | null {
  try {
    const f = JSON.parse(text) as BackupFile;
    if (!f || f[BACKUP_MAGIC] !== 1 || typeof f.h !== 'string') return null;
    return JSON.parse(f.h) as BackupHeader;
  } catch {
    return null;
  }
}

export function openBackup(key: Uint8Array, text: string): OpenBackup {
  let f: BackupFile;
  try {
    f = JSON.parse(text);
    if (!f || f[BACKUP_MAGIC] !== 1 || typeof f.h !== 'string' || typeof f.iv !== 'string' || typeof f.ct !== 'string') {
      return { ok: false, reason: 'not-a-backup' };
    }
  } catch {
    return { ok: false, reason: 'not-a-backup' };
  }
  try {
    const payload = dec(unseal(key, { iv: f.iv, ct: f.ct }, f.h));
    return { ok: true, header: JSON.parse(f.h), payload };
  } catch {
    return { ok: false, reason: 'wrong-key' };
  }
}

/* ---------------- wrong-PIN pauses ---------------- */

/** Seconds to wait after the n-th wrong PIN in a row: 4 free tries, then longer and longer. Never wipes. */
export function pinPause(fails: number): number {
  if (fails < 5) return 0;
  return [30, 60, 300, 900][fails - 5] ?? 3600;
}
