/**
 * Words that mean the same thing when you ask and when a record was saved.
 * Whole words only for the short forms, so "dr" does not match "drill".
 * "doc" is a doctor and a document. "doctor" and "dr" stay doctors.
 * Month names are not here — "deck" stays a place, not December.
 */
const GROUPS: string[][] = [
  ['birthday', 'bday'],
  ['doctor', 'doc', 'dr'],
  ['shift', 'duty'],
  ['captain', 'capt'],
  ['appointment', 'appt'],
  ['meeting', 'meetup'],
  ['booking', 'reservation'],
  ['task', 'todo', 'to-do', 'errand', 'chore'],
  // build 120: words people say for the same thing
  ['fridge', 'refrigerator'],
  ['wifi', 'wi-fi', 'internet'],
  ['party', 'gathering', 'celebration'],
  ['salary', 'wage', 'wages', 'payday', 'pay day'],
  ['flight', 'plane', 'airplane'],
  ['groceries', 'grocery', 'market', 'shopping'],
  ['dentist', 'dental'],
  // build 121: a number said in words or digits ("two chicken" = "2 chickens"). 1 is left out: "one" is also a pronoun.
  ['2', 'two'], ['3', 'three'], ['4', 'four'], ['5', 'five'], ['6', 'six'], ['7', 'seven'], ['8', 'eight'], ['9', 'nine'], ['10', 'ten'], ['12', 'twelve'], ['20', 'twenty'],
];

const INDEX = new Map<string, string[]>();
for (const group of GROUPS) {
  const forms = group.map((w) => w.toLowerCase());
  for (const w of forms) INDEX.set(w, forms);
}

/** True when this token has other words that mean the same thing. */
export function isSynonymWord(word: string): boolean {
  return lookupKeys(word).some((k) => INDEX.has(k));
}

function lookupKeys(word: string): string[] {
  const w = word.toLowerCase();
  const keys = [w];
  if (w.length > 3 && w.endsWith('ies')) keys.push(w.slice(0, -3) + 'y');
  if (w.length > 3 && w.endsWith('s')) keys.push(w.slice(0, -1));
  if (w.length > 4 && w.endsWith('es')) keys.push(w.slice(0, -2));
  return keys;
}

function formsOf(word: string): string[] {
  const keys = lookupKeys(word);
  let forms: string[] | undefined;
  for (const key of keys) {
    const group = INDEX.get(key);
    if (group) { forms = group; break; }
  }
  const out = new Set(forms ?? [word.toLowerCase()]);
  // "doc" names either thing. Asking for the doctor, or for the document, stays on that one.
  if (keys.some((k) => k === 'doc' || k === 'docs')) {
    out.add('document');
    out.add('documents');
    out.add('docs');
  } else if (keys.some((k) => k === 'document' || k === 'documents')) {
    out.add('doc');
    out.add('docs');
    out.add('document');
  }
  return [...out];
}

/** One slip apart: a letter changed, dropped, added, or two side by side swapped. */
/** One edit apart: one letter changed, two swapped, or one inserted/deleted. */
export function oneSlip(a: string, b: string): boolean {
  if (a === b) return true;
  const d = a.length - b.length;
  if (d > 1 || d < -1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (d === 0) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // one letter changed
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // two swapped
  }
  return d > 0 ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}



/**
 * build 121: word endings. "cooking" finds "cooks", "berries" finds "berry", "moved" finds "move".
 * Only the start of a word in the record has to agree, and only for stems of 4+ letters.
 */
function stemsOf(w: string): string[] {
  const out: string[] = [];
  const add = (x: string) => { if (x.length >= 3 && x !== w && !out.includes(x)) out.push(x); };
  if (w.length > 5 && w.endsWith('ing')) {
    const b = w.slice(0, -3);
    add(b);
    if (/(.)\1$/.test(b)) add(b.slice(0, -1)); // running → run
  }
  if (w.length > 4 && w.endsWith('ed')) {
    add(w.slice(0, -2));
    add(w.slice(0, -1)); // moved → move
  }
  if (w.length > 4 && w.endsWith('ies')) add(w.slice(0, -3) + 'y'); // berries → berry
  return out;
}



/**
 * build 121: the loose rules (typos, endings) cost a little on every record that does not match. Airem
 * first searches with exact words only and turns these on just when that finds nothing (see runLocal).
 */
let loose = true;
export function setLooseMatching(on: boolean): void {
  loose = on;
}

/** True while the loose pass is on (second runLocal pass). */
export function looseMatching(): boolean {
  return loose;
}

/**
 * A keyword prepared ONCE per question: its synonym forms (with the short-form
 * word-boundary regex precompiled), its plural stem, and its word-ending stems.
 * Before, every wordIn call re-derived all of this for every record — formsOf,
 * stemsOf, a fresh RegExp per short form, and a fresh split of the record text
 * inside stemIn/nearlyIn. Same matches, the derivation happens once.
 */
export interface PreparedWord {
  w: string;
  forms: { form: string; re: RegExp | null }[];
  pluralStem: string | null;
  stems: string[];
}

export function prepareWord(word: string): PreparedWord {
  const w = word.toLowerCase();
  const forms = formsOf(w).map((form) => ({
    form,
    re:
      form.length <= 4 && (INDEX.has(form) || form === 'docs')
        ? new RegExp(`(?:^|[^a-z0-9])${form}(?=[^a-z0-9]|$)`)
        : null,
  }));
  let pluralStem: string | null = null;
  if (w.length > 4 && /s$/.test(w)) {
    const stem = w.replace(/(?:es|s)$/, '');
    if (stem !== w) pluralStem = stem;
  }
  return { w, forms, pluralStem, stems: stemsOf(w) };
}

/**
 * Exact-word match only: the word, its synonyms and forms, plus the plural stem.
 * No typo or word-ending rules — so a score can tell an exact hit from a guess.
 */
export function wordInExactP(hay: string, p: PreparedWord): boolean {
  const raw = hay.toLowerCase();
  if (!p.w) return false;
  if (p.forms.some(({ form, re }) => (re ? re.test(raw) : raw.includes(form)))) return true;
  // "chickens" still finds "chicken" for words that are not in a group.
  if (p.pluralStem && raw.includes(p.pluralStem)) return true;
  return false;
}

export function wordInExact(hay: string, word: string): boolean {
  return wordInExactP(hay, prepareWord(word));
}

function stemInTokens(tokens: string[], stems: string[]): boolean {
  if (!stems.length) return false;
  // A stem of 4+ letters may wear s, es, ed, or ing. A 3-letter stem ("run") matches only that word,
  // so "cooking" finds "cook" and "cooks" and leaves "cookie" alone.
  const tail = ['', 's', 'es', 'ed', 'ing'];
  for (const tok of tokens) {
    for (const st of stems) {
      if (st.length < 4) {
        if (tok === st) return true;
      } else if (tail.some((e) => tok === st + e)) return true;
    }
  }
  return false;
}

function nearlyInTokens(tokens: string[], w: string): boolean {
  if (w.length < 6 || /\d/.test(w)) return false;
  for (const tok of tokens) {
    if (tok.length < 5 || tok[0] !== w[0]) continue;
    if (oneSlip(w, tok)) return true;
  }
  return false;
}

/** Loose match only: typo and word-ending rules. Off unless the loose pass is on. */
export function wordInLooseP(tokens: string[], p: PreparedWord): boolean {
  if (!loose) return false;
  if (!p.w) return false;
  return stemInTokens(tokens, p.stems) || nearlyInTokens(tokens, p.w);
}

export function wordInLoose(hay: string, word: string): boolean {
  return wordInLooseP(hay.toLowerCase().split(/[^a-z0-9]+/), prepareWord(word));
}

/** Does this record text contain the word, or another word that means the same thing? */
export function wordInP(hay: string, tokens: string[], p: PreparedWord): boolean {
  return wordInExactP(hay, p) || wordInLooseP(tokens, p);
}

export function wordIn(hay: string, word: string): boolean {
  const raw = hay.toLowerCase();
  const p = prepareWord(word);
  return wordInExactP(raw, p) || wordInLooseP(raw.split(/[^a-z0-9]+/), p);
}
