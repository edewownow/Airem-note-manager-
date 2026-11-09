/**
 * Early-answer probe logic (docs/early-answer-plan.md). Run:
 *   npx esbuild scripts/early-probe-sim.ts --bundle --platform=node --outfile=scripts/.ep.js && node scripts/.ep.js
 */
import { createProbe, verdict } from '../src/lib/earlyProbe';
let bad = 0;
const ok = (c: boolean, m: string) => { if (!c) { bad++; console.log('✗', m); } else console.log('✓', m); };

const snap = { text: 'when is the dentist', ids: ['a', 'b'], at: 0 };
ok(verdict(snap, 'When is the dentist?', ['b', 'a'], true).use, 'same words (case, ?) and same records in any order → use');
ok(verdict(snap, 'when is the dentist appointment', ['a', 'b'], true).why === 'words-changed', 'one extra word → discard (words-changed)');
ok(verdict(snap, 'when is the dentist', ['a'], true).why === 'records-differ', 'different records → discard (records-differ)');
ok(verdict(null, 'when is the dentist', ['a'], true).why === 'no-draft', 'no snapshot → no-draft');
ok(verdict(snap, 'my passport number', [], false).why === 'not-eligible', 'a final that is private/not a question → discard');

// the timer path, with a fake clock and fake timers
let t = 0;
const lines: string[] = [];
const timers: { at: number; fn: () => void }[] = [];
const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
(globalThis as any).setTimeout = (fn: () => void, ms: number) => { const h = { at: t + ms, fn }; timers.push(h); return h; };
(globalThis as any).clearTimeout = (h: any) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); };
const advance = (by: number) => {
  const to = t + by;
  for (;;) {
    timers.sort((a, b) => a.at - b.at);
    const n = timers[0];
    if (!n || n.at > to) break;
    timers.shift(); t = n.at; n.fn();
  }
  t = to;
};
const probe = createProbe({ eligible: (x) => !/passport/.test(x), recordsFor: () => ['a'], log: (l) => lines.push(l), now: () => t });

probe.partial('when is'); advance(300);
probe.partial('when is the dentist'); advance(1500); // steady 1.2 s → snapshot at 1.2 s after the last change
let v = probe.final('when is the dentist');
ok(v.use && /WOULD USE/.test(lines[lines.length - 1]), 'steady words, same final → would use: ' + lines[lines.length - 1]);

probe.partial('where is the chicken'); advance(3000);
probe.partial('where is the chicken in the kitchen'); advance(3000); // restart allowed once
v = probe.final('where is the chicken in the kitchen');
ok(v.use, 'words changed once, steady again, final matches the second snapshot → use');

probe.partial('where is the chicken'); advance(1000);
v = probe.final('where is the chicken today please');
ok(!v.use && v.why === 'words-changed', 'final adds words after the snapshot → discard');

probe.partial('my passport number is'); advance(2000);
v = probe.final('my passport number is');
ok(!v.use && v.why === 'not-eligible', 'private phrase never gets a draft');

probe.partial('when is it'); advance(10); v = probe.final('when is it');
ok(v.why === 'no-draft', 'a fast short question has no draft');

(globalThis as any).setTimeout = realSet; (globalThis as any).clearTimeout = realClear;
console.log(bad ? `${bad} FAIL` : 'all early-probe checks pass');
process.exit(bad ? 1 : 0);
