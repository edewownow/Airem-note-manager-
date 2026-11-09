/**
 * Train + measure MemoAirem's own intent model (lib/intentModel.ts). Run from the repo root:
 *   npx esbuild scripts/intent-model/train.ts --bundle --platform=node --outfile=scripts/intent-model/.train.js \
 *     --alias:react-native-mmkv=./scripts/vault-sim/mocks/mmkv.ts --alias:expo=./scripts/vault-sim/mocks/expo.ts \
 *     && node scripts/intent-model/.train.js [--write]
 *
 * 1. 10-fold cross-validation: the model is tested ONLY on sentences it was not trained on, and the
 *    report says what "rules first, model when the rules aren't sure" would have done.
 * 2. --write: train on everything and save src/lib/intentModel.weights.json for the app.
 */
import { writeFileSync } from 'node:fs';
import { DIM, features, pAsk, type IntentWeights } from '../../src/lib/intentModel';
import { classifyIntent, intentOf } from '../../src/lib/intent';
import { CORPUS_SAVES, TEST_SAVES, TRICKY_SAVES, TEST_QUESTIONS, WRITTEN_QUESTIONS, MORE_QUESTIONS, MORE_SAVES } from '../intent-data';

type Ex = { text: string; ask: number };
const strip = (s: string) => s.replace(/\?\s*$/, '');
const uniq = (l: string[]) => Array.from(new Set(l.flatMap((s) => [s, strip(s)])));
const data: Ex[] = [
  ...uniq([...CORPUS_SAVES, ...TEST_SAVES, ...TRICKY_SAVES, ...MORE_SAVES]).map((text) => ({ text, ask: 0 })),
  ...uniq([...TEST_QUESTIONS, ...WRITTEN_QUESTIONS, ...MORE_QUESTIONS]).map((text) => ({ text, ask: 1 })),
];

// a fixed shuffle, so every run reports the same numbers
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const shuffled = [...data].sort(() => rnd() - 0.5);

function train(exs: Ex[], epochs = 40, lr = 0.25, l2 = 1e-4): IntentWeights {
  const w = new Array<number>(DIM).fill(0);
  let bias = 0;
  const feats = exs.map((e) => features(e.text));
  for (let ep = 0; ep < epochs; ep++) {
    const rate = lr / (1 + ep * 0.1);
    for (let k = 0; k < exs.length; k++) {
      let z = bias;
      for (const [i, v] of feats[k]) z += w[i] * v;
      const p = 1 / (1 + Math.exp(-z));
      const g = p - exs[k].ask;
      bias -= rate * g;
      for (const [i, v] of feats[k]) w[i] -= rate * (g * v + l2 * w[i]);
    }
  }
  return { v: 1, dim: DIM, bias, w, trained: '' };
}

const SURE = Number(process.env.SURE ?? 0.95); // the model acts on its own only when this sure (else: Ask / Save pills, as today)
const K = 10;
let modelRight = 0;
let rulesSure = 0;
let rulesSureWrong = 0;
let rulesUnsure = 0;
let helpedRight = 0;
let helpedWrong = 0;
let stillUnsure = 0;
let pillRules = 0; // when unsure: is the FILLED pill (the guess) the right one?
let pillModel = 0;
let rulesAll = 0;
const wrongs: string[] = [];
for (let f = 0; f < K; f++) {
  const test = shuffled.filter((_, i) => i % K === f);
  const trainSet = shuffled.filter((_, i) => i % K !== f);
  const m = train(trainSet);
  for (const e of test) {
    const p = pAsk(m, e.text);
    if (p >= 0.5 === (e.ask === 1)) modelRight++;
    const r = classifyIntent(e.text);
    if ((intentOf(e.text) === 'ask') === (e.ask === 1)) rulesAll++;
    if (r.sure) {
      rulesSure++;
      if ((r.intent === 'ask') !== (e.ask === 1)) {
        rulesSureWrong++;
        wrongs.push(`  ✗ RULES SURE ${JSON.stringify(e.text)} is ${e.ask ? 'ASK' : 'SAVE'} — rules said ${r.intent} (model ${(p * 100).toFixed(0)}% ask)`);
      }
      continue;
    }
    rulesUnsure++;
    if ((intentOf(e.text) === 'ask') === (e.ask === 1)) pillRules++; // the word rules' own guess (classifyIntent now asks the model)
    if (p >= 0.5 === (e.ask === 1)) pillModel++;
    if (p >= SURE || p <= 1 - SURE) {
      if (p >= 0.5 === (e.ask === 1)) helpedRight++;
      else {
        helpedWrong++;
        wrongs.push(`  ✗ ${JSON.stringify(e.text)} is ${e.ask ? 'ASK' : 'SAVE'} — model ${(p * 100).toFixed(0)}% ask`);
      }
    } else stillUnsure++;
  }
}
const n = shuffled.length;
console.log(`sentences: ${n} (${data.filter((d) => d.ask).length} questions, ${data.filter((d) => !d.ask).length} saves)`);
console.log(`model alone, on sentences it never saw: ${modelRight}/${n} right (${((modelRight / n) * 100).toFixed(1)}%)`);
console.log(`rules alone (their guess, sure or not): ${rulesAll}/${n} right (${((rulesAll / n) * 100).toFixed(1)}%)`);
console.log(`when the rules are unsure, the filled pill is right: rules ${pillRules}/${rulesUnsure} vs model ${pillModel}/${rulesUnsure}`);
console.log(`rules: sure ${rulesSure} (wrong ${rulesSureWrong}), unsure ${rulesUnsure} → Ask/Save pills`);
console.log(`rules + model (acts at ≥${SURE * 100}%): of the ${rulesUnsure} unsure, model answers ${helpedRight + helpedWrong} — right ${helpedRight}, wrong ${helpedWrong}; pills still for ${stillUnsure}`);
console.log(`pills shown: ${rulesUnsure} → ${stillUnsure + 0} of ${n}`);
if (wrongs.length) console.log(wrongs.join('\n'));

if (process.argv.includes('--write')) {
  const m = train(shuffled);
  const out: IntentWeights = {
    v: 1,
    dim: DIM,
    bias: Math.round(m.bias * 1000) / 1000,
    w: m.w.map((x) => Math.round(x * 1000) / 1000),
    trained: `${new Date().toISOString().slice(0, 10)} on ${n} sentences`,
  };
  writeFileSync('src/lib/intentModel.weights.json', JSON.stringify(out));
  console.log(`wrote src/lib/intentModel.weights.json (${JSON.stringify(out).length} bytes)`);
}
