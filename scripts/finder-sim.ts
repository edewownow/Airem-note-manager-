/**
 * feat/gemma-finder: how often do Airem's rules find the right record? Run:
 *   npx esbuild scripts/finder-sim.ts --bundle --platform=node --outfile=scripts/.fs.js --alias:react-native-mmkv=./scripts/vault-sim/mocks/mmkv.ts --alias:expo=./scripts/vault-sim/mocks/expo.ts && node scripts/.fs.js
 */
import { localEngine } from '../src/lib/query';
import { FINDER_CASES, finderRecords } from '../src/lib/gemmaFinder';

const recs = finderRecords();
const by: Record<string, [number, number]> = {};
for (const c of FINDER_CASES) {
  const r = localEngine.run(recs, c.q);
  const titles = r.results.slice(0, 3).map((x) => x.title);
  const allTitles = r.results.map((x) => x.title);
  const pass = c.want.length ? c.want.every((t) => titles.includes(t)) : r.results.length === 0;
  const firstOk = !c.first || r.results[0]?.title === c.first;
  const notOk = !c.not || c.not.every((t) => !allTitles.includes(t));
  const ok = pass && firstOk && notOk;
  const b = (by[c.kind] ||= [0, 0]);
  b[1]++;
  if (ok) b[0]++;
  console.log(`${ok ? 'PASS' : 'FAIL'} [${c.kind}] ${c.q}${ok ? '' : '  → ' + (titles.join(' | ') || '(nothing)') + (firstOk ? '' : ` [first is ${r.results[0]?.title ?? '(none)'}]`) + (notOk ? '' : ' [noise kept]')}`);
}
console.log('---');
let a = 0, n = 0;
for (const [k, [p, t]] of Object.entries(by)) { console.log(`${k}: ${p}/${t}`); a += p; n += t; }
console.log(`Airem rules total: ${a}/${n}`);
