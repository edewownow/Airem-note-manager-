/**
 * One-mic measurement (2026-10-27) — could ONE mic decide "answer this" vs "save this" from the words
 * alone? Runs a candidate word-rule classifier over:
 *   SAVES      — every save sentence already in the tests (voice-corpus labels, ID / card saves,
 *                private-asr saves) + tricky statements that start like questions.
 *   QUESTIONS  — the Private-folder questions in the tests, the ask-bar chips, and everyday questions
 *                written for this measurement (marked WRITTEN), incl. tricky ones with no question word.
 * Each sentence is run as written AND with its "?" removed (Google often leaves punctuation out).
 *
 *   npx esbuild scripts/intent-measure.ts --bundle --platform=node --outfile=scripts/.intent.js --alias:react-native-mmkv=./scripts/vault-sim/mocks/mmkv.ts && node scripts/.intent.js
 */

import { intentOf, classifyIntent, type Intent } from '../src/lib/intent';

/* ---------------- sentences ---------------- */

import { CORPUS_SAVES, TEST_SAVES, TRICKY_SAVES, TEST_QUESTIONS, WRITTEN_QUESTIONS, MORE_QUESTIONS, MORE_SAVES } from './intent-data';

/* ---------------- run ---------------- */

const strip = (s: string) => s.replace(/\?\s*$/, '');
let sureN = 0;
let sureWrong = 0;
let unsureN = 0;
const sureMisses: string[] = [];
let total = 0;
let wrong = 0;
const misses: string[] = [];
function check(list: string[], want: Intent, group: string) {
  let ok = 0;
  let n = 0;
  for (const s of list) {
    for (const v of Array.from(new Set([s, strip(s)]))) {
      n++;
      const got = intentOf(v);
      const g = classifyIntent(v);
      if (g.sure) {
        sureN++;
        if (g.intent !== want) { sureWrong++; sureMisses.push(`  ✗ SURE ${group}: ${JSON.stringify(v)} → ${g.intent}`); }
      } else unsureN++;
      if (got === want) ok++;
      else misses.push(`  ✗ ${group}: ${JSON.stringify(v)} → ${got}`);
    }
  }
  total += n;
  wrong += n - ok;
  console.log(`${group.padEnd(34)} ${ok}/${n} right (${((ok / n) * 100).toFixed(1)}%)`);
}
check(CORPUS_SAVES, 'save', 'saves — voice-corpus labels');
check(TEST_SAVES, 'save', 'saves — ID / card / private tests');
check(TRICKY_SAVES, 'save', 'saves — tricky (WRITTEN)');
check(TEST_QUESTIONS, 'ask', 'questions — in tests + chips');
check(WRITTEN_QUESTIONS, 'ask', 'questions — everyday (WRITTEN)');
check(MORE_SAVES, 'save', 'saves — more everyday (WRITTEN, b98)');
check(MORE_QUESTIONS, 'ask', 'questions — more everyday (WRITTEN, b98)');
// voice.13 — as the built-in listener writes them: capitals + full stops
check(['Buy a bread on your way home.', 'Remind me to buy bread.', 'Set schedule dentist Friday at 3.', 'Note the wine list is on page 2.', 'Dinner with Sam on Friday at 7.', 'Save my pill health ID.', 'Penfolds chardonnay is 25 dollars.', 'When I get home, call Sam.'], 'save', 'saves — listener punctuation');
// 2.0.0 (user: "What activities I have today" didn't get the right answer) — schedule words
check(['What activities I have today', 'what activities do I have today', 'what are my activities today', 'activities today',
  'what tasks do I have today', 'any plans tomorrow', 'my agenda this week', 'which appointments do I have on Friday',
  'what errands today', 'what are my activities'], 'ask', 'questions — schedule words (activities, tasks …)');
check(['Today.', 'This week.', 'Tomorrow.', 'My reminders.', 'Penfolds price.', 'Show my reminders.', 'Where is the crew party?', 'What is my SRB number?'], 'ask', 'questions — listener punctuation');
console.log(`\nTOTAL ${total - wrong}/${total} right (${(((total - wrong) / total) * 100).toFixed(1)}%), ${wrong} wrong`);
if (misses.length) console.log('\nWrong:\n' + misses.join('\n'));
// voice.16 — acting at once when SURE: how often is a sure guess wrong, and how often do the pills show?
console.log(`\nSURE (acts at once): ${sureN}/${total} (${((sureN / total) * 100).toFixed(1)}%) — wrong ${sureWrong} (${sureN ? ((sureWrong / sureN) * 100).toFixed(1) : 0}% of sure)`);
console.log(`UNSURE (Ask / Save pills shown): ${unsureN}/${total} (${((unsureN / total) * 100).toFixed(1)}%)`);
if (sureMisses.length) console.log(sureMisses.join('\n'));
// a wrong SURE guess acts wrongly by itself — that must never happen on these sentences
if (sureWrong) process.exitCode = 1;
