/**
 * Test vectors for the Kotlin vault core (2.0.0-autofill.2) — produced by the REAL JS code
 * (src/lib/vaultCrypto.ts, @noble). VaultCryptoTest.kt must reproduce every one byte for byte.
 * Each line: name, then fields as HEX of their UTF-8 (no escaping problems), tab-separated.
 *
 *   npx esbuild scripts/kotlin-vault/vectors.ts --bundle --platform=node --outfile=scripts/kotlin-vault/.vectors.js \
 *     && node scripts/kotlin-vault/.vectors.js > scripts/kotlin-vault/vectors.txt
 */
import { scrypt } from '@noble/hashes/scrypt';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import * as C from '../../src/lib/vaultCrypto';

declare const Buffer: any; // node (this script runs in node only)

const h = (s: string) => Buffer.from(s, 'utf8').toString('hex');
const line = (name: string, ...fields: string[]) => console.log([name, ...fields.map(h)].join('\t'));
const bh = (b: Uint8Array) => Buffer.from(b).toString('hex');
const seq = (n: number, m = 7) => new Uint8Array(n).map((_, i) => (i * m + 3) & 255);

(async () => {
  // raw scrypt / pbkdf2 / hkdf
  for (const [pw, salt, N, r, p, dk] of [
    ['', '', 16, 1, 1, 64], ['password', 'NaCl', 1024, 8, 16, 64], ['482916', 'salt-1', 1 << 14, 8, 1, 32],
    ['ede\u0000ede@x.com\u0000oceanstar', 'abc', 1 << 15, 8, 1, 32], ['pässwörd', 'x', 64, 2, 3, 48],
  ] as [string, string, number, number, number, number][]) {
    line('scrypt', pw, salt, String(N), String(r), String(p), String(dk), bh(scrypt(pw, salt, { N, r, p, dkLen: dk })));
  }
  line('pbkdf2', 'pw', 'salt', '1', '40', bh(pbkdf2(sha256, 'pw', 'salt', { c: 1, dkLen: 40 })));
  line('pbkdf2', 'pw', 'salt', '3', '32', bh(pbkdf2(sha256, 'pw', 'salt', { c: 3, dkLen: 32 })));
  line('hkdf', bh(seq(40)), 'memoairem-private', 'pin-wrap v3', '32', bh(hkdf(sha256, seq(40), 'memoairem-private', 'pin-wrap v3', 32)));
  line('hkdf', bh(seq(5)), 'memoairem-private', 'long', '100', bh(hkdf(sha256, seq(5), 'memoairem-private', 'long', 100)));

  // base64 of awkward lengths
  for (const n of [0, 1, 2, 3, 4, 5, 100, 1001]) line('b64', bh(seq(n, 31)), C.toB64(seq(n, 31)));
  line('fromb64', 'QUJD\nRA==', bh(C.fromB64('QUJD\nRA==')));

  // text rules
  for (const s of ['Ocean Star!', 'OCEAN-star', 'Peñafrancia', 'Çé ÀÑ 12', 'ﬁve ①', 'İstanbul', '  ']) line('answer', s, C.normalizeAnswer(s));
  for (const s of ['abcde-12345-fghjk-mnpqr-stvwx', 'OOOOO IIIII LLLLL 00000 11111', 'ABCDE-12345', 'UUUUU-UUUUU-UUUUU-UUUUU-UUUUU', 'k7m2q abcde-fghjk-mnpqr-stvwx'])
    line('reckey', s, C.normalizeRecoveryKey(s) ?? 'NULL');
  for (const n of [0, 4, 5, 6, 7, 8, 9, 20]) line('pause', String(n), String(C.pinPause(n)));

  // the v3 keys + wraps, exactly as lib/vault.ts makes them
  const K = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
  const salt = bh(seq(16, 11)), pepper = bh(seq(32, 13)), iv = seq(12, 5);
  const pk = await C.pinKey('482916', salt, pepper);
  const pw = C.sealText(pk, iv, K, 'memoairem v3 pin');
  line('pinwrap', '482916', salt, pepper, String(C.PIN_SCRYPT_N), bh(iv), K, bh(pk), pw.iv, pw.ct);
  const qk = await C.questionKey('Ede Vallejos', ' EDE@example.com ', 'Ocean Star!', salt, pepper);
  const qw = C.sealText(qk, iv, K, 'memoairem v3 question');
  line('qwrap', 'Ede Vallejos', ' EDE@example.com ', 'Ocean Star!', salt, pepper, String(C.QUESTION_SCRYPT_N), bh(iv), K, bh(qk), qw.iv, qw.ct);
  const code = C.normalizeRecoveryKey('K7M2Q-ABCDE-FGHJK-MNPQR-STVWX')!;
  const rw = C.sealText(C.recoveryWrapKey(code), iv, K, 'memoairem v3 recovery');
  line('recwrap', code, bh(iv), K, bh(C.recoveryWrapKey(code)), rw.iv, rw.ct, bh(C.backupKey(code)));
  line('mac', K, '[{"id":"p1","title":"Gmail ✓"}]', bh(C.macKey(K)), C.mac(C.macKey(K), '[{"id":"p1","title":"Gmail ✓"}]'));
  const header = { app: 'MemoAirem' as const, v: 1 as const, created: '2026-10-28T07:00:00.000Z', owner: { name: 'Ede', email: 'ede@example.com' } };
  const file = C.packBackup(C.backupKey(code), iv, header, '{"items":[{"id":"p1","title":"Pässport"}],"imgs":{}}');
  line('backup', code, file);
})();
