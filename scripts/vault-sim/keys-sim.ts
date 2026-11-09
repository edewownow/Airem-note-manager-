/**
 * Phase 1c (2.0.0-autofill.3): the vault's phone-bound keys move to the Kotlin core — run after ANY
 * change to lib/vaultKeys.ts, the key parts of lib/vault.ts or the module's key functions.
 * Same aliases as core-sim.ts (incl. --alias:expo=./scripts/vault-sim/mocks/expo.ts).
 */
import * as V from '../../src/lib/vault';
import { resetVaultCoreForTests, checkVaultCore } from '../../src/lib/vaultNative';
import { keysAt } from '../../src/lib/vaultKeys';
import { restartApp, disk } from './mocks/mmkv';
import { store, bio as oldBio, clearAll } from './mocks/securestore';
import { nativeCtl } from './mocks/expo';
import { makeCore } from './mocks/kotlincore';
import { persist } from '../../src/lib/persist';

const ok = (c: any, m: string) => { console.log(c ? '✓' : '✗', m); if (!c) process.exitCode = 1; };
const PIN = '482916';
async function boot(mod: any) { V.lockVault(); restartApp(); resetVaultCoreForTests(); nativeCtl.mod = mod; await checkVaultCore(); }
const newPhone = () => { restartApp(); for (const k of persist.getAllKeys()) persist.delete(k); disk.clear(); clearAll(); oldBio.cancel = false; oldBio.invalidated = false; };
const oldPepper = () => store.get('memoairem_vault_pepper');

(async () => {
  console.log('— a folder from build 85–87 (keys in the old store) meets the Kotlin core —');
  newPhone(); await boot(null);
  V.beginSetup(PIN); await V.finishSetup({ biometric: true });
  V.savePrivate({ title: 'Gmail', username: 'ede', password: 'pw' });
  const pep = oldPepper();
  ok(pep && store.has('memoairem_vault_bio') && keysAt().pepper === 'expo' && keysAt().bio === 'expo', 'made without the Kotlin core: both keys in the old store');

  const core = makeCore(2);
  await boot(core.mod);
  let r: any = await V.unlockWithPin(PIN);
  ok(r.ok && V.listPrivate()[0]?.title === 'Gmail', 'PIN opens as before');
  ok(keysAt().pepper === 'kotlin' && core.ctl.secrets.get('pepper') === pep && !oldPepper(), 'PIN secret moved to Kotlin — SAME value, read back, old copy deleted');
  await boot(core.mod);
  ok((await V.unlockWithPin(PIN)).ok && !(await (async () => { V.lockVault(); return V.unlockWithPin('111111'); })()).ok, 'after restart: right PIN opens from Kotlin, wrong one refused');

  console.log('— the fingerprint copy moves on a fingerprint unlock —');
  await boot(core.mod);
  const t0 = core.ctl.touches;
  r = await V.unlockWithBiometric();
  ok(r.ok && keysAt().bio === 'kotlin-new' && core.ctl.bio !== null && core.ctl.touches === t0 + 1, 'old copy opened; ONE more touch made the Kotlin copy');
  ok(store.has('memoairem_vault_bio'), 'old copy kept until the Kotlin one has worked');
  await boot(core.mod);
  r = await V.unlockWithBiometric();
  ok(r.ok && keysAt().bio === 'kotlin' && !store.has('memoairem_vault_bio'), 'Kotlin copy opened the folder → old copy deleted');

  console.log('— a Kotlin copy that opens the WRONG folder key never replaces the old one —');
  newPhone(); await boot(null);
  V.beginSetup(PIN); await V.finishSetup({ biometric: true });
  const odd = makeCore(2); await boot(odd.mod);
  await V.unlockWithPin(PIN); // PIN secret moves; fingerprint copy still old
  await boot(odd.mod); await V.unlockWithBiometric(); // old copy opens + Kotlin copy made
  odd.ctl.bio = 'A'.repeat(32); // the Kotlin copy somehow holds the wrong key
  await boot(odd.mod);
  r = await V.unlockWithBiometric();
  ok(!r.ok && keysAt().bio === 'kotlin-new' && store.has('memoairem_vault_bio'), 'wrong key → folder stays shut, old copy KEPT, nothing promoted');
  ok(![...disk.keys()].some((id) => id !== 'default' && disk.get(id)!.writtenWith === 'A'.repeat(32)), 'the wrong key was refused BEFORE the storage was opened with it');
  ok((await V.unlockWithPin(PIN)).ok, 'PIN still opens');

  console.log('— the key check: a brand-new process meets a wrong key —');
  newPhone(); await boot(null);
  V.beginSetup(PIN); await V.finishSetup({ biometric: true });
  V.savePrivate({ title: 'Bank', username: 'ede', password: '1234' });
  ok(JSON.parse(persist.getString('vault_v3')!).kc?.length === 64, 'new folders store the key check');
  store.set('memoairem_vault_bio', 'B'.repeat(32)); // the old fingerprint copy now holds a wrong key
  await boot(null);
  r = await V.unlockWithBiometric();
  ok(!r.ok, 'wrong key from the fingerprint copy → refused');
  ok((await V.unlockWithPin(PIN)).ok && V.listPrivate()[0]?.notes === '1234', 'items intact; PIN opens');
  const mOld = JSON.parse(persist.getString('vault_v3')!); delete mOld.kc; persist.set('vault_v3', JSON.stringify(mOld));
  await boot(null); await V.unlockWithPin(PIN);
  ok(JSON.parse(persist.getString('vault_v3')!).kc?.length === 64, 'a folder from before gets its key check on the first open');

  console.log('— the Kotlin fingerprint copy behaves like before —');
  newPhone(); await boot(null);
  V.beginSetup(PIN); await V.finishSetup({ biometric: true });
  await boot(core.mod); await V.unlockWithPin(PIN); await boot(core.mod); await V.unlockWithBiometric(); await boot(core.mod); await V.unlockWithBiometric();
  await boot(core.mod); core.ctl.cancel = true;
  r = await V.unlockWithBiometric(); ok(!r.ok && r.reason === 'cancelled', '"Use PIN" / closed → stays locked, PIN offered'); core.ctl.cancel = false;
  await boot(core.mod); core.ctl.invalidated = true;
  r = await V.unlockWithBiometric(); ok(!r.ok && r.reason === 'bio-changed', 'a fingerprint was added → "enter your PIN"');
  r = await V.unlockWithPin(PIN); ok(r.ok, 'PIN opens');
  ok((await V.enableBiometric()) && keysAt().bio === 'kotlin-new', 'fingerprint set up again, in Kotlin');
  await boot(core.mod); ok((await V.unlockWithBiometric()).ok && keysAt().bio === 'kotlin', 'and it works');

  console.log('— nothing moves when Kotlin can\'t be trusted —');
  newPhone(); await boot(null);
  V.beginSetup(PIN); await V.finishSetup({ biometric: false });
  const liar = makeCore(2); liar.ctl.lieOnReadBack = true;
  await boot(liar.mod);
  ok((await V.unlockWithPin(PIN)).ok && keysAt().pepper === 'expo' && oldPepper(), 'read-back differs → PIN secret stays in the old store');
  const v1 = makeCore(1);
  await boot(v1.mod);
  ok((await V.unlockWithPin(PIN)).ok && keysAt().pepper === 'expo', 'a v1 core (build 87) → keys stay in the old store');
  const broken = makeCore(2); broken.ctl.failSave = true;
  await boot(broken.mod); await V.unlockWithPin(PIN);
  ok((await V.enableBiometric()) && keysAt().bio === 'expo' && store.has('memoairem_vault_bio'), 'Kotlin fingerprint copy fails → made in the old store instead');
  await boot(broken.mod); ok((await V.unlockWithBiometric()).ok, 'and fingerprint unlock still works');

  console.log('— new folder, recovery key, Keystore wipe, delete —');
  newPhone(); const k2 = makeCore(2); await boot(k2.mod);
  const code = V.beginSetup(PIN); await V.finishSetup({ biometric: true });
  ok(keysAt().pepper === 'kotlin' && keysAt().bio === 'kotlin-new' && !oldPepper() && !store.has('memoairem_vault_bio'), 'a NEW folder keeps both keys in Kotlin from the start');
  await boot(k2.mod); ok((await V.unlockWithPin(PIN)).ok, 'PIN opens it');
  await V.setSecretQuestion('Name of my first pet ever?', 'Bantay Ocean', 'Ede', '');
  await V.setPin('730519');
  await boot(k2.mod);
  ok((await V.unlockWithQuestion('Ede', '', 'bantay ocean')).ok, 'secret question still works after a PIN change (same Kotlin secret)');
  k2.ctl.secrets.clear(); k2.ctl.bio = null; // the phone's security keys were reset
  await boot(k2.mod);
  r = await V.unlockWithPin('730519');
  ok(!r.ok && r.reason === 'key-lost', 'Kotlin keys wiped → PIN points to the recovery key (as before)');
  r = await V.unlockWithRecovery(code); ok(r.ok, 'recovery key opens');
  await V.setPin('905117');
  ok(keysAt().pepper === 'kotlin' && k2.ctl.secrets.has('pepper'), 'new PIN → a new secret, in Kotlin');
  await boot(k2.mod); ok((await V.unlockWithPin('905117')).ok, 'new PIN works');
  await V.deleteVault();
  ok(!k2.ctl.secrets.size && k2.ctl.bio === null && keysAt().pepper === 'expo' && !persist.getString('vault_keys'), 'Delete private folder → Kotlin secrets and fingerprint copy gone too');
})();
