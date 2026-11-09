/**
 * Private-folder lifecycle simulation (1.10.11) — run after ANY change to src/lib/vault.ts:
 *
 *   npx esbuild scripts/vault-sim/items-sim.ts --bundle --platform=node --outfile=scripts/vault-sim/.out.js \
 *     --alias:react-native-mmkv=./scripts/vault-sim/mocks/mmkv.ts --alias:expo-secure-store=./scripts/vault-sim/mocks/securestore.ts \
 *     --alias:expo-local-authentication=./scripts/vault-sim/mocks/localauth.ts --alias:expo-crypto=./scripts/vault-sim/mocks/crypto.ts \
 *     --alias:expo-image-manipulator=./scripts/vault-sim/mocks/empty.ts --alias:expo-file-system/legacy=./scripts/vault-sim/mocks/empty.ts --alias:expo=./scripts/vault-sim/mocks/expo.ts \
 *     && node scripts/vault-sim/.out.js
 *
 * mocks/mmkv.ts copies MMKV core 2.4.1's real rule: ONE open copy per storage name per app session,
 * and a second open of the same name returns it and IGNORES the key. That rule caused the 1.10.x
 * "couldn't be read with this phone's key" bug; these scenarios must all pass.
 */
import * as V from '../../src/lib/vault';
import { matchPrivate } from '../../src/lib/privateSearch';
import { restartApp } from './mocks/mmkv';
import { openFolder } from './mocks/setup';
const ok = (c: any, m: string) => { console.log(c ? '✓' : '✗', m); if (!c) process.exitCode = 1; };
(async () => {
  await openFolder();
  const g = V.savePrivate({ title: 'Gmail', username: 'ede.v@gmail.com', password: 'summer2026' })!;
  ok(g.people === 'ede.v@gmail.com' && g.notes === 'summer2026' && Object.keys(g).length === 11, 'three fields → fixed record shape');
  const p = V.savePrivate({ title: 'ID card', username: '', password: '', photo: { base64: 'FULL1', thumb: 'data:t1' } })!;
  const p2 = V.savePrivate({ title: 'ID card', username: '', password: '', photo: { base64: 'FULL2', thumb: 'data:t2' } }, p.id)!;
  ok(V.privatePhoto(p.imageId) === null && V.privatePhoto(p2.imageId) === 'data:image/jpeg;base64,FULL2', 'photo replaced, old photo removed');
  ok(V.savePrivate({ title: '', username: '', password: 'x9' })!.title === 'Private item', 'title never falls back to the password');
  ok(matchPrivate(V.listPrivate(), 'summer2026').length === 0, 'search never matches a password');
  V.removePrivate(g.id); V.lockVault(); restartApp(); await openFolder();
  ok(V.listPrivate().length === 2 && V.privatePhoto(p2.imageId) === 'data:image/jpeg;base64,FULL2', 'after restart: items + photo intact');
})();
(async () => {
  await new Promise((r) => setTimeout(r, 20));
  await openFolder();
  const n = V.savePrivate({ kind: 'note', title: 'SSS', username: 'ignored', password: 'ignored', content: '34-1234567-8' })!;
  ok(n.type === 'private-note' && n.notes === '34-1234567-8' && n.people === null, 'note / ID item: number kept, no username');
  const e = V.savePrivate({ title: 'SSS', username: '', password: '', content: '34-1234567-9' }, n.id)!;
  ok(e.type === 'private-note' && e.notes === '34-1234567-9', 'editing a note keeps it a note');
  ok(V.savePrivate({ kind: 'note', title: '', username: '', password: '', content: '123-456' })!.title === 'Private note', 'untitled note → "Private note", never the number');
  V.lockVault(); restartApp(); await openFolder();
  ok(V.listPrivate().some((r) => r.id === n.id && r.notes === '34-1234567-9'), 'after restart: note intact');

  // 2.0.0-autofill.1 — "Website or app" on password items (→ location; autofill matches it later)
  const S = await import('../../src/lib/sites');
  ok(S.normalizeSite('https://www.Gmail.com/login?x=1') === 'gmail.com' && S.normalizeSite('accounts.google.com') === 'accounts.google.com', 'web address → bare host');
  ok(S.normalizeSite('http://user:pw@portal.example.com:8443/a') === 'portal.example.com' && S.normalizeSite('WWW2.bdo.com.ph') === 'bdo.com.ph', 'port, sign-in part, www2 removed');
  ok(S.normalizeSite('BDO app') === 'BDO app' && S.normalizeSite('  ') === null && S.normalizeSite(undefined) === null, 'an app name stays as typed; empty → nothing');
  ok(S.isWebHost('gmail.com') && !S.isWebHost('BDO app'), 'web host vs app name');
  const gm = V.savePrivate({ title: 'Gmail', username: 'ede.v@gmail.com', password: 'pw1', site: 'https://mail.google.com/mail/u/0' })!;
  ok(gm.location === 'mail.google.com' && Object.keys(gm).length === 11, 'password saved with its site; record shape unchanged');
  ok(matchPrivate(V.listPrivate(), 'google')[0]?.id === gm.id, 'typed search finds it by site');
  ok(!matchPrivate(V.listPrivate(), 'google', { titleOnly: true }).some((r) => r.id === gm.id), 'spoken (label-only) search does not use the site');
  const gm2 = V.savePrivate({ title: 'Gmail', username: 'ede.v@gmail.com', password: 'pw2', site: '' }, gm.id)!;
  ok(gm2.location === null, 'clearing the site removes it');
  const nn = V.savePrivate({ kind: 'note', title: 'Locker', username: '', password: '', content: '1234', site: 'ignored.com' })!;
  ok(nn.location === null, 'notes never take a site');
})();
