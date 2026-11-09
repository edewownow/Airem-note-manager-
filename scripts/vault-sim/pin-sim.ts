/**
 * Phase 3 (2.0.0-autofill.8): the PIN inside autofill — the app gives the Kotlin core the PIN's locked
 * copy (ciphertext) and ONE wrong-PIN count is shared, so autofill never gives extra guesses.
 * Run after ANY change to readFails / writeFails / syncAutofillPin in lib/vault.ts. Same aliases as store-sim.ts.
 */
import * as V from '../../src/lib/vault';
import { resetVaultCoreForTests, checkVaultCore } from '../../src/lib/vaultNative';
import { pinKey, unsealText } from '../../src/lib/vaultCrypto';
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

/** What AutofillUnlock / PinUnlock.tryPin does in Kotlin, with the same inputs. */
async function autofillPin(core: ReturnType<typeof makeCore>, pin: string): Promise<string | null> {
  const c = JSON.parse(core.ctl.pinCopy!);
  try {
    return unsealText(await pinKey(pin, c.salt, core.ctl.secrets.get('pepper')!, c.n), { iv: c.iv, ct: c.ct }, 'memoairem v3 pin');
  } catch {
    return null;
  }
}

(async () => {
  console.log('— the PIN reaches autofill as ciphertext only —');
  newPhone();
  const core = makeCore(5);
  await boot(core.mod);
  V.beginSetup(PIN); await V.finishSetup({ biometric: false });
  ok(meta().store === 'kotlin' && core.ctl.autofillId === meta().id, 'new folder in the Kotlin store; autofill may open it');
  ok(core.ctl.pinCopy !== null, 'PIN copy synced at setup');
  const c = JSON.parse(core.ctl.pinCopy!);
  ok(c.iv === meta().pin.iv && c.ct === meta().pin.ct && c.salt === meta().salt && c.n === meta().n, 'it is exactly the PIN lock {n, salt, iv, ct}');
  ok(!core.ctl.pinCopy!.includes(PIN), 'no PIN in it');
  const k = await autofillPin(core, PIN);
  ok(!!k && k.length === 32, 'the right PIN opens it (Kotlin path) → the folder key');
  ok((await autofillPin(core, '000000')) === null, 'a wrong PIN does not');
  ok(core.mod.autofillStatus().pin === true, 'status: PIN ready');

  console.log('— one wrong-PIN count for app + autofill —');
  for (let i = 0; i < 3; i++) await V.unlockWithPin('111111');
  ok(core.ctl.fails.n === 3, 'app wrong tries reach the Kotlin count (3)');
  core.ctl.fails = { n: 5, until: Date.now() + 30_000 }; // autofill used up the free tries
  ok(V.pinWaitSeconds() > 0, 'app sees the pause autofill started');
  let r: any = await V.unlockWithPin(PIN);
  ok(!r.ok && r.reason === 'wait', 'even the right PIN waits in the app');
  core.ctl.fails = { n: 5, until: 0 };
  r = await V.unlockWithPin('222222');
  ok(!r.ok && core.ctl.fails.n === 6 && core.ctl.fails.until > Date.now(), 'next wrong app try continues from autofill’s count (6 → pause)');
  core.ctl.fails = { n: 0, until: 0 };
  persist.delete('vault_pin_fails');
  r = await V.unlockWithPin(PIN);
  ok(r.ok && core.ctl.fails.n === 0, 'right PIN opens; count cleared');
  await V.unlockWithPin('333333'); V.lockVault();
  r = await V.unlockWithPin(PIN);
  ok(r.ok && core.ctl.fails.n === 0 && !persist.getString('vault_pin_fails'), 'right PIN clears BOTH counts');

  console.log('— changing the PIN, restarting, deleting —');
  await V.setPin('907134');
  ok(JSON.parse(core.ctl.pinCopy!).ct === meta().pin.ct, 'new PIN synced');
  ok((await autofillPin(core, '907134')) === k && (await autofillPin(core, PIN)) === null, 'autofill: new PIN works, old one no longer');
  core.ctl.pinCopy = null; // e.g. data from an older build
  await boot(core.mod); r = await V.unlockWithPin('907134');
  ok(r.ok && JSON.parse(core.ctl.pinCopy ?? '{}').ct === meta().pin.ct, 'synced again at every unlock');
  await V.deleteVault();
  ok(core.ctl.pinCopy === null && core.ctl.autofillId === null, 'delete: autofill keeps neither the folder nor the PIN copy');

  console.log('— an older core (v4): nothing breaks —');
  newPhone();
  const old = makeCore(4);
  await boot(old.mod);
  V.beginSetup(PIN); await V.finishSetup({ biometric: false });
  for (let i = 0; i < 2; i++) await V.unlockWithPin('111111');
  ok(JSON.parse(persist.getString('vault_pin_fails')!).n === 2, 'app count still kept in the app');
  r = await V.unlockWithPin(PIN);
  ok(r.ok && !('pinCopy' in old.mod), 'opens; no PIN copy on a v4 core');
})();
