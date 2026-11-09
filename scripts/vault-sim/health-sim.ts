/** Password health (2.0.0-autofill.8) — pure; run with the same esbuild line as items-sim.ts. */
import { passwordHealth, weakReason } from '../../src/lib/passwordHealth';

const ok = (c: any, m: string) => { console.log(c ? '✓' : '✗', m); if (!c) process.exitCode = 1; };
ok(weakReason('abc') === 'short' || weakReason('abc') === 'pattern', 'abc is weak');
ok(weakReason('Sh0rt!') === 'short', 'under 8 → short');
ok(weakReason('password') === 'common' && weakReason('Password1') === 'common' && weakReason('qwerty123!') === 'common', 'common ones, any case, trailing !');
ok(weakReason('84720519') === 'digits', 'only digits (8) → digits');
ok(weakReason('9876543210') === 'pattern' && weakReason('0987654321') === 'pattern', 'the digit row backwards → pattern');
ok(weakReason('abcdefgh') === 'pattern' && weakReason('zyxwvuts') === 'pattern' && weakReason('aaaaaaaaaa') === 'pattern' && weakReason('asdfghjk') === 'pattern', 'runs, repeats, keyboard rows');
ok(weakReason('ede.vallejo', 'ede.vallejo@gmail.com') === 'username' && weakReason('edevallejo2024', 'edevallejo@x.com') === 'username', 'same as the username / its local part + digits');
ok(weakReason('T7#kq9Lm!pX2wZ4e') === null, 'a generated one is fine');
ok(weakReason('correct horse battery staple') === null, 'a long passphrase is fine');
ok(weakReason('café-ŝtraße-2024') === null, 'unicode, long → fine');

const list = [
  { id: '1', title: 'Gmail', username: 'ede', password: 'Same#Pass2024' },
  { id: '2', title: 'Bank', username: 'ede', password: 'Same#Pass2024' },
  { id: '3', title: 'Wifi', username: '', password: '12345678' },
  { id: '4', title: 'Good', username: 'x', password: 'T7#kq9Lm!pX2wZ4e' },
  { id: '5', title: 'Empty', username: 'x', password: '' },
];
const h = passwordHealth(list);
ok(h.length === 3, 'three need attention (good + empty left out)');
ok(h[0].id === '3' && h[0].weak === 'common', 'weakest first');
const g = h.find((i) => i.id === '1')!;
ok(g.weak === null && g.reusedWith.join() === 'Bank', 'reuse names the other login');
ok(!JSON.stringify(h).includes('Same#Pass2024') && !JSON.stringify(h).includes('12345678'), 'no password in the result');
ok(passwordHealth([]).length === 0, 'empty folder → nothing');
