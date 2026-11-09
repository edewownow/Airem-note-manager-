/**
 * Debug helper — what did interpret parse, and what did the engine return?
 * Run: npx esbuild scripts/debug-noise.ts --bundle --platform=node --outfile=scripts/.dbg.js --alias:react-native-mmkv=./scripts/vault-sim/mocks/mmkv.ts --alias:expo=./scripts/vault-sim/mocks/expo.ts && node scripts/.dbg.js
 */
import { localEngine } from '../src/lib/query';
import { finderRecords } from '../src/lib/gemmaFinder';

const recs = finderRecords();
for (const q of [
  'when is the party on deck three',
  'when is the party on deck 3',
  'what time is the laundry open',
  'when is my flight to Manila',
]) {
  const r = localEngine.run(recs, q);
  console.log(`Q: ${q}`);
  console.log(`  interp: ${r.interpText} | keywords: [${r.keywords.join(', ')}]`);
  console.log(`  results: ${r.results.map((x) => x.title).join(' | ') || '(nothing)'}`);
  console.log(`  best: ${r.best?.title ?? '(none)'} | answer: ${r.answer ?? '(none)'}`);
}
