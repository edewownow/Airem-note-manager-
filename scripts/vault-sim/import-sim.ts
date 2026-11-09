/**
 * Import from Google Password Manager (2.0.0-autofill.7) — the CSV reader and the bulk import.
 * Same aliases as store-sim.ts (incl. --alias:expo=./scripts/vault-sim/mocks/expo.ts).
 */
import * as V from '../../src/lib/vault';
import { parseCsv, readPasswordCsv } from '../../src/lib/importCsv';
import { resetVaultCoreForTests, checkVaultCore } from '../../src/lib/vaultNative';
import { restartApp, disk } from './mocks/mmkv';
import { clearAll } from './mocks/securestore';
import { nativeCtl } from './mocks/expo';
import { makeCore } from './mocks/kotlincore';
import { persist } from '../../src/lib/persist';

const ok = (c: any, m: string) => { console.log(c ? '✓' : '✗', m); if (!c) process.exitCode = 1; };

// what Google Password Manager writes (name,url,username,password,note) — with the awkward cases
const GOOGLE = '﻿name,url,username,password,note\r\n' +
  'accounts.google.com,https://accounts.google.com/signin/v2,ede.v@gmail.com,"pa,ss ""quoted"" ",\r\n' +
  'Facebook,https://www.facebook.com/login.php,ede.v,fb  pass  ,old account\r\n' +
  'com.bdo.app,android://Abc123xyz==@com.bdo.app/,ede,b0ss!,\r\n' +
  'Crew portal,https://crew.example.com:8443/login,E12345,"line1\nline2",ship notes\r\n' +
  'empty one,https://x.com,someone,,\r\n' +
  'ünïcødé,https://bank.com.ph/,ede,pässwörd€,\r\n';

(async () => {
  console.log('— the CSV reader —');
  ok(JSON.stringify(parseCsv('a,"b,c","d""e"\r\n"f\ng",h\n')) === JSON.stringify([['a', 'b,c', 'd"e'], ['f\ng', 'h']]), 'quotes, commas, doubled quotes, line breaks in quotes, CRLF and LF');
  ok(JSON.stringify(parseCsv('a,b\n\n')) === JSON.stringify([['a', 'b']]), 'blank lines ignored');
  ok(!readPasswordCsv('a,"b').ok, 'an unclosed quote → refused, not half-read');
  ok(/no “password” column/.test(readPasswordCsv('name,url\nx,y\n').message!), 'not a password export → says so');
  const r = readPasswordCsv(GOOGLE);
  ok(r.ok && r.logins.length === 5 && r.skippedNoPassword === 1, `Google export: 5 logins, 1 row without a password skipped (${r.logins.length})`);
  const [g, f, b, c, u] = r.logins;
  ok(g.password === 'pa,ss "quoted" ' && g.site === 'accounts.google.com' && g.username === 'ede.v@gmail.com', 'password taken EXACTLY (comma, quotes, trailing space); site = host');
  ok(f.password === 'fb  pass  ' && f.site === 'facebook.com' && f.hasNote, 'inner spaces kept; www dropped; note noticed');
  ok(b.site === 'android:com.bdo.app' && b.title === 'com.bdo.app', 'Google app login android://…@com.bdo.app/ → "android:com.bdo.app" (never mistaken for a website)');
  ok(c.password === 'line1\nline2' && c.site === 'crew.example.com', 'a password with a line break; port dropped from the site');
  ok(u.title === 'ünïcødé' && u.password === 'pässwörd€' && u.site === 'bank.com.ph', 'unicode');
  const other = readPasswordCsv('Title,Login_URI,Login_Username,Login_Password,Notes\nGmail,https://mail.google.com,me,x1,\n');
  ok(other.ok && other.logins[0].site === 'mail.google.com' && other.logins[0].password === 'x1', 'other managers’ column names work too');

  console.log('— importing into the folder —');
  restartApp(); for (const k of persist.getAllKeys()) persist.delete(k); disk.clear(); clearAll();
  V.lockVault(); resetVaultCoreForTests(); nativeCtl.mod = makeCore(4).mod; await checkVaultCore();
  V.beginSetup('482916'); await V.finishSetup({ biometric: false });
  V.savePrivate({ title: 'Facebook (mine)', username: 'ede.v', password: 'older', site: 'facebook.com' });
  const rep = V.importLogins(r.logins);
  ok(rep.added === 4 && rep.duplicates === 1 && rep.notesLeftOut === 1, `4 added, Facebook (same site + username) skipped, 1 note left out (${JSON.stringify(rep)})`);
  const items = V.listPrivate();
  ok(items.find((x) => x.title === 'Facebook (mine)')?.notes === 'older', 'the folder’s own Facebook login is kept as it was');
  const gi = items.find((x) => x.location === 'accounts.google.com')!;
  ok(gi.type === 'private' && gi.people === 'ede.v@gmail.com' && gi.notes === 'pa,ss "quoted" ' && Object.keys(gi).length === 11, 'imported as a normal password item (record shape unchanged)');
  ok(V.importLogins(r.logins).added === 0, 'importing the same file again adds nothing');
  V.lockVault(); restartApp(); resetVaultCoreForTests(); await checkVaultCore();
  ok((await V.unlockWithPin('482916')).ok && V.listPrivate().length === 5, 'after restart: all 5 there (1 own + 4 imported)');
})();
