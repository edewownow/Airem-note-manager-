/**
 * Private-folder simulation — run after ANY change to src/lib/vault.ts or src/lib/vaultCrypto.ts:
 *
 *   npx esbuild scripts/vault-sim/vault-sim.ts --bundle --platform=node --outfile=scripts/vault-sim/.out.js \
 *     --alias:react-native-mmkv=./scripts/vault-sim/mocks/mmkv.ts --alias:expo-secure-store=./scripts/vault-sim/mocks/securestore.ts \
 *     --alias:expo-local-authentication=./scripts/vault-sim/mocks/localauth.ts --alias:expo-crypto=./scripts/vault-sim/mocks/crypto.ts \
 *     --alias:expo-image-manipulator=./scripts/vault-sim/mocks/empty.ts --alias:expo-file-system/legacy=./scripts/vault-sim/mocks/empty.ts --alias:expo=./scripts/vault-sim/mocks/expo.ts \
 *     && node scripts/vault-sim/.out.js
 *
 * 1.13.0 (vault v3): own PIN, fingerprint copy locked by Android, recovery key, backup file, tamper
 * check, moving 1.10–1.12 folders over. Plus the 1.10.11 MMKV rule (mocks/mmkv.ts: ONE open copy per
 * storage name per session, a second open IGNORES the key) — the scenarios below must all pass.
 */
import * as V from '../../src/lib/vault';
import * as C from '../../src/lib/vaultCrypto';
import { restartApp, disk, createMMKV } from './mocks/mmkv';
import { store, bio, clearAll } from './mocks/securestore';
import { ctl } from './mocks/localauth';
import { persist } from '../../src/lib/persist';

const ok = (c: any, m: string) => { console.log(c ? '✓' : '✗', m); if (!c) process.exitCode = 1; };
const item = (t: string) => ({ title: t, username: 'ede', password: 'pw-' + t });
const PIN = '482916';
const vaultIds = () => [...disk.keys()].filter((k) => k.startsWith('vault'));
/** A brand-new phone: no app data, no Keystore. */
const newPhone = () => { restartApp(); for (const k of persist.getAllKeys()) persist.delete(k); disk.clear(); clearAll(); bio.cancel = false; bio.invalidated = false; bio.enrolled = true; ctl.level = 3; ctl.success = true; };
async function setup(pin = PIN, biometric = true) {
  const code = V.beginSetup(pin);
  ok(V.recoveryCheckMatches(code.slice(-5).toLowerCase()), 'recovery check: last group typed (any case) matches');
  const r = await V.finishSetup({ biometric });
  return { code, r };
}

(async () => {
  console.log('— crypto building blocks —');
  const rk = C.makeRecoveryKey(new Uint8Array(25).map((_, i) => i * 7));
  ok(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){4}$/.test(rk), `recovery key format ${rk}`);
  ok(C.normalizeRecoveryKey(rk.toLowerCase().replace(/-/g, ' ')) === rk.replace(/-/g, ''), 'typed lower case with spaces → same key');
  ok(C.normalizeRecoveryKey('OOOOO-IIIII-LLLLL-00000-11111') === '0000011111111110000011111', 'O → 0, I/L → 1 (can’t be misread)');
  ok(C.normalizeRecoveryKey('ABCDE-12345') === null && C.normalizeRecoveryKey('UUUUU-UUUUU-UUUUU-UUUUU-UUUUU') === null, 'too short / letters not in the key → refused');
  const big = new Uint8Array(100_003).map((_, i) => (i * 31) & 255);
  ok(Buffer.from(C.toB64(big)).toString() === Buffer.from(big).toString('base64') && Buffer.compare(Buffer.from(C.fromB64(C.toB64(big))), Buffer.from(big)) === 0, 'base64 matches node for 100 KB');
  const k = new Uint8Array(32).fill(9);
  const s = C.sealText(k, new Uint8Array(12).fill(1), 'secret', 'aad');
  ok(C.unsealText(k, s, 'aad') === 'secret', 'AES-GCM round trip');
  let threw = 0;
  try { C.unsealText(k, s, 'other aad'); } catch { threw++; }
  try { const ct = C.fromB64(s.ct); ct[0] ^= 1; C.unsealText(k, { iv: s.iv, ct: C.toB64(ct) }, 'aad'); } catch { threw++; }
  try { C.unsealText(new Uint8Array(32).fill(8), s, 'aad'); } catch { threw++; }
  ok(threw === 3, 'GCM refuses: other label, one flipped bit, wrong key');
  ok(C.isValidPin('482916') && !C.isValidPin('48291') && !C.isValidPin('48291a'), 'PIN = exactly 6 digits');
  ok(['000000', '123456', '654321', '111111', '121212'].every(C.isWeakPin) && !C.isWeakPin('482916'), 'obvious PINs refused');
  ok([0, 1, 2, 3, 4].map(C.pinPause).every((x) => x === 0) && C.pinPause(5) === 30 && C.pinPause(8) === 900 && C.pinPause(20) === 3600, 'pauses: 4 free, then 30 s … 1 h (never wipes)');
  const t0 = Date.now(); await C.pinKey('482916', '00'.repeat(16), '11'.repeat(32)); console.log(`  (PIN key in node: ${Date.now() - t0} ms)`);

  console.log('— a brand-new folder —');
  newPhone();
  ok(V.vaultMode() === 'none', 'no folder yet');
  let r: any = await V.unlockVault();
  ok(!r.ok && r.reason === 'setup', 'unlock with no folder → asks to set up (no key made silently)');
  V.beginSetup(PIN); restartApp(); V.cancelSetup();
  ok(V.vaultMode() === 'none' && vaultIds().length === 0 && store.size === 0, 'setup abandoned at the recovery-key screen → nothing written');
  let { code, r: sr } = await setup();
  ok(sr.ok && sr.created && V.vaultMode() === 'v3' && V.biometricOn(), 'set up: PIN + recovery key + fingerprint');
  ok(!store.has('memoairem_vault_key'), 'no plain key in the Keystore');
  const meta = persist.getString('vault_v3')!;
  ok(!/[A-Za-z0-9_-]{32}/.test(meta.replace(/"(iv|ct|salt|id|created|kc)":"[^"]*"/g, '')), 'stored copies are ciphertext only');
  {
    const mo = JSON.parse(meta);
    const K = disk.get(mo.id)!.writtenWith!; // the folder key (what the mock storage was opened with)
    ok(K.length === 32 && !meta.includes(K) && /^[0-9a-f]{64}$/.test(mo.kc), 'the folder key appears nowhere in plain storage; the key check is a 64-hex one-way value');
  }
  V.savePrivate(item('Netflix')); V.lockVault(); restartApp();

  console.log('— fingerprint —');
  r = await V.unlockVault();
  ok(r.ok && V.listPrivate()[0]?.title === 'Netflix', 'fingerprint opens (Android releases the key)');
  V.lockVault(); restartApp(); bio.cancel = true; ctl.success = true;
  r = await V.unlockVault();
  ok(!r.ok && r.reason === 'cancelled', 'the PHONE’s PIN no longer opens it (fingerprint cancelled → stays locked)');
  bio.cancel = false; bio.invalidated = true; restartApp();
  r = await V.unlockWithBiometric();
  ok(!r.ok && r.reason === 'bio-changed', 'new fingerprint added → Android destroyed the copy → “enter your PIN”');
  r = await V.unlockWithPin(PIN);
  ok(r.ok && V.listPrivate().length === 1, 'PIN opens');
  ok((await V.enableBiometric()) === true, 'fingerprint set up again');
  V.lockVault(); restartApp(); r = await V.unlockWithBiometric(); ok(r.ok, 'fingerprint works again');

  console.log('— wrong PINs —');
  V.lockVault(); restartApp();
  for (let i = 1; i <= 4; i++) { r = await V.unlockWithPin('111222'); }
  ok(!r.ok && r.reason === 'wrong-pin' && !r.waitSeconds, '4 wrong → no pause yet');
  r = await V.unlockWithPin('111222');
  ok(!r.ok && r.waitSeconds === 30, '5th wrong → 30 s pause');
  r = await V.unlockWithPin(PIN);
  ok(!r.ok && r.reason === 'wait', 'even the right PIN waits out the pause');
  persist.set('vault_pin_fails', JSON.stringify({ n: 5, until: Date.now() - 1 }));
  r = await V.unlockWithPin(PIN);
  ok(r.ok && V.pinWaitSeconds() === 0 && !persist.getString('vault_pin_fails'), 'after the pause the right PIN opens; the count resets');
  ok(V.listPrivate().length === 1, 'nothing was wiped by the guesses');

  console.log('— forgotten PIN → recovery key —');
  V.lockVault(); restartApp();
  r = await V.unlockWithRecovery('ABCDE-ABCDE-ABCDE-ABCDE-ABCDE');
  ok(!r.ok && r.reason === 'wrong-key', 'wrong recovery key refused');
  r = await V.unlockWithRecovery(code.toLowerCase().replace(/-/g, ' '));
  ok(r.ok && V.listPrivate()[0]?.title === 'Netflix', 'recovery key (typed loosely) opens');
  await V.setPin('730519');
  V.lockVault(); restartApp();
  ok(!(await V.unlockWithPin(PIN)).ok && (await V.unlockWithPin('730519')).ok, 'new PIN works, old one doesn’t');

  console.log('— phone security reset (Keystore wiped, app data kept) —');
  V.lockVault(); restartApp(); clearAll();
  r = await V.unlockWithBiometric();
  ok(!r.ok, 'fingerprint copy gone');
  r = await V.unlockWithPin('730519');
  ok(!r.ok && r.reason === 'key-lost' && /recovery key/.test(r.message), 'PIN can’t open (its secret was in the Keystore) → points to the recovery key');
  r = await V.unlockWithRecovery(code);
  ok(r.ok && V.listPrivate().length === 1, 'recovery key still opens — needs nothing from the Keystore');
  await V.setPin('730519'); await V.enableBiometric();
  V.lockVault(); restartApp(); ok((await V.unlockWithPin('730519')).ok, 'PIN works again after a new one is set');

  console.log('— tamper check —');
  const v = V.savePrivate({ title: 'ID photo', username: '', password: 'x', photo: { base64: 'QUJD', thumb: 'data:,t' } })!;
  ok(V.privatePhoto(v.imageId) === 'data:image/jpeg;base64,QUJD', 'photo opens');
  const id = JSON.parse(persist.getString('vault_v3')!).id;
  disk.get(id)!.data.set('img:' + v.imageId, 'QUJE');
  ok(V.privatePhoto(v.imageId) === null, 'a changed photo is refused');
  V.lockVault(); restartApp();
  const items = disk.get(id)!.data.get('items')!;
  disk.get(id)!.data.set('items', items.replace('Netflix', 'Netfl1x'));
  r = await V.unlockWithPin('730519');
  ok(r.ok && r.tampered === true && V.wasTampered(), 'a changed item list is detected and reported');
  disk.get(id)!.data.set('items', items); V.lockVault(); restartApp();
  r = await V.unlockWithPin('730519'); ok(r.ok && !r.tampered, 'unchanged → no warning');

  console.log('— backup file → a new phone —');
  V.removePrivate(v.id);
  V.savePrivate({ title: 'Passport scan', username: '', password: 'P123', photo: { base64: 'UEFTUw==', thumb: 'data:,p' } });
  const file = V.exportBackup({ name: 'Ede', email: 'ede@example.com' });
  ok(!file.includes('pw-Netflix') && !file.includes('P123') && !file.includes('UEFTUw'), 'backup file holds no readable secret or photo');
  ok(C.readBackupHeader(file)?.owner?.name === 'Ede', 'backup shows whose it is');
  const tamperedFile = file.replace('Ede', 'Eve');
  ok(tamperedFile !== file, '(test) header changed');
  newPhone();
  ok(V.vaultMode() === 'none', 'new phone: no folder');
  ok(!V.readBackup(file, 'ABCDE-ABCDE-ABCDE-ABCDE-ABCDE').ok, 'wrong recovery key → backup won’t open');
  ok(!V.readBackup(tamperedFile, code).ok, 'a changed backup won’t open');
  ok(!V.readBackup('{"hello":1}', code).ok && /isn’t a MemoAirem/.test((V.readBackup('{"hello":1}', code) as any).message), 'another file → “isn’t a MemoAirem private backup”');
  const rb = V.readBackup(file, code);
  ok(rb.ok && rb.payload.items.length === 2, 'right recovery key opens it (2 items)');
  const shown = V.beginSetup('905117', { recoveryKey: code, restore: rb.ok ? rb.payload : null });
  ok(shown === code, 'restoring keeps the SAME recovery key — the written one stays valid');
  const fr = await V.finishSetup({ biometric: false });
  ok(fr.ok && fr.restored === 2 && !V.biometricOn(), 'restored 2 items (fingerprint left off)');
  const pass = V.listPrivate().find((x) => x.title === 'Passport scan')!;
  ok(V.privatePhoto(pass.imageId) === 'data:image/jpeg;base64,UEFTUw==', 'the photo came back');
  V.lockVault(); restartApp();
  ok((await V.unlockWithRecovery(code)).ok, 'the written recovery key opens the new phone’s folder');
  ok(V.mergeItems(rb.ok ? rb.payload : { items: [], imgs: {} }) === 0, 'restoring the same backup twice adds nothing');

  console.log('— a new recovery key —');
  const fresh = V.beginNewRecoveryKey();
  ok(fresh !== code && !V.newRecoveryCheckMatches('ZZZZZ') && V.newRecoveryCheckMatches(fresh.slice(-5)), 'new key shown; last group checked');
  V.commitNewRecoveryKey();
  const file2 = V.exportBackup(null);
  V.lockVault(); restartApp();
  ok(!(await V.unlockWithRecovery(code)).ok && (await V.unlockWithRecovery(fresh)).ok, 'old key stops working, new one works');
  ok(V.readBackup(file2, fresh).ok && !V.readBackup(file2, code).ok, 'new backups open with the new key only');

  console.log('— re-check before showing a password —');
  ok((await V.confirmReveal()) === 'pin', 'fingerprint off → asks for the MemoAirem PIN');
  await V.enableBiometric();
  ok((await V.confirmReveal()) === 'ok' && ctl.lastOptions.disableDeviceFallback === true && ctl.lastOptions.biometricsSecurityLevel === 'strong', 'fingerprint on → strong biometric only, phone PIN not offered');
  ctl.success = false; ok((await V.confirmReveal()) === 'pin', 'fingerprint fails → PIN'); ctl.success = true;
  ok((await V.checkPin('000001')).ok === false && (await V.checkPin('905117')).ok === true, 'checkPin: wrong refused, right accepted');

  console.log('— a 1.10–1.12 folder moves to v3 —');
  newPhone();
  const old = createMMKV({ id: 'vault-oldfolder1', encryptionKey: 'K3'.repeat(16) });
  old.set('canary', 'memoairem-private-v1');
  old.set('items', JSON.stringify([{ id: 'p1', type: 'private', title: 'Bank', date: null, time: null, location: null, people: 'ede', notes: '1234', via: 'private', imageId: null, thumb: null }]));
  restartApp();
  store.set('memoairem_vault_key', JSON.stringify({ v: 2, id: 'vault-oldfolder1', k: 'K3'.repeat(16) }));
  persist.set('vault_created', '1');
  ok(V.vaultMode() === 'legacy', 'old folder recognised');
  r = await V.unlockVault();
  ok(r.ok && V.listPrivate()[0]?.notes === '1234', 'opens with the phone lock, data intact');
  ({ code, r: sr } = await setup('905117', true));
  ok(sr.ok && !sr.created && V.vaultMode() === 'v3', 'moved to v3 (same key, nothing re-encrypted)');
  ok(!store.has('memoairem_vault_key'), 'the plain key is deleted');
  ok(vaultIds().length === 1 && vaultIds()[0] === 'vault-oldfolder1', 'same storage, no copy left behind');
  V.lockVault(); restartApp();
  r = await V.unlockWithPin('905117');
  ok(r.ok && V.listPrivate()[0]?.notes === '1234', 'after restart: PIN opens the moved folder');
  ok((await V.unlockWithRecovery(code)).ok, 'recovery key opens it too');

  console.log('— the old safety checks still hold —');
  newPhone();
  const dmg = createMMKV({ id: 'vault', encryptionKey: 'K1'.repeat(16) }); dmg.set('canary', 'memoairem-private-v1'); dmg.set('items', '[]');
  restartApp(); store.set('memoairem_vault_key', 'K2'.repeat(16)); persist.set('vault_created', '1');
  r = await V.unlockVault();
  ok(!r.ok && r.reason === 'key-lost' && /1\.10\.0–1\.10\.10/.test(r.message), 'damaged 1.10.x folder → clear message naming the bug');
  store.delete('memoairem_vault_key'); r = await V.unlockVault();
  ok(!r.ok && r.reason === 'key-lost', 'legacy key missing → refused, nothing written over data');
  ctl.level = 0; r = await V.unlockVault(); ok(!r.ok && r.reason === 'no-lock', 'legacy folder, no screen lock → refused'); ctl.level = 3;

  console.log('— delete + new, many times, restarts in between —');
  for (let i = 1; i <= 3; i++) {
    await V.deleteVault();
    ok(!persist.getString('vault_v3') && !store.has('memoairem_vault_pepper') && !store.has('memoairem_vault_bio') && vaultIds().length === 0, `cycle ${i}: delete removes storage, copies, Keystore secrets`);
    await setup(PIN, i % 2 === 1);
    V.savePrivate(item('Item' + i)); V.lockVault(); if (i % 2) restartApp();
    r = await V.unlockWithPin(PIN);
    ok(r.ok && V.listPrivate().length === 1 && V.listPrivate()[0].title === 'Item' + i, `cycle ${i}: only the new item, readable`);
  }
  await V.deleteVault();
  ok(V.vaultMode() === 'none', 'deleted while open → back to “no folder”');

  console.log('— secret question (voice.38: name + e-mail + ONE answer, this phone only) —');
  newPhone();
  await setup(PIN, false);
  const Q = 'Name of my first ship?';
  ok(V.secretQuestionProblem(Q, 'Ede', 'Ede Vallejos', 'ede@example.com') !== null, 'answer = your name → refused');
  ok(V.secretQuestionProblem(Q, 'ede', 'Ede Vallejos', 'ede@example.com') !== null, 'answer = e-mail name → refused');
  ok(V.secretQuestionProblem(Q, 'ship', 'Ede', '') !== null && V.secretQuestionProblem(Q, '1234', 'Ede', '') !== null, 'words from the question / common answers → refused');
  ok(V.secretQuestionProblem(Q, 'Ocean Star', '', '') !== null, 'no name in the profile → refused');
  ok(V.secretQuestionProblem(Q, 'Ocean Star', 'Ede Vallejos', 'ede@example.com') === null, 'a real answer is accepted');
  await V.setSecretQuestion(Q, 'Ocean Star', 'Ede Vallejos', 'ede@example.com');
  ok(V.secretQuestion() === Q, 'question shown on the locked screen');
  ok(!persist.getString('vault_v3')!.toLowerCase().includes('ocean'), 'the answer is not stored anywhere');
  V.lockVault(); restartApp();
  r = await V.unlockWithQuestion('Ede Vallejos', 'ede@example.com', 'Ocean Moon');
  ok(!r.ok && r.reason === 'wrong-key', 'wrong answer → refused');
  r = await V.unlockWithQuestion('Someone Else', 'ede@example.com', 'Ocean Star');
  ok(!r.ok, 'right answer, wrong name → refused');
  r = await V.unlockWithQuestion('ede vallejos', ' EDE@example.com ', 'ocean-star!');
  ok(r.ok && V.listPrivate().length === 0, 'right name + e-mail + answer (any capitals / spacing) → opens');
  await V.setPin('730519');
  V.lockVault(); restartApp();
  ok((await V.unlockWithPin('730519')).ok, 'new PIN set after the question');
  V.lockVault(); restartApp();
  ok((await V.unlockWithQuestion('Ede Vallejos', 'ede@example.com', 'Ocean Star')).ok, 'the question still works after a PIN change (Keystore secret kept)');
  V.lockVault(); restartApp();
  for (let i = 0; i < 4; i++) await V.unlockWithQuestion('Ede Vallejos', 'ede@example.com', 'wrong' + i);
  r = await V.unlockWithQuestion('Ede Vallejos', 'ede@example.com', 'wrong9');
  ok(!r.ok && r.waitSeconds === 30, '5 wrong answers → 30 s pause');
  r = await V.unlockWithPin('730519');
  ok(!r.ok && r.reason === 'wait', 'the pause covers the PIN too (one shared count)');
  persist.set('vault_pin_fails', JSON.stringify({ n: 5, until: Date.now() - 1 }));
  r = await V.unlockWithPin('730519'); ok(r.ok, 'after the pause the PIN opens');
  V.lockVault(); restartApp(); clearAll();
  r = await V.unlockWithQuestion('Ede Vallejos', 'ede@example.com', 'Ocean Star');
  ok(!r.ok && r.reason === 'key-lost' && /recovery key/.test(r.message), 'Keystore wiped → the question can’t open it → recovery key');
  ok(V.secretQuestion() === Q, '(question still listed until a new PIN is set)');
  r = await V.unlockWithPin('000000'); // pepper gone → key-lost, not counted against them
  ok(!r.ok && r.reason === 'key-lost', 'PIN also points to the recovery key');
  V.removeSecretQuestion();
  ok(V.secretQuestion() === null, 'question can be removed');
  await V.deleteVault();
  ok(!persist.getString('vault_v3'), 'delete removes the question with everything else');
})();
