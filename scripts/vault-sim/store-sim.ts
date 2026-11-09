/**
 * Phase 1d (2.0.0-autofill.4): the folder's entries move from MMKV to the Kotlin core's store — run
 * after ANY change to lib/vaultStore.ts, openWith in lib/vault.ts or the module's store functions.
 * Same aliases as core-sim.ts (incl. --alias:expo=./scripts/vault-sim/mocks/expo.ts).
 */
import * as V from '../../src/lib/vault';
import { resetVaultCoreForTests, checkVaultCore } from '../../src/lib/vaultNative';
import { restartApp, disk } from './mocks/mmkv';
import { clearAll } from './mocks/securestore';
import { nativeCtl } from './mocks/expo';
import { makeCore } from './mocks/kotlincore';
import { persist } from '../../src/lib/persist';

const ok = (c: any, m: string) => { console.log(c ? '✓' : '✗', m); if (!c) process.exitCode = 1; };
const PIN = '482916';
async function boot(mod: any) { V.lockVault(); restartApp(); resetVaultCoreForTests(); nativeCtl.mod = mod; await checkVaultCore(); }
const newPhone = () => { restartApp(); for (const k of persist.getAllKeys()) persist.delete(k); disk.clear(); clearAll(); };
const meta = () => JSON.parse(persist.getString('vault_v3') ?? '{}');
const titles = () => V.listPrivate().map((r) => r.title).sort().join(',');

(async () => {
  console.log('— a folder in MMKV (builds 83–88) moves to the Kotlin store —');
  newPhone(); await boot(null);
  V.beginSetup(PIN); await V.finishSetup({ biometric: false });
  V.savePrivate({ title: 'Gmail', username: 'ede', password: 'pw1' });
  const ph = V.savePrivate({ title: 'Passport scan', username: '', password: 'P1', photo: { base64: 'UEFTUw==', thumb: 'data:,p' } })!;
  const id = meta().id;
  ok(!meta().store && disk.has(id), 'made without the Kotlin store: in MMKV');
  const before = [...disk.get(id)!.data.entries()].sort();

  const core = makeCore(3);
  await boot(core.mod);
  let r: any = await V.unlockWithPin(PIN);
  ok(r.ok && titles() === 'Gmail,Passport scan', 'opens as before');
  const kf = core.ctl.folders.get(id)!;
  ok(meta().store === 'kotlin-new' && kf && [...kf.entries.entries()].sort().join('|') === before.join('|'), 'EVERY entry copied to Kotlin and read back (incl. the photo, MAC, canary, backup key)');
  ok(disk.has(id), 'old MMKV copy kept for now');
  V.savePrivate({ title: 'Bank', username: 'ede', password: '1234' });
  ok(kf.entries.get('items')!.includes('Bank') && disk.get(id)!.data.get('items')!.includes('Bank'), 'while moving, a new item is written to BOTH');

  await boot(core.mod);
  r = await V.unlockWithPin(PIN);
  ok(r.ok && meta().store === 'kotlin' && !disk.has(id), 'next start: Kotlin store opens the folder → promoted, old MMKV copy removed');
  ok(titles() === 'Bank,Gmail,Passport scan' && V.privatePhoto(ph.imageId) === 'data:image/jpeg;base64,UEFTUw==', 'all items and the photo read from Kotlin');
  V.savePrivate({ title: 'Wifi', username: '', password: 'w' }); V.lockVault();
  await boot(core.mod); await V.unlockWithPin(PIN);
  ok(titles() === 'Bank,Gmail,Passport scan,Wifi' && !disk.has(id), 'saves persist in Kotlin across restarts; MMKV not recreated');
  const bk = V.exportBackup(null); ok(bk.length > 100, 'backup file still made from the Kotlin store');

  console.log('— tamper check + key check still work on the Kotlin store —');
  V.lockVault();
  const it = kf.entries.get('items')!;
  kf.entries.set('items', it.replace('Gmail', 'Gma1l'));
  await boot(core.mod); r = await V.unlockWithPin(PIN);
  ok(r.ok && r.tampered === true, 'changed items detected');
  kf.entries.set('items', it); V.lockVault();
  await boot(core.mod); r = await V.unlockWithPin(PIN); ok(r.ok && !r.tampered, 'restored → no warning');

  console.log('— an interrupted move (phone died after copying, before the switch) —');
  newPhone(); await boot(null);
  V.beginSetup(PIN); await V.finishSetup({ biometric: false });
  V.savePrivate({ title: 'X', username: '', password: 'x', photo: { base64: 'T0xE', thumb: 'data:,o' } });
  const idx = meta().id;
  const ci = makeCore(3);
  await boot(ci.mod); await V.unlockWithPin(PIN);
  const mm = JSON.parse(persist.getString('vault_v3')!); delete mm.store; persist.set('vault_v3', JSON.stringify(mm)); // the switch was never recorded
  ci.ctl.folders.get(idx)!.entries.set('img:stale', 'U1RBTEU='); // and the leftover copy has an extra entry
  await boot(ci.mod); const ri: any = await V.unlockWithPin(PIN);
  ok(ri.ok && meta().store === 'kotlin-new' && !ci.ctl.folders.get(idx)!.entries.has('img:stale'), 'next start redoes the copy from a clean store and completes');

  console.log('— nothing moves when Kotlin can\'t be trusted —');
  newPhone(); await boot(null);
  V.beginSetup(PIN); await V.finishSetup({ biometric: false }); V.savePrivate({ title: 'A', username: '', password: 'a' });
  const id2 = meta().id;
  const liar = makeCore(3); liar.ctl.storeLie = true;
  await boot(liar.mod); r = await V.unlockWithPin(PIN);
  ok(r.ok && !meta().store && !liar.ctl.folders.has(id2) && disk.has(id2), 'read-back differs → not moved, partial copy deleted, MMKV untouched');
  ok(titles() === 'A', 'folder works from MMKV');
  const v2 = makeCore(2); v2.ctl.secrets = liar.ctl.secrets; // same phone = same Keystore
  await boot(v2.mod); r = await V.unlockWithPin(PIN);
  ok(r.ok && !meta().store, 'a v2 core (build 88) → stays in MMKV');

  console.log('— the Kotlin store fails during the move → back to the (current) old copy —');
  const c3 = makeCore(3); c3.ctl.secrets = liar.ctl.secrets;
  await boot(c3.mod); await V.unlockWithPin(PIN);
  ok(meta().store === 'kotlin-new', 'copied');
  V.savePrivate({ title: 'B', username: '', password: 'b' }); // dual-written
  c3.ctl.storeBroken = true;
  await boot(c3.mod); r = await V.unlockWithPin(PIN);
  ok(r.ok && !meta().store && titles() === 'A,B' && disk.has(meta().id), 'Kotlin store unreadable → opens from the old copy, nothing lost (incl. the item saved while moving)');
  c3.ctl.storeBroken = false;
  await boot(c3.mod); r = await V.unlockWithPin(PIN);
  ok(r.ok && meta().store === 'kotlin-new', 'next start tries the move again');
  await boot(c3.mod); r = await V.unlockWithPin(PIN);
  ok(r.ok && meta().store === 'kotlin' && titles() === 'A,B', '… and completes');

  console.log('— after the move —');
  c3.ctl.storeBroken = true;
  await boot(c3.mod); r = await V.unlockWithPin(PIN);
  ok(!r.ok && r.reason === 'key-lost' && c3.ctl.folders.has(meta().id), 'Kotlin store damaged → refused, nothing deleted (the backup file is the way back)');
  c3.ctl.storeBroken = false;
  await boot(null); r = await V.unlockWithPin(PIN);
  ok(!r.ok && /Install the latest MemoAirem/.test(r.message), 'an older build → "install the latest", nothing changed');
  await boot(c3.mod); ok((await V.unlockWithPin(PIN)).ok, 'the right build opens it again');
  await V.deleteVault();
  ok(c3.ctl.folders.size === 0 && !persist.getString('vault_v3'), 'Delete private folder → the Kotlin store is deleted too');

  console.log('— new folders and restores start in Kotlin —');
  newPhone(); const c4 = makeCore(3); await boot(c4.mod);
  const code = V.beginSetup(PIN); await V.finishSetup({ biometric: false });
  ok(meta().store === 'kotlin' && !disk.has(meta().id) && c4.ctl.folders.has(meta().id), 'a new folder is made in the Kotlin store, no MMKV file');
  V.savePrivate({ title: 'C', username: '', password: 'c' });
  const file = V.exportBackup({ name: 'Ede', email: '' });
  await boot(c4.mod); ok((await V.unlockWithPin(PIN)).ok && titles() === 'C', 'reopens from Kotlin');
  newPhone(); const c5 = makeCore(3); await boot(c5.mod);
  const rb = V.readBackup(file, code);
  V.beginSetup('905117', { recoveryKey: code, restore: rb.ok ? rb.payload : null });
  const fr = await V.finishSetup({ biometric: false });
  ok(fr.ok && fr.restored === 1 && meta().store === 'kotlin' && titles() === 'C', 'restore on a new phone → straight into the Kotlin store');
  await boot(c5.mod); ok((await V.unlockWithRecovery(code)).ok && titles() === 'C', 'recovery key opens it');

  console.log('— autofill (v4 core): it may open the folder only once it is fully in the Kotlin store —');
  newPhone(); await boot(null);
  V.beginSetup(PIN); await V.finishSetup({ biometric: true });
  const c6 = makeCore(4); c6.ctl.secrets = new Map(); await boot(c6.mod);
  await V.unlockWithPin(PIN);
  ok(meta().store === 'kotlin-new' && c6.ctl.autofillId === null, 'while moving: autofill gets NO folder');
  await boot(c6.mod); await V.unlockWithPin(PIN);
  ok(meta().store === 'kotlin' && c6.ctl.autofillId === meta().id, 'fully in Kotlin → autofill may open it');
  await boot(c6.mod); await V.unlockWithBiometric(); await boot(c6.mod); await V.unlockWithBiometric();
  let st = await V.autofillStatus();
  ok(st && st.folder && st.fingerprint && !st.enabled, `status: folder ✓ fingerprint ✓, not chosen yet (${JSON.stringify(st)})`);
  await V.autofillOpenSettings(); st = await V.autofillStatus();
  ok(st && st.enabled, 'after choosing MemoAirem in Android: enabled');
  await V.deleteVault();
  ok(c6.ctl.autofillId === null, 'Delete private folder → autofill has no folder any more');
  await boot(makeCore(3).mod); ok((await V.autofillStatus()) === null, 'a v3 core (build 89–90) → no autofill panel');
})();
