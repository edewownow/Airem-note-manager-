/**
 * 2.0.0-autofill.9: (1) the coded site list autofill uses to stay silent where nothing is saved —
 * what the app sends, when; (2) deleting the folder safely — the 24-hour wait from the locked screen
 * and its cancel by a normal unlock. Same aliases as store-sim.ts.
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
const sorted = (a: string[] | null) => (a ? [...a].sort().join(',') : 'null');

(async () => {
  console.log('— the coded site list —');
  newPhone();
  const core = makeCore(6);
  await boot(core.mod);
  V.beginSetup(PIN); await V.finishSetup({ biometric: false });
  ok(core.ctl.indexSites !== null && core.ctl.indexSites.length === 0, 'new folder: an empty list (silent everywhere)');
  V.savePrivate({ title: 'Gmail', username: 'ede', password: 'pw1', site: 'https://accounts.google.com/x' });
  V.savePrivate({ title: 'No site', username: 'ede', password: 'pw2' });
  V.savePrivate({ kind: 'note', title: 'Wifi', content: 'abc' } as any);
  ok(sorted(core.ctl.indexSites) === 'accounts.google.com', 'a saved login’s site goes in at once; no-site logins and notes add nothing');
  V.importLogins([{ title: 'BDO', site: 'android:com.bdo.app', username: 'e', password: 'x1', hasNote: false }]);
  ok(sorted(core.ctl.indexSites) === 'accounts.google.com,android:com.bdo.app', 'import updates it');
  const g = V.listPrivate().find((r) => r.title === 'Gmail')!;
  V.removePrivate(g.id);
  ok(sorted(core.ctl.indexSites) === 'android:com.bdo.app', 'delete updates it');
  core.ctl.indexSites = null; // e.g. first start of build 94
  await boot(core.mod); await V.unlockWithPin(PIN);
  ok(sorted(core.ctl.indexSites) === 'android:com.bdo.app', 'rebuilt at every unlock');

  console.log('— deleting safely —');
  V.exportBackup(null);
  ok((V.lastBackupAt() ?? 0) > Date.now() - 5000, 'backup time remembered (for the delete warning)');
  V.lockVault();
  ok(V.eraseRequest() === null, 'no erase request yet');
  const t0 = Date.now();
  V.startEraseRequest(t0);
  const r1 = V.eraseRequest(t0 + 60_000)!;
  ok(r1 && r1.readyIn > 23 * 3600 * 1000, 'from the locked screen: erase only after ~24 h');
  V.startEraseRequest(t0 + 3600_000);
  ok(V.eraseRequest(t0)!.since === t0, 'asking again does not restart the clock');
  ok(V.eraseRequest(t0 + V.ERASE_WAIT_MS)!.readyIn === 0, 'after 24 h: ready');
  await V.unlockWithPin(PIN);
  ok(V.eraseRequest() === null, 'a normal unlock CANCELS the request');
  V.lockVault();
  V.startEraseRequest(); V.cancelEraseRequest();
  ok(V.eraseRequest() === null, 'cancel button clears it');
  V.startEraseRequest();
  await V.deleteVault();
  ok(core.ctl.indexSites === null && V.eraseRequest() === null && V.lastBackupAt() === null, 'delete: list + its secret forgotten, request and backup time cleared');

  console.log('— an older core (v5): no list, nothing breaks —');
  newPhone();
  const old = makeCore(5);
  await boot(old.mod);
  V.beginSetup(PIN); await V.finishSetup({ biometric: false });
  ok(!!V.savePrivate({ title: 'Gmail', username: 'ede', password: 'pw1', site: 'google.com' }) && !('autofillIndexSync' in old.mod), 'saves fine on v5');
})();
