/**
 * Gemma on the phone. The live answer path (lib/gemmaLive.ts) uses these checks.
 *
 * Pure (no React Native) so it is tested in node (scripts/gemma-sim.ts). The Kotlin side
 * (modules/memoairem-llm) only runs the model; everything that decides whether an answer may be
 * USED lives here:
 *
 *   1. The rules (lib/query.ts) pick the few records the question is about — Gemma never sees the
 *      whole store, and never anything from the Private folder.
 *   2. Gemma must reply in one fixed JSON shape ({found, answer, ids}) — forced by the runtime.
 *   3. checkReply() throws the answer away unless: it names records that were really given, and
 *      every number in it (a time, a date, an amount) appears in those records. Anything else →
 *      the rules' answer, exactly as today.
 */
import type { Rec } from '../types';

export const GEMMA_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    found: { type: 'boolean' },
    answer: { type: 'string' },
    ids: { type: 'array', items: { type: 'string' } },
  },
  required: ['found', 'answer', 'ids'],
});

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// Spoken aloud, "Dec" and "Nov" are not "December" and "November". Whole words only — "deck" stays a place.
const MONTH_SAID: [RegExp, string][] = [
  [/\bjan\b/gi, 'January'],
  [/\bfeb\b/gi, 'February'],
  [/\bmar\b/gi, 'March'],
  [/\bapr\b/gi, 'April'],
  [/\bjun\b/gi, 'June'],
  [/\bjul\b/gi, 'July'],
  [/\baug\b/gi, 'August'],
  [/\bsept?\b/gi, 'September'],
  [/\boct\b/gi, 'October'],
  [/\bnov\b/gi, 'November'],
  [/\bdec\b/gi, 'December'],
];

/** The sentence Gemma will say, with month names written in full. */
export function sayMonths(text: string): string {
  let out = text;
  for (const [re, full] of MONTH_SAID) out = out.replace(re, full);
  return out;
}
const NOTES_MAX = 300; // per record, so 8 records stay well inside the model's window

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Days from today to an ISO date. Local dates, so a DST shift doesn't land on the wrong day. */
function dayOffset(isoDate: string, now: Date): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((dt.getTime() - today.getTime()) / 86400000);
}

/** "tomorrow" / "in 4 days" — a small model will not do this calendar step itself. */
function relativeDay(isoDate: string, now: Date): string {
  const n = dayOffset(isoDate, now);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 1 && n <= 14) return `in ${n} days`;
  if (n < -1 && n >= -14) return `${-n} days ago`;
  return '';
}

/** "2026-10-31" → "Saturday 31 October 2026 (in 2 days)". Full names: a short month is read as letters. */
function readableDate(isoDate: string, now: Date): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const rel = relativeDay(isoDate, now);
  return `${WD[dt.getDay()]} ${d} ${MONTHS[m - 1]} ${y}${rel ? ` (${rel})` : ''}`;
}

/** "13:00" → "1 PM" */
function readableTime(t: string): string {
  const [h, mm] = t.split(':').map(Number);
  return `${h % 12 || 12}${mm ? ':' + String(mm).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Short ids (r1, r2 …) — the model copies them back more reliably than "e1730195512345". */
export function shortIds(recs: Rec[]): Map<string, Rec> {
  const m = new Map<string, Rec>();
  recs.forEach((r, i) => m.set(`r${i + 1}`, r));
  return m;
}

/** One line per record — only the fields that are filled. */
export function recordLines(ids: Map<string, Rec>, now: Date = new Date()): string {
  const out: string[] = [];
  for (const [id, r] of ids) {
    const bits = [`[${id}] ${r.type || 'item'}: "${(r.title || '').replace(/\s+/g, ' ').trim()}"`];
    if (r.date) bits.push(`date ${readableDate(r.date, now)}`);
    if (r.time) bits.push(`time ${readableTime(r.time)}`);
    if (r.location) bits.push(`place ${r.location}`);
    if (r.people) bits.push(`people ${r.people}`);
    if (r.notes) {
      const n = r.notes.replace(/\s+/g, ' ').trim();
      bits.push(`notes ${n.length > NOTES_MAX ? n.slice(0, NOTES_MAX) + '…' : n}`);
    }
    out.push(bits.join(' · '));
  }
  return out.join('\n');
}

export function systemPrompt(now: Date = new Date()): string {
  return [
    `You answer the user's question using ONLY their saved records. Today is ${WD[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}.`,
    'Rules:',
    '- Use only facts written in the records. Never invent or guess a date, time, place, person, number or amount.',
    '- The words of a record are the fact. A place written in the title ("on the fridge", "under the mat") answers where.',
    '- A date answers when, even when there is no time. A date marked (tomorrow), (today) or (in N days) is that day — do not work it out yourself.',
    '- If the records answer the question: found=true, answer in one or two short spoken sentences, talking to the user as "you", and ids = the record ids you used.',
    '- The answer is spoken aloud. Do not put a record id in it. No "r1" and no "ids=". Ids belong only in the ids field.',
    '- If they do not answer it: found=false, answer="", ids=[].',
    '- Say dates as words ("Saturday 31 October"), times like "1 PM". Write the whole month (December, November), never Dec or Nov. No lists, no markdown.',
  ].join('\n');
}

export function userPrompt(question: string, ids: Map<string, Rec>, now: Date = new Date()): string {
  return `Records:\n${recordLines(ids, now)}\n\nQuestion: ${question.trim()}`;
}

export interface GemmaReply {
  found: boolean;
  answer: string;
  ids: string[];
}

export type CheckResult =
  | { ok: true; answer: string; used: Rec[] }
  | { ok: false; why: 'unreadable' | 'not-found' | 'no-ids' | 'unknown-id' | 'made-up-number' | 'empty'; detail?: string };

/** Pull the JSON out (the runtime forces the shape, but never trust it blindly). */
export function readReply(text: string): GemmaReply | null {
  const t = text.replace(/```(?:json)?/g, '').trim();
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    const j = JSON.parse(t.slice(a, b + 1));
    if (typeof j !== 'object' || j === null) return null;
    return {
      found: j.found === true,
      answer: typeof j.answer === 'string' ? j.answer.trim() : '',
      ids: Array.isArray(j.ids) ? j.ids.map((x: unknown) => String(x).replace(/[[\]\s]/g, '')) : [],
    };
  } catch {
    return null;
  }
}

/** Every number written in the records, the ways a person might say it ("13:00" → 13, 1, 00). */
function numbersIn(recs: Rec[]): Set<string> {
  const s = new Set<string>();
  const add = (n: string) => s.add(String(Number(n)));
  for (const r of recs) {
    const text = [r.title, r.notes, r.location, r.people].filter(Boolean).join(' ');
    (text.match(/\d+(?:[.,]\d+)?/g) ?? []).forEach((n) => add(n.replace(',', '.')));
    // "two chicken" may be said as "2" — a word-number in the record is that number
    const WORDS: Record<string, string> = {
      one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7',
      eight: '8', nine: '9', ten: '10', twelve: '12', twenty: '20',
    };
    for (const [w, n] of Object.entries(WORDS)) {
      if (new RegExp(`\\b${w}\\b`, 'i').test(text)) add(n);
    }
    if (r.date) {
      const [y, m, d] = r.date.split('-');
      add(y);
      add(m);
      add(d);
    }
    if (r.time) {
      const [h, mm] = r.time.split(':').map(Number);
      add(String(h));
      add(String(h % 12 || 12));
      add(String(mm));
    }
  }
  return s;
}

/** Record labels are for the check. The sentence the user hears does not say them. */
export function hideIds(answer: string): string {
  return answer
    .replace(/\bids\s*[:=]\s*(?:\[[^\]]*\]|r\d+(?:\s*,\s*r\d+)*)/gi, '')
    .replace(/[\[(]\s*r\d+\s*[\])]/gi, '')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** May Gemma's reply be used? Only when it is grounded in the records it was given. */
export function checkReply(text: string, ids: Map<string, Rec>): CheckResult {
  const r = readReply(text);
  if (!r) return { ok: false, why: 'unreadable', detail: text.slice(0, 80) };
  if (!r.found) return { ok: false, why: 'not-found' };
  const answer = hideIds(r.answer);
  if (!answer) return { ok: false, why: 'empty' };
  if (!r.ids.length) return { ok: false, why: 'no-ids' };
  const used: Rec[] = [];
  for (const id of r.ids) {
    const rec = ids.get(id);
    if (!rec) return { ok: false, why: 'unknown-id', detail: id };
    if (!used.includes(rec)) used.push(rec);
  }
  // a number in the answer that none of the used records holds = made up ("the meeting is at 3")
  const have = numbersIn(used);
  const said = (answer.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => String(Number(n.replace(',', '.'))));
  const bad = said.find((n) => !have.has(n));
  if (bad !== undefined) return { ok: false, why: 'made-up-number', detail: bad };
  return { ok: true, answer, used };
}

/* ---------------- choosing what Gemma reads ---------------- */

const SMALL = new Set(
  'the a an is are was were do does did i my me you your of on at in to for and or what whats where when who how which much many there any have has had about with from this that it its be'.split(' '),
);

/**
 * The records Gemma reads for a question: the rules' own matches first, then records sharing a word
 * with the question, then (only if nothing at all matched) the newest few. At most `max`.
 */
export function pickRecords(question: string, ruleHits: Rec[], saved: Rec[], max = 8): Rec[] {
  const out: Rec[] = [];
  const add = (r: Rec) => {
    if (out.length < max && !out.includes(r)) out.push(r);
  };
  ruleHits.forEach(add);
  if (out.length < max) {
    const words = question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !SMALL.has(w))
      .map((w) => (w.length > 4 ? w.replace(/(?:es|s)$/, '') : w));
    if (words.length) {
      for (const r of saved) {
        const hay = [r.title, r.notes, r.location, r.people, r.type].filter(Boolean).join(' ').toLowerCase();
        if (words.some((w) => hay.includes(w))) add(r);
      }
    }
  }
  if (!out.length) saved.slice(0, max).forEach(add);
  return out;
}

/* ---------------- the trial (Settings → Gemma trial) ---------------- */

const T = (o: Partial<Rec> & { title: string }): Rec => ({
  id: 't' + Math.random().toString(36).slice(2),
  type: 'note',
  date: null,
  time: null,
  location: null,
  people: null,
  notes: null,
  via: 'trial',
  imageId: null,
  thumb: null,
  ...o,
});

/** Made-up records for the trial — never the user's own (nothing personal is logged). */
export function trialRecords(now: Date = new Date()): Rec[] {
  const day = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    return iso(d);
  };
  return [
    T({ title: 'There are two chicken on the fridge' }),
    T({ title: 'The wifi password is printed on the bulletin board' }),
    T({ title: 'The spare key is under the mat' }),
    T({ title: 'Sam owes me 20 dollars' }),
    T({ title: 'My locker is number 12 on deck 4' }),
    T({ title: 'The gym opens at 6 am' }),
    T({ type: 'event', title: 'Meeting', date: day(2), time: '13:00' }),
    T({ type: 'event', title: 'Crew party', date: day(3), time: '20:00', location: 'Crew bar' }),
    T({ type: 'event', title: 'Dentist', date: day(1), time: '09:00', location: 'Main clinic', people: 'Dr Cruz' }),
    T({ type: 'reminder', title: 'Call mom', date: day(4) }),
    T({ type: 'note', title: 'Maria is Juan’s older sister' }),
    T({ type: 'invoice', title: 'Shore tour Santorini', notes: 'Total 85 EUR, paid by card' }),
  ];
}

export interface TrialCase {
  q: string;
  /** titles of the records that must be among the ids (empty = the answer must be "not found") */
  want: string[];
  /** words the answer must contain (lower case, any one of each group) */
  says?: string[][];
}

export const TRIAL_CASES: TrialCase[] = [
  { q: 'where is the chicken', want: ['There are two chicken on the fridge'], says: [['fridge']] },
  { q: 'how many chickens do I have', want: ['There are two chicken on the fridge'], says: [['two', '2']] },
  { q: "what's in the fridge", want: ['There are two chicken on the fridge'], says: [['chicken']] },
  { q: 'where can I find the wifi password', want: ['The wifi password is printed on the bulletin board'], says: [['bulletin']] },
  { q: 'where did I leave the spare key', want: ['The spare key is under the mat'], says: [['mat']] },
  { q: 'who owes me money', want: ['Sam owes me 20 dollars'], says: [['sam']] },
  { q: 'how much does Sam owe me', want: ['Sam owes me 20 dollars'], says: [['20', 'twenty']] },
  { q: 'which deck is my locker on', want: ['My locker is number 12 on deck 4'], says: [['4', 'four']] },
  { q: 'what time does the gym open', want: ['The gym opens at 6 am'], says: [['6', 'six']] },
  { q: 'when is the meeting', want: ['Meeting'], says: [['1 pm', '1:00', 'one']] },
  { q: 'where is the party', want: ['Crew party'], says: [['crew bar']] },
  { q: 'who am I seeing at the dentist', want: ['Dentist'], says: [['cruz']] },
  { q: 'what do I have tomorrow', want: ['Dentist'], says: [['dentist']] },
  { q: 'when do I need to call mom', want: ['Call mom'] },
  { q: 'who is Maria', want: ['Maria is Juan’s older sister'], says: [['juan']] },
  { q: 'how much was the Santorini tour', want: ['Shore tour Santorini'], says: [['85']] },
  { q: 'did I pay for the shore tour', want: ['Shore tour Santorini'], says: [['card', 'paid', 'yes']] },
  // nothing saved → must say not found (no making things up)
  { q: 'where is my passport', want: [] },
  { q: 'when is my flight home', want: [] },
  { q: 'what is the captain’s name', want: [] },
];

export interface TrialOutcome {
  q: string;
  pass: boolean;
  why: string; // short reason, for the screen + the log
  answer: string;
  ms: number;
}

/** Judge one trial reply. */
export function judgeTrial(c: TrialCase, text: string, ids: Map<string, Rec>, ms: number): TrialOutcome {
  const res = checkReply(text, ids);
  if (!c.want.length) {
    const pass = !res.ok;
    return { q: c.q, pass, why: pass ? 'said not found ✓' : 'answered something not saved ✗', answer: res.ok ? res.answer : '', ms };
  }
  if (!res.ok) return { q: c.q, pass: false, why: `rejected: ${res.why}${res.detail ? ' ' + res.detail : ''}`, answer: '', ms };
  const titles = res.used.map((r) => r.title);
  const missing = c.want.filter((t) => !titles.includes(t));
  if (missing.length) return { q: c.q, pass: false, why: `wrong record (${titles.join(', ')})`, answer: res.answer, ms };
  const a = res.answer.toLowerCase();
  const lacks = (c.says ?? []).find((group) => !group.some((w) => a.includes(w)));
  if (lacks) return { q: c.q, pass: false, why: `answer lacks “${lacks[0]}”`, answer: res.answer, ms };
  return { q: c.q, pass: true, why: 'right ✓', answer: res.answer, ms };
}
