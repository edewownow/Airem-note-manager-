/**
 * Spoken replies (TTS wording) — what the phone SAYS for a query result (1.8.0).
 *
 * Written for the ear, not the screen:
 *   - relative days ("tonight", "tomorrow", "on Wednesday") instead of "Wed, Oct 28";
 *     the full date only when it's more than a week away (plus the year if it isn't this year)
 *   - clock times as people say them ("9:30 in the morning", "8 in the evening", "noon")
 *   - a day is said ONCE, then that day's items follow ("Tomorrow: Crew drill at 9:30 in the
 *     morning, then Port talk at 10.")
 *   - where / with whom for the items that are read out
 *   - no symbols or abbreviations (·, —, Oct, Wed) that Android TTS reads badly
 *   - grammatical empty answers ("Nothing on Friday.", "Nothing coming up.")
 *
 * Reads ONLY stored fields — never invents. Pure (no React / no persistence) so it can be
 * checked offline. `now` is injectable for tests; day words resolve against the phone's clock.
 */
import type { Rec } from '../types';
import type { QueryResult } from './query';
import { findAmount, isPastEvent, saysPlace, sumAmounts } from './query';
import { iso, parseISO } from './datetime';
import { todoBody } from './command';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** How many items are read out before "and N more". */
const READ_LIMIT = 3;

const EVENT_TYPES = new Set(['event', 'appointment', 'meeting', 'reminder']);

/* ---------------- time + day words ---------------- */

function minutesOf(time: string | null): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  return m ? +m[1] * 60 + +m[2] : null;
}

/** "9:30 in the morning", "3 in the afternoon", "8 in the evening", "noon", "midnight". */
export function sayTime(time: string | null): string {
  const min = minutesOf(time);
  if (min == null) return '';
  if (min === 0) return 'midnight';
  if (min === 720) return 'noon';
  const h24 = Math.floor(min / 60);
  const mm = min % 60;
  const h = h24 % 12 || 12;
  const clock = mm ? `${h}:${String(mm).padStart(2, '0')}` : `${h}`;
  const part =
    h24 < 5 ? 'at night' : h24 < 12 ? 'in the morning' : h24 < 17 ? 'in the afternoon' : h24 < 21 ? 'in the evening' : 'at night';
  return `${clock} ${part}`;
}

function dayDiff(dateIso: string, now: Date): number {
  const a = parseISO(dateIso);
  const b = parseISO(iso(now));
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

/** "the 28th" style ordinal for spoken dates. */
function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${s}`;
}

/**
 * A day as said aloud. `evening` lets today become "tonight" when the item is after 5 PM.
 * Within a week: "today" / "tomorrow" / "yesterday" / "on Wednesday" / "last Friday";
 * further out: "on Wednesday, October 28th" (+ year when it isn't this year).
 */
export function sayDay(dateIso: string, now: Date, evening = false): string {
  const diff = dayDiff(dateIso, now);
  const d = parseISO(dateIso);
  if (diff === 0) return evening ? 'tonight' : 'today';
  if (diff === 1) return evening ? 'tomorrow night' : 'tomorrow';
  if (diff === -1) return evening ? 'last night' : 'yesterday';
  if (diff > 1 && diff < 7) return `on ${WEEKDAYS[d.getDay()]}`;
  if (diff < -1 && diff > -7) return `last ${WEEKDAYS[d.getDay()]}`;
  const year = d.getFullYear() !== now.getFullYear() ? `, ${d.getFullYear()}` : '';
  return `on ${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${ordinal(d.getDate())}${year}`;
}

/** Day words with a leading capital, for the start of a sentence. */
function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Day word without "on " — for a sentence-leading day ("Wednesday: …"). */
function dayHeading(dateIso: string, now: Date, evening: boolean): string {
  return cap(sayDay(dateIso, now, evening).replace(/^on /, ''));
}

/** Strip characters TTS reads badly (bullets, dashes, pipes) without changing words. */
function clean(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/\s*[·•|]\s*/g, ', ')
    .replace(/\s+[—–-]\s+/g, ', ')
    .replace(/\$\s?(\d[\d,]*(?:\.\d+)?)/g, '$1 dollars') // "$25" → "25 dollars" (1.9.4)
    .replace(/(\d[\d,]*(?:\.\d+)?)\s?\$/g, '$1 dollars') // "25$" → "25 dollars"
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const PART = / (in the morning|in the afternoon|in the evening|at night)$/;

/**
 * "<title> at 9:30 in the morning in the Main dining room with Sam" (day said elsewhere).
 * `skipPart` drops a part of day the listener already heard — the previous item's, or the
 * one the heading implies ("Tonight:" already means evening).
 */
function itemPhrase(r: Rec, skipPart: string | null = null): string {
  let s = clean(r.title) || 'An untitled item';
  let t = sayTime(r.time);
  const part = PART.exec(t)?.[1] ?? null;
  if (part && part === skipPart) t = t.replace(PART, '');
  if (t) s += ` at ${t}`;
  if (r.location) s += ` in ${clean(r.location)}`;
  if (r.people) s += ` with ${clean(r.people)}`;
  return s;
}

/* ---------------- the window that was asked about ---------------- */

/** "today", "tomorrow", "on Friday", "this week", "coming up", "in the past" — or null. */
function windowPhrase(r: QueryResult, now: Date): string | null {
  if (r.range && r.range.start === r.range.end) return sayDay(r.range.start, now);
  if (r.label === 'upcoming') return 'coming up';
  if (r.label === 'past') return 'in the past';
  if (r.label) return r.label; // "this week", "next month", "last week" read naturally as-is
  return null;
}

/* ---------------- direct answers (when / where / who / how much) ---------------- */

function directAnswer(r: QueryResult, now: Date): string | null {
  const b = r.best;
  if (!b || !r.intent) return null;
  const title = clean(b.title) || 'That';
  // A past event is spoken in the past tense ("Dentist was yesterday …") (1.9.2)
  const was = isPastEvent(b, now) || (!!b.date && b.date < iso(now));
  const is = was ? 'was' : 'is';
  let line: string;
  switch (r.intent) {
    case 'when': {
      if (!b.date && !b.time) {
        line = `${title} has no date saved.`;
        break;
      }
      const evening = (minutesOf(b.time) ?? 0) >= 17 * 60;
      const day = b.date ? sayDay(b.date, now, evening) : '';
      const time = sayTime(b.time);
      // "tonight at 8 in the evening" doubles up — drop the part-of-day after tonight/night
      const t = /night$/.test(day) ? time.replace(/ in the evening| at night/, '') : time;
      const place = b.location ? `, at ${clean(b.location)}` : '';
      line = `${title} ${is} ${[day, t ? `at ${t}` : ''].filter(Boolean).join(' ')}${place}.`;
      // Looking back: name the visit before this one instead of a bare "one more match"
      const prev = was ? r.results.find((x) => x !== b && x.date && isPastEvent(x, now)) : null;
      if (prev && prev.date) {
        line += ` Before that, ${clean(prev.title)} ${sayDay(prev.date, now)}.`;
        return line + moreAfter(r.results.length - 2);
      }
      break;
    }
    case 'where':
      // build 99: a note that says its place itself ("There are two chicken on the fridge") is the answer
      line = b.location ? `${title} ${is} in ${clean(b.location)}.` : saysPlace(b.title) ? `${title}.` : `${title} has no place saved.`;
      break;
    case 'say': {
      // build 99: the note's own words are the answer.
      // A pasted question's answer is in notes; the title is the question.
      const said = b.via === 'Pasted text' && b.notes?.trim() ? clean(b.notes) : title;
      line = /[.!?]$/.test(said) ? said : `${said}.`;
      break;
    }
    case 'who':
      line = b.people ? `${title} ${is} with ${clean(b.people)}.` : `${title} has nobody saved with it.`;
      break;
    case 'price': {
      const total = sumAmounts(r.results);
      if (total) return `The total is ${total}.`;
      const amt = findAmount(b);
      line = amt ? `${title} is ${amt}.` : b.notes ? `${title}: ${clean(b.notes)}.` : `${title} has no price saved.`;
      break;
    }
  }
  const next = r.results.find((x) => x !== b);
  const nextTitle = next ? clean(next.title) : '';
  return line + moreAfter(r.results.length - 1, nextTitle);
}

function moreAfter(others: number, nextTitle = ''): string {
  if (others <= 0) return '';
  if (nextTitle && others === 1) return ` There’s also ${nextTitle}.`;
  if (nextTitle) return ` There’s also ${nextTitle}, and ${others - 1} more.`;
  return others === 1 ? ' There’s one more match.' : ` There are ${others} more matches.`;
}

/* ---------------- lists ---------------- */

function listReply(r: QueryResult, now: Date): string {
  const { results } = r;
  const n = results.length;
  const allEvents = results.every((x) => EVENT_TYPES.has((x.type || '').toLowerCase()));
  const noun = allEvents ? (n === 1 ? 'event' : 'events') : n === 1 ? 'thing' : 'things';
  const win = windowPhrase(r, now);

  // A single-day question already names the day, so items on it don't repeat it.
  const singleDay = r.range && r.range.start === r.range.end ? r.range.start : null;

  const count = n === 1 ? `one ${noun}` : `${n} ${noun}`;
  const head =
    r.label === 'past'
      ? `${cap(count)} in the past.`
      : win
        ? `You ${r.lookingBack ? 'had' : 'have'} ${count} ${win}.`
        : `I found ${count}.`;

  const read = results.slice(0, READ_LIMIT);
  const parts: string[] = [];
  let i = 0;
  while (i < read.length) {
    const date = read[i].date || null;
    const group: Rec[] = [];
    while (i < read.length && (read[i].date || null) === date) group.push(read[i++]);
    const evening = group.every((x) => (minutesOf(x.time) ?? -1) >= 17 * 60);
    const heading = date && date !== singleDay ? dayHeading(date, now, evening) : '';
    let heard: string | null = /night$/i.test(heading) ? 'in the evening' : null;
    const items = group.map((x) => {
      const phrase = itemPhrase(x, heard);
      heard = PART.exec(sayTime(x.time))?.[1] ?? heard;
      return phrase;
    });
    const joined =
      items.length === 1 ? items[0] : items.slice(0, -1).join(', ') + ', then ' + items[items.length - 1];
    if (!date) {
      // build 99: "no date set" only for schedule items — a note never needed one
      const sched = group.some((x) => EVENT_TYPES.has((x.type || '').toLowerCase()));
      parts.push(`${joined}${!sched ? '' : group.length === 1 ? ', no date set' : ', no dates set'}.`);
    } else if (date === singleDay) {
      parts.push(`${cap(joined)}.`);
    } else {
      parts.push(`${heading}: ${joined}.`);
    }
  }
  const rest = n - read.length;
  const tail = rest > 0 ? (rest === 1 ? ' And one more.' : ` And ${rest} more.`) : '';
  return `${head} ${parts.join(' ')}${tail}`;
}

/* ---------------- entry point ---------------- */

/** What the phone says for a query result. */
export function spokenReply(r: QueryResult, now: Date = new Date()): string {
  if (r.spoken) return r.spoken;
  if (r.closest && r.results.length) {
    const body = directAnswer(r, now) ?? listReply(r, now);
    return `Leaving out ${r.closest}. ${body}`;
  }
  if (!r.results.length) {
    if (r.interpText.startsWith('list: ') && r.answer) return `${r.answer}.`; // 2.0.0: "list all reminders"
    // Categories: a command's answer is the reply ("Ship safety category
    // selected."), and a category miss says so — speak it, not the generic line.
    if (r.answer) return r.answer.endsWith('.') ? r.answer : `${r.answer}.`;
    const win = windowPhrase(r, now);
    if (win) return `Nothing ${win}.`;
    if (r.keywordsDisplay.length) return `I couldn’t find anything about ${r.keywordsDisplay.join(' ')}.`;
    return 'I couldn’t find anything for that.';
  }
  return directAnswer(r, now) ?? listReply(r, now);
}

/* ---------------- read-back after a voice save (1.9.0, all voice saves 1.9.4) ---------------- */

/** Longest title read back, in words — a long voice note is cut with "…" (the record keeps it all). */
const CONFIRM_TITLE_WORDS = 25;

/**
 * What the phone says after a voice save — the stored fields, so the user hears exactly what was
 * kept.
 *
 * A spoken COMMAND (the user named the label):
 *   "Scheduled. Dentist tomorrow at 3 in the afternoon, at Main clinic, with Dr Cruz."
 *   reminders → "Reminder set. …", notes → "Noted. …".
 * NO TRIGGER said (`picked` — MemoAirem chose the label, 1.9.4), it says which label it chose:
 *   "I put a reminder for you to buy a bread on your way home."
 *   "I put it on your schedule: Dinner with Sam on Friday at 7 in the evening."
 *   "I saved it as a note: Penfolds Chardonnay, 25 dollars."  (a note is read WITH its details)
 * "No date set" is said only for schedule items.
 */
export function spokenConfirm(rec: Rec, now: Date = new Date(), picked = false): string {
  const type = (rec.type || '').toLowerCase();
  const words = clean(rec.title).split(' ').filter(Boolean);
  const title =
    words.length > CONFIRM_TITLE_WORDS ? words.slice(0, CONFIRM_TITLE_WORDS).join(' ') + '…' : words.join(' ');
  const evening = (minutesOf(rec.time) ?? 0) >= 17 * 60;
  const day = rec.date ? sayDay(rec.date, now, evening) : '';
  let t = sayTime(rec.time);
  if (/night$/.test(day)) t = t.replace(/ in the evening| at night/, '');
  const when = [day, t ? `at ${t}` : ''].filter(Boolean).join(' ');
  const extra: string[] = [];
  if (rec.location) extra.push(`at ${clean(rec.location)}`);
  if (rec.people) extra.push(`with ${clean(rec.people)}`);

  if (picked) {
    const body = [title || 'Untitled', when].filter(Boolean).join(' ');
    const tail = [body, ...extra].join(', ');
    if (type === 'reminder') {
      const todo = todoBody(title);
      return todo
        ? `I put a reminder for you to ${[toYou(lowerFirst(todo)), when, ...extra.map(toYou)].filter(Boolean).join(' ')}.`
        : `I put a reminder for you: ${tail}.`;
    }
    if (EVENT_TYPES.has(type)) return `I put it on your schedule: ${tail}${when ? '' : ', no date set'}.`;
    // A note is read with its details, so a price or code kept in notes is heard ("Penfolds
    // Chardonnay, 25 dollars") — skipped when the notes just repeat the title (a long voice note).
    const detail = clean(rec.notes);
    const said = detail && !detail.startsWith(clean(rec.title).slice(0, 40)) ? `${tail}, ${detail}` : tail;
    const all = said.split(' ').filter(Boolean);
    const capped = all.length > CONFIRM_TITLE_WORDS ? all.slice(0, CONFIRM_TITLE_WORDS).join(' ') + '…' : all.join(' ');
    return `I saved it as a note: ${capped}.`;
  }

  const lead =
    type === 'reminder' ? 'Reminder set.' : type === 'note' ? 'Noted.' : EVENT_TYPES.has(type) ? 'Scheduled.' : 'Saved.';
  const bits: string[] = [title || 'Untitled'];
  if (when) bits[0] += ` ${when}`;
  else if (EVENT_TYPES.has(type)) bits[0] += ', no date set';
  return `${lead} ${[...bits, ...extra].join(', ')}.`;
}

/**
 * Said back to the user, "my" becomes "your": "wash my uniform" → "…for you to wash your uniform".
 * Read-back only — the saved record keeps the words as spoken.
 */
function toYou(s: string): string {
  const map: Record<string, string> = { my: 'your', mine: 'yours', me: 'you', myself: 'yourself', "i'm": "you're", i: 'you', "i've": "you've", "i'll": "you'll" };
  return s.replace(/\b(my|mine|me|myself|i'm|i've|i'll|i)\b/gi, (w) => map[w.toLowerCase()] ?? w);
}

/** "Buy a bread" → "buy a bread" — only the first letter, so names keep their capitals. */
function lowerFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}
