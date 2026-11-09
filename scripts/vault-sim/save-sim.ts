/**
 * Phase 3 (2.0.0-autofill.8): a login saved by the REAL Kotlin code (AutofillSaveActivity's path, via
 * the JVM — run scripts/kotlin-vault/run.sh first) is read by the app's own vault code: no tamper
 * warning, the right shape, editable afterwards. Same aliases as store-sim.ts.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as V from '../../src/lib/vault';
import { resetVaultCoreForTests, checkVaultCore } from '../../src/lib/vaultNative';
import { restartApp, disk } from './mocks/mmkv';
import { clearAll } from './mocks/securestore';
import { nativeCtl } from './mocks/expo';
import { makeCore } from './mocks/kotlincore';
import { persist } from '../../src/lib/persist';

const ok = (c: any, m: string) => { console.log(c ? '✓' : '✗', m); if (!c) process.exitCode = 1; };
const GL = process.env.GRADLE_LIB ?? '/opt/gradle/lib';
const KV = readdirSync(GL).find((f) => /^kotlin-stdlib-[\d.]+\.jar$/.test(f))!.slice(14, -4);
const dir = mkdtempSync(join(tmpdir(), 'memoairem-save-'));

/** What the Kotlin save screen does: upsert + write items and items_mac into the folder's store. */
function kotlinSave(core: any, id: string, K: string, site: string, user: string, pass: string, title: string): string {
  const f = core.ctl.folders.get(id)!;
  const file = join(dir, 'items.json');
  const login = join(dir, 'login.json');
  const out = join(dir, 'out.txt');
  writeFileSync(file, f.entries.get('items') ?? '[]', 'utf8');
  writeFileSync(login, JSON.stringify({ site, user, pass, title, K }), 'utf8');
  execFileSync('java', ['-cp', `scripts/kotlin-vault/.classes:${GL}/kotlin-stdlib-${KV}.jar`, 'SaveCliKt', file, login, out], { stdio: 'ignore' });
  const [action, mac, ...rest] = readFileSync(out, 'utf8').split('\n');
  f.entries.set('items', rest.join('\n'));
  f.entries.set('items_mac', mac);
  return action;
}

(async () => {
  restartApp(); for (const k of persist.getAllKeys()) persist.delete(k); disk.clear(); clearAll();
  const c = makeCore(4);
  V.lockVault(); resetVaultCoreForTests(); nativeCtl.mod = c.mod; await checkVaultCore();
  V.beginSetup('482916'); await V.finishSetup({ biometric: false });
  V.savePrivate({ title: 'Gmail', username: 'ede.v@gmail.com', password: 'old "pw" ✓', site: 'google.com' });
  V.savePrivate({ kind: 'doc', title: 'Passport', username: '', password: '', doc: { no: 'P123', issued: '2022-03-05', expires: '2032-03-04', place: 'DFA', notes: 'line1\nline2' } });
  const id = JSON.parse(persist.getString('vault_v3')!).id;
  const K = c.ctl.folders.get(id)!.k;
  V.lockVault();

  ok(kotlinSave(c, id, K, 'facebook.com', 'ede', 'fb "1" \\ é', 'facebook.com') === 'added', 'Kotlin: new login ADDED');
  ok(kotlinSave(c, id, K, 'accounts.google.com', 'Ede.V@Gmail.com', 'new pw', 'google.com') === 'updated', 'Kotlin: Gmail password UPDATED (other page, other case)');

  restartApp(); resetVaultCoreForTests(); await checkVaultCore();
  const r: any = await V.unlockWithPin('482916');
  ok(r.ok && !r.tampered, 'the app opens the folder Kotlin wrote — NO tamper warning (MAC identical)');
  const items = V.listPrivate();
  const fb = items.find((x) => x.location === 'facebook.com')!;
  ok(fb && fb.type === 'private' && fb.notes === 'fb "1" \\ é' && fb.people === 'ede' && Object.keys(fb).length === 11, 'the saved login reads back exactly, with the 11 fields');
  ok(items.find((x) => x.title === 'Gmail')?.notes === 'new pw', 'Gmail shows the updated password');
  const doc = items.find((x) => x.title === 'Passport')!;
  ok(doc.notes === 'Issued: 2022-03-05\nline1\nline2' && doc.date === '2032-03-04', 'the document next to them is untouched');
  ok(items[0].id === fb.id, 'the new login is first in the list, as the app adds them');
  const ed = V.savePrivate({ title: 'Facebook', username: 'ede', password: 'fb2', site: 'facebook.com' }, fb.id)!;
  ok(ed.notes === 'fb2' && V.listPrivate().length === 3, 'and the app can edit it afterwards');
  V.lockVault(); restartApp(); resetVaultCoreForTests(); await checkVaultCore();
  const r2: any = await V.unlockWithPin('482916');
  ok(r2.ok && !r2.tampered && V.listPrivate().find((x) => x.id === fb.id)?.notes === 'fb2', 'after the app’s own edit: still no warning');
})();
