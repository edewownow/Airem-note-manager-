/**
 * Categories (#tags) — variant experiment. Run:
 *   npx esbuild scripts/category-sim.ts --bundle --platform=node --outfile=scripts/.cs.js --alias:react-native-mmkv=./scripts/vault-sim/mocks/mmkv.ts --alias:expo=./scripts/vault-sim/mocks/expo.ts && node scripts/.cs.js
 *
 * The active category is session state, so the engine checks run as ordered
 * sequences: select → ask → clear. Each group starts with a clean category.
 */
import { localEngine } from '../src/lib/query';
import {
  allCategories,
  clearActiveCategory,
  extractTags,
  findCategory,
  getActiveCategory,
  parseCategoryCommand,
  recordTags,
  resolveTag,
  setActiveCategory,
  setCategoriesEnabled,
  splitTags,
  stripTags,
  CATEGORY_TIMEOUT_MS,
} from '../src/lib/categories';
import { classifyIntent } from '../src/lib/intent';
import { learnRecord } from '../src/lib/learning';
import type { Rec } from '../src/types';

const R = (id: string, title: string, notes = '', date: string | null = null): Rec => ({
  id,
  type: 'note',
  title,
  date,
  time: null,
  location: null,
  people: null,
  notes: notes || null,
  via: 'typed',
  imageId: null,
  thumb: null,
});

const recs: Rec[] = [
  R('drill', 'Muster drill at lifeboat station B', '#ship safety'),
  R('lifeboat', 'Lifeboat inspection every Sunday', 'Check the davits #ship safety at 9am'),
  R('paylater', 'Lazada PayLater due', 'Pay 3272 #money on Nov 16'),
  R('gym', 'Gym opens at 6 am', 'The gym opens at 6 am'),
  R('laundry', 'Laundry opens at 8 am', 'The laundry opens at 8 am'),
  R('multi', 'Fire drill and safety briefing', '#ship safety #fire drill'),
  R('duty', 'Duty roster June 21', 'Restaurant duty #ship safety', '2027-06-21'),
  R('payday', 'Payday June 21', 'Salary arrives #money', '2027-06-21'),
];

let pass = 0;
let total = 0;
function check(name: string, ok: boolean, detail = '') {
  total++;
  if (ok) pass++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : '  → ' + detail}`);
}
const titles = (r: { results: Rec[] }) => r.results.map((x) => x.title);
const has = (r: { results: Rec[] }, id: string) => r.results.some((x) => x.id === id);
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/* ---------------- tag parsing ---------------- */
check('tag: end of note', eq(extractTags('Muster drill #ship safety'), ['ship safety']));
check('tag: mid-sentence stops at "at"', eq(extractTags('Check the davits #ship safety at 9am'), ['ship safety']));
check('tag: two tags', eq(extractTags('Fire drill #ship safety #fire drill'), ['ship safety', 'fire drill']));
check('tag: comma ends it', eq(extractTags('Buy milk #groceries, and eggs'), ['groceries']));
check('tag: C# is not a tag', eq(extractTags('C# programming'), []));
check('tag: a#b is not a tag', eq(extractTags('a#b test'), []));
check('tag: hashtag word', eq(extractTags('hashtag ship safety'), ['ship safety']));
check('tag: in parens still a tag', eq(extractTags('Drill (#ship safety) at 9am'), ['ship safety']));
check('tag: title tag does not swallow notes', eq(recordTags(R('seam', 'Drill #ship', 'safety briefing at 9am')), ['ship']));
check('tag: paren tag on a record', eq(recordTags(R('paren', 'Drill (#ship safety)', '')), ['ship safety']));
check('tag: split highlights a paren tag', splitTags('Drill (#ship safety)').some((s) => s.tag && s.text === '#ship safety'));
check('tag: time stops the tag', eq(extractTags('Muster #ship safety 9am'), ['ship safety']));
check('tag: clock time stops the tag', eq(extractTags('Muster #ship safety 14:00'), ['ship safety']));
check('tag: bare number is not a time', eq(extractTags('Drill #deck 3'), ['deck 3']));
check('tag: comma stripped from the word', eq(extractTags('Muster #ship safety, at 9am'), ['ship safety']));
check('tag: colon followed by a word ends it', eq(extractTags('Muster #ship safety: muster'), ['ship safety']));
check('tag: display stops at the time too', eq(splitTags('Muster #ship safety 14:00').filter((s) => s.tag).map((s) => s.text), ['#ship safety']));
check('tag: stripping keeps the time in the question', stripTags('when is the drill #ship safety 14:00') === 'when is the drill 14:00');
check('tag: display stops at "9 am"', eq(splitTags('#ship safety 9 am').filter((s) => s.tag).map((s) => s.text), ['#ship safety']));
check('tag: record with two tags', eq(recordTags(recs[5]), ['ship safety', 'fire drill']));
check('tag: all categories', eq(allCategories(recs), ['ship safety', 'money', 'fire drill']));
check('tag: split highlights the tag', splitTags('Muster drill #ship safety').some((s) => s.tag && s.text === '#ship safety'));
check('tag: split leaves plain text plain', eq(splitTags('Muster drill #ship safety')[0], { text: 'Muster drill ', tag: false }));
check('tag: two tags render as two', eq(splitTags('#ship safety #fire drill').filter((s) => s.tag).map((s) => s.text), ['#ship safety', '#fire drill']));
check('tag: two tags strip clean', stripTags('show me #ship safety #fire drill') === 'show me');
check('tag: comma ends the display tag', eq(splitTags('#ship safety, bring helmet').filter((s) => s.tag).map((s) => s.text), ['#ship safety']));
check('tag: newline ends the display tag', eq(splitTags('#ship safety\nBring helmet').filter((s) => s.tag).map((s) => s.text), ['#ship safety']));
check('tag: spoken two tags render as two', eq(splitTags('hashtag ship safety hashtag fire drill').filter((s) => s.tag).map((s) => s.text), ['hashtag ship safety', 'hashtag fire drill']));

/* ---------------- matching a spoken name ---------------- */
check('match: exact', findCategory('ship safety', ['ship safety', 'money']) === 'ship safety');
check('match: misheard still finds it', findCategory('ship safty', ['ship safety', 'money']) === 'ship safety');
check('match: unknown is null', findCategory('xyz abc', ['ship safety', 'money']) === null);
check('match: half right matches nothing', findCategory('ship xyz', ['ship safety']) === null);
check('match: one word each of two is no match', findCategory('ship drill', ['ship safety', 'fire drill']) === null);
check('resolve: trailing word falls back to the known category', resolveTag('ship safety tomorrow', ['ship safety', 'money']) === 'ship safety');
check('resolve: trailing word falls back, spoken form', resolveTag('ship safety notes', ['ship safety']) === 'ship safety');
check('resolve: genuinely new stays whole', resolveTag('crew welfare', ['ship safety']) === 'crew welfare');

/* ---------------- commands ---------------- */
check('cmd: bare tag selects', eq(parseCategoryCommand('#ship safety'), { kind: 'select', name: 'ship safety' }));
check('cmd: spoken hashtag selects', eq(parseCategoryCommand('hashtag ship safety'), { kind: 'select', name: 'ship safety' }));
check('cmd: clear', eq(parseCategoryCommand('clear category'), { kind: 'clear' }));
check('cmd: list', eq(parseCategoryCommand('list categories'), { kind: 'list' }));
check('cmd: show me the categories', eq(parseCategoryCommand('show me the categories'), { kind: 'list' }));
check('cmd: categorize this', eq(parseCategoryCommand('categorize this as ship safety'), { kind: 'categorize', name: 'ship safety' }));
check('cmd: categorize with trailing comma', eq(parseCategoryCommand('categorize this as ship safety, please'), { kind: 'categorize', name: 'ship safety' }));
check('cmd: "tag the bags" is a save, not a command', parseCategoryCommand('tag the bags for the laundry') === null);
check('cmd: note starting with a tag is not a select', parseCategoryCommand('#ship safety drill at 9am') === null);
check('cmd: bare tag with please still selects', eq(parseCategoryCommand('#ship safety please'), { kind: 'select', name: 'ship safety' }));
check('cmd: show me the X category selects', eq(parseCategoryCommand('show me the ship safety category'), { kind: 'select', name: 'ship safety' }));
check('cmd: show me the categories still lists', eq(parseCategoryCommand('show me the categories'), { kind: 'list' }));
check('cmd: compound clear loses nothing silently', parseCategoryCommand('clear category and show me the drill') === null);
check('cmd: compound list loses nothing silently', parseCategoryCommand('list categories for the drill') === null);
check('cmd: clear with please still clears', eq(parseCategoryCommand('clear category please'), { kind: 'clear' }));
check('cmd: bare tag is an ask, never a save', classifyIntent('#ship safety').intent === 'ask' && classifyIntent('#ship safety').sure);

/* ---------------- engine: general search untouched ---------------- */
clearActiveCategory();
check('general: drill found', has(localEngine.run(recs, 'when is the drill'), 'drill'));
check('general: laundry found', has(localEngine.run(recs, 'when is the laundry open'), 'laundry'));

/* ---------------- engine: select, then ask ---------------- */
clearActiveCategory();
{
  const sel = localEngine.run(recs, '#ship safety');
  check('select: confirmation names it', (sel.answer ?? '').includes('Ship safety category selected'));
  check('select: active after select', getActiveCategory() === 'ship safety');
  const q = localEngine.run(recs, 'when is the drill');
  check('scoped: only ship-safety records', q.results.length === 2 && has(q, 'drill') && has(q, 'multi'));
  check('scoped: provenance names it', (q.interpText || '').includes('category: ship safety'));
  const miss = localEngine.run(recs, 'when is the gym open');
  check('miss: nothing in the category', miss.results.length === 0 && miss.categoryMiss === 'ship safety');
  check('miss: answer says so', (miss.answer ?? '').startsWith('Nothing in ship safety'));
  const clr = localEngine.run(recs, 'clear category');
  check('clear: confirmation', (clr.answer ?? '').includes('Category cleared'));
  check('clear: active is gone', getActiveCategory() === null);
  check('clear: gym found again', has(localEngine.run(recs, 'when is the gym open'), 'gym'));
}

/* ---------------- engine: tag inside the question ---------------- */
clearActiveCategory();
{
  const q = localEngine.run(recs, 'when is the drill #ship safety');
  check('tag-in-question: scoped', q.results.length === 2 && has(q, 'drill') && has(q, 'multi'));
  check('tag-in-question: selects it too', getActiveCategory() === 'ship safety');
}

/* ---------------- engine: spoken form + misheard name ---------------- */
clearActiveCategory();
{
  const spoken = localEngine.run(recs, 'hashtag ship safety');
  check('spoken: hashtag selects', getActiveCategory() === 'ship safety' && (spoken.answer ?? '').includes('Ship safety'));
  clearActiveCategory();
  localEngine.run(recs, 'hashtag ship safty');
  check('spoken: misheard name finds the category', getActiveCategory() === 'ship safety');
}

/* ---------------- engine: timeout (a few minutes, no questions) ---------------- */
clearActiveCategory();
{
  setActiveCategory('ship safety', Date.now() - CATEGORY_TIMEOUT_MS - 1000);
  const q = localEngine.run(recs, 'when is the gym open');
  check('timeout: expired, general search again', has(q, 'gym') && !q.categoryMiss);
  check('timeout: active is gone', getActiveCategory() === null);
}

/* ---------------- engine: list, categorize, date, list-all ---------------- */
clearActiveCategory();
{
  const list = localEngine.run(recs, 'list categories');
  check('list: names them', ['ship safety', 'money', 'fire drill'].every((c) => (list.answer ?? '').includes(c)));
  const cat = localEngine.run(recs, 'categorize this as ship safety');
  check('categorize: action returned', eq(cat.categoryAction, { kind: 'categorize', name: 'ship safety' }));
  const dated = localEngine.run(recs, 'what do I have on June 21 #ship safety');
  check('date + category: only the ship record', dated.results.length === 1 && has(dated, 'duty'));
  localEngine.run(recs, '#ship safety');
  const all = localEngine.run(recs, 'list all notes');
  check(
    'list-all: scoped too',
    all.results.length === 4 && ['drill', 'lifeboat', 'multi', 'duty'].every((id) => has(all, id)),
    titles(all).join(' | '),
  );
}

/* ---------------- engine: hard edges ---------------- */
clearActiveCategory();
{
  const empty = localEngine.run(recs, '#crew welfare');
  check('empty category: says nothing saved yet', (empty.answer ?? '').includes('nothing saved in it yet'));
  const miss = localEngine.run(recs, 'when is the drill');
  check('empty category: miss, general would find it', miss.results.length === 0 && miss.categoryMiss === 'crew welfare');
  clearActiveCategory();
  localEngine.run(recs, '#ship');
  const sub = localEngine.run(recs, 'when is the drill');
  check('substring category: "ship" is not "ship safety"', sub.results.length === 0 && sub.categoryMiss === 'ship');
  clearActiveCategory();
  const bare = localEngine.run(recs, '#');
  check('bare #: no category set, no crash', getActiveCategory() === null && bare.results.length === 0);
  // A record that matches only through its tag's words must not answer a
  // question about something else ("when is the drill" ≠ the lifeboat record).
  // (General search finds nothing here either — the point is the record stays out.)
  const tagOnly: Rec[] = [R('lifeboat', 'Lifeboat inspection every Sunday', 'Check the davits #ship safety at 9am')];
  const leak = localEngine.run(tagOnly, 'when is the drill #ship safety');
  check('tag words are not keywords', leak.results.length === 0, titles(leak).join(' | '));
  // A pointed-at record outside the category stays outside it (hinted title).
  learnRecord('when is the payday', 'Payday June 21');
  localEngine.run(recs, '#ship safety');
  const hint = localEngine.run(recs, 'when is the payday');
  check('pointed-at record outside the category stays out', hint.results.length === 0 && hint.categoryMiss === 'ship safety', titles(hint).join(' | '));
  clearActiveCategory();
  check('pointed-at record found again once cleared', has(localEngine.run(recs, 'when is the payday'), 'payday'));
}

/* ---------------- engine: trailing words never invent a category ---------------- */
clearActiveCategory();
{
  const q = localEngine.run(recs, 'when is the drill #ship safety tomorrow');
  check('phantom: trailing word falls back to the known category', q.results.length === 2 && has(q, 'drill') && has(q, 'multi') && getActiveCategory() === 'ship safety', titles(q).join(' | '));
  clearActiveCategory();
  const sel = localEngine.run(recs, '#ship safety tomorrow');
  check('phantom: bare select with a trailing word', getActiveCategory() === 'ship safety' && (sel.answer ?? '').includes('Ship safety category selected'));
  clearActiveCategory();
  const notes = localEngine.run(recs, 'when is the drill #ship safety notes');
  check('phantom: trailing "notes" falls back too', notes.results.length === 2 && getActiveCategory() === 'ship safety');
  clearActiveCategory();
}

/* ---------------- engine: a command refreshes the 5-minute clock ---------------- */
clearActiveCategory();
{
  setActiveCategory('ship safety', Date.now() - CATEGORY_TIMEOUT_MS + 1000);
  localEngine.run(recs, 'list categories');
  check('timeout: list refreshes the clock', getActiveCategory(Date.now() + 3000) === 'ship safety');
  clearActiveCategory();
}

/* ---------------- engine: switch off means off ---------------- */
clearActiveCategory();
{
  setCategoriesEnabled(false);
  try {
    const bare = classifyIntent('#ship safety');
    check('off: a bare tag is not a command', !(bare.intent === 'ask' && bare.sure));
    const q = localEngine.run(recs, '#ship safety');
    check('off: tag is just text, general search', q.results.length > 0 && getActiveCategory() === null && !q.category);
  } finally {
    setCategoriesEnabled(true);
  }
  const bareOn = classifyIntent('#ship safety');
  check('off: back on, a bare tag is a command again', bareOn.intent === 'ask' && bareOn.sure);
  clearActiveCategory();
}

console.log('---');
console.log(`Category sim: ${pass}/${total}`);
if (pass !== total) process.exitCode = 1;
