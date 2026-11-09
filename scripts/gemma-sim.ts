/**
 * feat/gemma: the checks that decide whether a Gemma answer may be used (lib/gemma.ts). Run:
 *   npx esbuild scripts/gemma-sim.ts --bundle --platform=node --outfile=scripts/.gs.js --alias:react-native-mmkv=./scripts/vault-sim/mocks/mmkv.ts --alias:expo=./scripts/vault-sim/mocks/expo.ts && node scripts/.gs.js
 */
import './fixed-clock';
import { checkReply, judgeTrial, pickRecords, recordLines, sayMonths, shortIds, systemPrompt, trialRecords, TRIAL_CASES, userPrompt, GEMMA_SCHEMA } from '../src/lib/gemma';
import { localEngine } from '../src/lib/query';

let bad = 0;
const ok = (c: boolean, m: string) => { if (!c) { bad++; console.log('✗', m); } else console.log('✓', m); };
const now = new Date(2026, 9, 29, 17, 0);
const recs = trialRecords(now);
const byTitle = (t: string) => recs.find((r) => r.title === t)!;

// what Gemma reads for each trial question
for (const c of TRIAL_CASES) {
  const hits = localEngine.run(recs as any, c.q).results;
  const picked = pickRecords(c.q, hits, recs);
  const titles = picked.map((r) => r.title);
  ok(picked.length > 0 && picked.length <= 8, `picks 1–8 for "${c.q}" (${picked.length})`);
  for (const w of c.want) ok(titles.includes(w), `"${c.q}" — Gemma gets to read "${w}"`);
}

const ids = shortIds([byTitle('Meeting'), byTitle('Sam owes me 20 dollars'), byTitle('Dentist')]);
console.log(recordLines(ids));
const J = (o: any) => JSON.stringify(o);
ok(checkReply(J({ found: true, answer: 'Your meeting is on Saturday 31 October at 1 PM.', ids: ['r1'] }), ids).ok, 'grounded answer is used');
ok(checkReply(J({ found: true, answer: 'Your meeting is at 3 PM.', ids: ['r1'] }), ids).ok === false, 'made-up time (3) is thrown away');
ok(checkReply(J({ found: true, answer: 'Sam owes you 20 dollars.', ids: ['r2'] }), ids).ok, 'amount from the record is fine');
ok(checkReply(J({ found: true, answer: 'Sam owes you 25 dollars.', ids: ['r2'] }), ids).ok === false, 'made-up amount thrown away');
ok(checkReply(J({ found: true, answer: 'Sam owes you 20 dollars.', ids: ['r9'] }), ids).ok === false, 'unknown id thrown away');
ok(checkReply(J({ found: true, answer: 'Sam owes you money.', ids: [] }), ids).ok === false, 'no ids thrown away');
ok(checkReply(J({ found: false, answer: '', ids: [] }), ids).ok === false, 'not found → rules');
ok(checkReply('Sure! The meeting is at 1.', ids).ok === false, 'not JSON → rules');
ok(checkReply('```json\n' + J({ found: true, answer: 'Dentist tomorrow at 9 AM with Dr Cruz.', ids: ['r3'] }) + '\n```', ids).ok, 'fenced JSON read');
ok(checkReply(J({ found: true, answer: 'The meeting is at 1 PM, the dentist at 9 AM.', ids: ['r1', 'r3'] }), ids).ok, 'two records, both numbers grounded');
ok(checkReply(J({ found: true, answer: 'The meeting is at 1 PM.', ids: ['r3'] }), ids).ok === false, 'number from a record it did NOT name → thrown away');
{
  const chick = shortIds([byTitle('There are two chicken on the fridge')]);
  ok(checkReply(J({ found: true, answer: 'You have 2 chickens (r1).', ids: ['r1'] }), chick).ok, 'id r1 is not counted as the number 1');
  const said = checkReply(J({ found: true, answer: 'You have 2 chickens. ids=R1', ids: ['r1'] }), chick);
  ok(said.ok === true && said.answer === 'You have 2 chickens.', 'ids=R1 is not spoken');
  ok(checkReply(J({ found: true, answer: 'You have 1 chicken.', ids: ['r1'] }), chick).ok === false, 'a real count of 1 is still thrown away');
}

// judge
const tid = shortIds(pickRecords('where is my passport', [], recs));
ok(judgeTrial(TRIAL_CASES.find((c) => c.q === 'where is my passport')!, J({ found: false, answer: '', ids: [] }), tid, 1).pass, 'trial: not found passes');
ok(!judgeTrial(TRIAL_CASES.find((c) => c.q === 'where is my passport')!, J({ found: true, answer: 'In your locker.', ids: ['r5'] }), tid, 1).pass, 'trial: invented answer fails');
ok(JSON.parse(GEMMA_SCHEMA).required.length === 3, 'schema');
ok(/Thursday 29 October 2026/.test(systemPrompt(now)), 'system prompt has today');
ok(/on the fridge/.test(systemPrompt(now)) && /answers when/.test(systemPrompt(now)), 'system prompt tells the model a title place and a date count');
ok(userPrompt('q', ids, now).includes('[r1] event: "Meeting" · date Saturday 31 October 2026 (in 2 days) · time 1 PM'), 'record line');
ok(sayMonths('George’s birthday is on Sun 6 Dec, and the trip is in Nov.') === 'George’s birthday is on Sun 6 December, and the trip is in November.', 'Dec and Nov are said in full');
ok(sayMonths('locker on deck 4') === 'locker on deck 4', 'deck is not December');
{
  const show = (q: string) => recordLines(shortIds(pickRecords(q, localEngine.run(recs as any, q).results, recs)), now);
  ok(/tomorrow/.test(show('what do I have tomorrow')), 'tomorrow is written on the dentist date');
  ok(/in 4 days/.test(show('when do I need to call mom')), 'call mom date says in 4 days');
  ok(/chicken on the fridge/.test(show('where is the chicken')), 'chicken note is what Gemma reads');
}
console.log(bad ? `${bad} FAIL` : 'all gemma checks pass');
process.exit(bad ? 1 : 0);
