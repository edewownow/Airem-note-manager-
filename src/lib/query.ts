/**
 * OFFLINE NL QUERY — the on-device intelligence for now. Interprets a plain
 * question into {range, keywords} then filters the local store. No network.
 *
 * SEAM (brief §9): the engine is exposed behind the QueryEngine interface so a
 * small on-device model could slot in later for fuzzy offline queries, and an
 * optional cloud pre-interpret (online only) can wrap it with LOCAL FALLBACK on
 * any failure — the default path is always pure-local.
 */
import { parseListAll, type RecordListType } from './listCommands';
import type { Rec } from '../types';
import { iso, parseISO, startOfWeek, MON, WD, spokenTime } from './datetime';
import { isSynonymWord, looseMatching, prepareWord, PreparedWord, setLooseMatching, wordIn, wordInExactP, wordInLooseP, wordInP } from './synonyms';
import { expandWords, hintedTitle } from './learning';
import { mendHearing } from './hear';
import {
  allCategories,
  categoriesEnabled,
  clearActiveCategory,
  extractTags,
  getActiveCategory,
  parseCategoryCommand,
  recordTags,
  resolveTag,
  setActiveCategory,
  stripTags,
  touchActiveCategory,
  type CategoryCommand,
} from './categories';

const DOW: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};
const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6,
  august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

// Spelled-out day numbers (ordinals) so a spoken "November fifth" / "the third"
// resolves the same as "November 5" / "3". Hyphen OR space accepted in the regex.
const DAY_WORDS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9,
  tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15,
  sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20,
  'twenty-first': 21, 'twenty-second': 22, 'twenty-third': 23, 'twenty-fourth': 24,
  'twenty-fifth': 25, 'twenty-sixth': 26, 'twenty-seventh': 27, 'twenty-eighth': 28,
  'twenty-ninth': 29, thirtieth: 30, 'thirty-first': 31,
  // Spoken as a count, not an ordinal: "December six", "December the six". Only ever
  // read next to a month (DAY_PAT), so "six chicken" and "deck four" stay what they are.
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  'twenty-one': 21, 'twenty-two': 22, 'twenty-three': 23, 'twenty-four': 24,
  'twenty-five': 25, 'twenty-six': 26, 'twenty-seven': 27, 'twenty-eight': 28,
  'twenty-nine': 29, thirty: 30, 'thirty-one': 31,
};

// Month token: an abbreviation or full name (the alternation captures the stem,
// the trailing [a-z]* absorbs the rest of "november"). Day token: digits with an
// OPTIONAL ordinal suffix ("5", "5th", "23rd"), or a spelled ordinal ("fifth").
// A real month word only — full name or standard abbreviation, as a WHOLE word. The old
// "(dec)[a-z]*" read "deck 4" as December 4th (and "marine 3" as March 3rd) — on a ship (1.9.3).
const MONTH_PAT =
  '(january|february|march|april|may|june|july|august|september|october|november|december|' +
  'jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)(?![a-z])';
const DAY_PAT =
  '(\\d{1,2}(?:st|nd|rd|th)?|' +
  // longest words first so "twenty-first" wins over "first", "thirteenth" over "third", etc.
  Object.keys(DAY_WORDS)
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/-/g, '[- ]'))
    .join('|') +
  ')';
const MD_FWD = new RegExp('\\b' + MONTH_PAT + '\\.?\\s+(?:the\\s+)?' + DAY_PAT + '\\b', 'i'); // "Nov 5th", "December the 6th"
const MD_REV = new RegExp('\\b' + DAY_PAT + '\\s+(?:of\\s+)?' + MONTH_PAT + '\\b', 'i'); // "5th of Nov"

/** A day token ("5", "5th", "fifth") → 1..31, or null if out of range/unknown. */
function dayNum(tok: string): number | null {
  const t = tok.toLowerCase().trim();
  const digits = t.match(/^(\d{1,2})(?:st|nd|rd|th)?$/);
  if (digits) {
    const n = +digits[1];
    return n >= 1 && n <= 31 ? n : null;
  }
  const n = DAY_WORDS[t.replace(/\s+/g, '-')];
  return n != null ? n : null;
}

/** Find a "Month Day" / "Day Month" mention, tolerant of ordinals, spelled days,
 * abbreviations, and trailing words ("November 5 schedule"). */
export function matchMonthDay(q: string): { mo: number; dd: number; index: number; length: number } | null {
  let m = q.match(MD_FWD);
  if (m && typeof m.index === 'number') {
    const mo = MONTHS[m[1].toLowerCase()];
    const dd = dayNum(m[2]);
    if (mo != null && dd != null) return { mo, dd, index: m.index, length: m[0].length };
  }
  m = q.match(MD_REV);
  if (m && typeof m.index === 'number') {
    const dd = dayNum(m[1]);
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo != null && dd != null) return { mo, dd, index: m.index, length: m[0].length };
  }
  return null;
}

/** A bare month/day has no year: resolve to the NEXT FUTURE occurrence — this year
 * if it's still ahead (today counts as ahead), otherwise next year. A scheduling
 * app must never place a bare month/day in the past. */
function nextFutureDate(today: Date, mo: number, dd: number): Date {
  const d = new Date(today.getFullYear(), mo, dd);
  d.setHours(0, 0, 0, 0);
  if (d < today) d.setFullYear(today.getFullYear() + 1);
  return d;
}

/* ---------------- dates with a YEAR, and "in N years" (1.12.0-voice.27) ----------------
 * Device question: "how is a date reminder for next year and two years from now?" Before this, the
 * spoken year was IGNORED ("March 5, 2028" → 2027-03-05; "3rd November 2027" → 2026-11-03) and
 * "next year", "in 2 years", "March 2028", "5/3/2027" gave no date at all. One reader for both
 * saving (lib/command.ts via parseWhen) and asking (interpret), so they always agree.
 *   - start/end: the window a QUESTION means ("March 2028" = the whole month, "next year" = all of it)
 *   - point:     the day a REMINDER gets ("March 2028" → March 1, "next year" → today's date next year)
 *   - strong:    anything but a bare month/day (which keeps its old place after weekdays)
 * Numeric dates are DAY FIRST (5/3/2027 = 5 March 2027 — the user's choice, Philippine order).
 */
export interface DateHit {
  start: Date;
  end: Date;
  point: Date;
  index: number;
  length: number;
  strong: boolean;
}

const COUNT_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, couple: 2,
};
const COUNT_PAT = '(\\d{1,2}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a\\s+couple\\s+of)';
const YEAR_PAT = '((?:19|20)\\d{2})';
const YEAR_TAIL = `(?:,?\\s+(?:of\\s+|in\\s+)?(?:${YEAR_PAT}|(next|this)\\s+year))?`;

const RX_ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const RX_NUM = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/; // day first
const RX_MD_Y = new RegExp('\\b' + MONTH_PAT + '\\.?\\s+(?:the\\s+)?' + DAY_PAT + '\\b' + YEAR_TAIL, 'i');
const RX_DM_Y = new RegExp('\\b' + DAY_PAT + '\\s+(?:of\\s+)?' + MONTH_PAT + '\\b' + YEAR_TAIL, 'i');
const RX_MONTH_Y = new RegExp(`\\b(?:in\\s+)?${MONTH_PAT}\\s+(?:of\\s+)?(?:${YEAR_PAT}|(next|this)\\s+year)\\b`, 'i');
const RX_Y_MONTH = new RegExp(`\\b(next|this)\\s+year,?\\s+(?:in\\s+)?${MONTH_PAT}\\b`, 'i');
const RX_IN_N = new RegExp(`\\bin\\s+${COUNT_PAT}\\s+(day|week|month|year)s?\\b`, 'i');
const RX_N_FROM_NOW = new RegExp(`\\b${COUNT_PAT}\\s+(day|week|month|year)s?\\s+from\\s+(?:now|today)\\b`, 'i');
const RX_REL_YEAR = /\b(next|this|last)\s+year\b/i;
const RX_BARE_YEAR = new RegExp(`\\b(?:in|for|during|by|of)\\s+${YEAR_PAT}\\b`, 'i');

function count(tok: string): number {
  const t = tok.toLowerCase().replace(/\s+of$/, '').replace(/^a\s+couple$/, 'couple');
  return /^\d+$/.test(t) ? +t : COUNT_WORDS[t] ?? NaN;
}
function plus(today: Date, n: number, unit: string): Date {
  const d = new Date(today);
  const u = unit.toLowerCase();
  if (u === 'day') d.setDate(d.getDate() + n);
  else if (u === 'week') d.setDate(d.getDate() + 7 * n);
  else if (u === 'month') d.setMonth(d.getMonth() + n);
  else d.setFullYear(d.getFullYear() + n);
  return d;
}
/** A real calendar date (rejects 31 Feb etc.). */
function realDate(y: number, mo: number, dd: number): Date | null {
  const d = new Date(y, mo, dd);
  return d.getFullYear() === y && d.getMonth() === mo && d.getDate() === dd ? d : null;
}
function yearOf(today: Date, digits: string | undefined, rel: string | undefined): number | null {
  if (digits) return +digits;
  if (rel) return today.getFullYear() + (rel.toLowerCase() === 'next' ? 1 : 0);
  return null;
}

export function matchDatePhrase(text: string, today: Date): DateHit | null {
  const at = (m: RegExpMatchArray) => ({ index: m.index ?? 0, length: m[0].length });
  const one = (d: Date, m: RegExpMatchArray, strong = true): DateHit => ({ start: d, end: d, point: d, strong, ...at(m) });
  let m: RegExpMatchArray | null;

  if ((m = text.match(RX_ISO))) {
    const d = realDate(+m[1], +m[2] - 1, +m[3]);
    if (d) return one(d, m);
  }
  if ((m = text.match(RX_NUM))) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const d = realDate(y, +m[2] - 1, +m[1]);
    if (d) return one(d, m);
  }
  // "March 5, 2028" / "5th of March next year" / "March 5" (no year → next time it comes round)
  for (const [rx, moI, ddI] of [
    [RX_MD_Y, 1, 2],
    [RX_DM_Y, 2, 1],
  ] as [RegExp, number, number][]) {
    if ((m = text.match(rx))) {
      const mo = MONTHS[m[moI].toLowerCase()];
      const dd = dayNum(m[ddI]);
      if (mo != null && dd != null) {
        const y = yearOf(today, m[3], m[4]);
        if (y == null) return one(nextFutureDate(today, mo, dd), m, false);
        const d = realDate(y, mo, dd);
        if (d) return one(d, m);
      }
    }
  }
  // "March 2028" / "in March next year" / "next year in June" → the month
  const month = (mo: number, y: number, mm: RegExpMatchArray): DateHit => {
    const a = new Date(y, mo, 1);
    return { start: a, end: new Date(y, mo + 1, 0), point: a, strong: true, ...at(mm) };
  };
  if ((m = text.match(RX_MONTH_Y))) {
    const y = yearOf(today, m[2], m[3]);
    if (y != null) return month(MONTHS[m[1].toLowerCase()], y, m);
  }
  if ((m = text.match(RX_Y_MONTH))) {
    const y = yearOf(today, undefined, m[1]);
    if (y != null) return month(MONTHS[m[2].toLowerCase()], y, m);
  }
  // "in 2 years" / "two years from now" / "in 6 months" / "in 3 weeks" / "in 10 days"
  if ((m = text.match(RX_IN_N) ?? text.match(RX_N_FROM_NOW))) {
    const n = count(m[1]);
    if (n > 0 && n <= 50) return one(plus(today, n, m[2]), m);
  }
  // "next year" (a question: all of it; a reminder: today's date next year) / "this year" / "last year"
  if ((m = text.match(RX_REL_YEAR))) {
    const rel = m[1].toLowerCase();
    const y = today.getFullYear() + (rel === 'next' ? 1 : rel === 'last' ? -1 : 0);
    const point = rel === 'next' ? plus(today, 1, 'year') : rel === 'last' ? new Date(y, 0, 1) : today;
    return { start: new Date(y, 0, 1), end: new Date(y, 11, 31), point, strong: true, ...at(m) };
  }
  // "in 2027" / "for 2028" — the whole year (a reminder: January 1)
  if ((m = text.match(RX_BARE_YEAR))) {
    const y = +m[1];
    const a = new Date(y, 0, 1);
    return { start: a, end: new Date(y, 11, 31), point: a, strong: true, ...at(m) };
  }
  return null;
}

function day5(base: Date, add: number): Date {
  const x = new Date(base);
  x.setDate(x.getDate() + add);
  return x;
}

export interface Interpretation {
  range: { start: string; end: string } | null;
  /** voice.27: the single day a REMINDER should get when the phrase names a window ("next year"). */
  point: string | null;
  label: string | null; // when label
  timeRange: { start: number; end: number } | null; // time-of-day filter, minutes from midnight
  timeLabel: string | null; // time-of-day provenance ("afternoon", "3pm")
  who: string[]; // names to match in the people field ("with Sam")
  whoIntent: boolean; // asked about people ("who am I meeting…")
  // 2.0.0 build 99: the THING asked about when it is a schedule word ("when is the meeting") —
  // not a keyword (that would break "any meetings this week"), but records that say it come first
  subjects: string[];
  where: string[]; // place terms to match in location ("at Pike Place")
  whereIntent: boolean; // asked about location ("where is…")
  // Schedule question with NO explicit date and NO past cue ("what's my schedule",
  // "upcoming events", "any appointments?") → only today-or-later dated records, plus
  // undated event-type records. Past events never answer a forward-looking question.
  upcoming: boolean;
  // Explicit look-back with no date ("past events", "previous appointments") → only
  // records dated before today.
  past: boolean;
  // Past-tense question with no date ("when did I go to the clinic?", "when was the gala?",
  // "who was at …") → look at what already HAPPENED: past events count, upcoming schedule items
  // don't, newest first (1.9.2). Non-schedule records (menus, receipts) are unaffected.
  pastTense: boolean;
  keywords: string[]; // general terms matched across all fields
  // DISPLAY-ONLY: who/where/keywords re-cased to the user's original spelling for
  // the provenance line. Same length/order as their lowercased counterparts; the
  // lowercased arrays above remain the ones used for matching.
  whoDisplay: string[];
  whereDisplay: string[];
  keywordsDisplay: string[];
}

/** Schedule words that are skipped as search words but still name WHAT is asked about. */
const SUBJECT_RE =
  /\b(?:meetings?|meetups?|appointments?|appts?|activit(?:y|ies)|tasks?|errands?|chores?|bookings?|reservations?|engagements?|commitments?|occasions?|to-?dos?)\b/g;

export function interpret(qRaw: string): Interpretation {
  // A word fixed on the mic is swapped in before any guess — "when is the meaty" is read as
  // "when is the meeting" before the question picks a day, a person, or a search word.
  // "sat today" is Saturday before that guess. "deck" is not a month.
  qRaw = mendHearing(expandWords(qRaw));
  const q = qRaw.toLowerCase();
  // DISPLAY-ONLY casing recovery: map each lowercased query token back to the
  // user's original casing so the provenance line can echo their words faithfully.
  // Matching never touches this — it keeps using the lowercased/filtered tokens.
  const origCase = new Map<string, string>();
  qRaw.split(/[^A-Za-z0-9'’]+/).forEach((w) => {
    const lw = w.toLowerCase();
    if (w && !origCase.has(lw)) origCase.set(lw, w);
  });
  const recase = (tok: string) => origCase.get(tok) ?? tok;
  // Pull the user's original-cased substring for a matched date label (so an
  // explicit "Friday" / "Jun 24" shows verbatim, not lowercased).
  const origSlice = (m: RegExpMatchArray) =>
    typeof m.index === 'number' ? qRaw.slice(m.index, m.index + m[0].length) : m[0];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let range: Interpretation['range'] = null;
  let point: string | null = null;
  let label: string | null = null;
  // The words that named the day ("6th", "sixth", "six"). They are the date, not a
  // search word — "what event on December 6th" must not also require the title to say "6th".
  let dateSpan: { index: number; length: number } | null = null;
  let timeRange: Interpretation['timeRange'] = null;
  let timeLabel: string | null = null;
  const day = (ms: number) => {
    const x = new Date(today);
    x.setDate(x.getDate() + ms);
    return x;
  };
  const span = (a: Date, b: Date, lab: string) => {
    range = { start: iso(a), end: iso(b) };
    label = lab;
  };

  if (/\btoday\b/.test(q)) span(today, today, 'today');
  else if (/\btomorrow\b/.test(q)) span(day(1), day(1), 'tomorrow');
  else if (/\byesterday\b/.test(q)) span(day(-1), day(-1), 'yesterday');
  else if (/\bthis weekend\b/.test(q)) {
    const s = startOfWeek(today);
    span(day5(s, 5), day5(s, 6), 'this weekend');
  } else if (/\bnext week\b/.test(q)) {
    const s = startOfWeek(today);
    span(day5(s, 7), day5(s, 13), 'next week');
  } else if (/\blast week\b/.test(q)) {
    const s = startOfWeek(today);
    span(day5(s, -7), day5(s, -1), 'last week');
  } else if (/\bthis week\b/.test(q)) {
    const s = startOfWeek(today);
    span(s, day5(s, 6), 'this week');
  } else if (/\bnext month\b/.test(q)) {
    const a = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const b = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    span(a, b, 'next month');
  } else if (/\bthis month\b/.test(q)) {
    const a = new Date(today.getFullYear(), today.getMonth(), 1);
    const b = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    span(a, b, 'this month');
  } else {
    const hit = matchDatePhrase(q, today); // voice.27: years, "in N years", "March 2028", 5/3/2027
    const dowM = q.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    const monM = matchMonthDay(q);
    const hitLabel = (h: DateHit) => qRaw.slice(h.index, h.index + h.length).trim();
    if (hit && hit.strong) {
      span(hit.start, hit.end, hitLabel(hit));
      point = iso(hit.point);
      dateSpan = { index: hit.index, length: hit.length };
    } else if (dowM && typeof dowM.index === 'number') {
      const target = DOW[dowM[2]];
      // plain weekday → next occurrence incl. today; "next <weekday>" → +7
      let ahead = (target - today.getDay() + 7) % 7;
      if (dowM[1]) ahead = ((target - today.getDay() + 7) % 7) + 7;
      const d = day(ahead);
      span(d, d, origSlice(dowM).trim());
      dateSpan = { index: dowM.index, length: dowM[0].length };
    } else if (monM) {
      // bare month/day (no year) → next future occurrence, never the past
      const d = nextFutureDate(today, monM.mo, monM.dd);
      span(d, d, qRaw.slice(monM.index, monM.index + monM.length).trim());
      dateSpan = { index: monM.index, length: monM.length };
    }
  }

  const stop = new Set(
    (
      "what whats what's when whats where which who whom whose how why much many is are am do does did i my me the a an of on at in with to for any all show find list tell happening happened scheduled have got going meet " +
      'event events appointment appointments appt appts meeting meetings meetup meetups thing things week weekend month day days today tomorrow yesterday next last this coming ' +
      'schedule schedules upcoming agenda plan plans calendar calendars itinerary ahead past previous was were ' +
      'go goes went gone been had ago recently previously lately last time times ' +
      'anything something everything nothing stuff ' +
      // 2.0.0 (user: "what activities I have today" found nothing — "activities" was searched as a word)
      'activity activities task tasks todo todos to-do to-dos doing errand errands chore chores commitment commitments engagement engagements booking bookings reservation reservations occasion occasions ' +
      'sunday monday tuesday wednesday thursday friday saturday ' +
      'january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec ' +
      'year years months from now ' +
      // build 99: "what notes do I have about Sam" — "notes" matched every note's type
      'note notes memo memos about regarding'
    ).split(/\s+/),
  );

  // Field intents from question words.
  const whoIntent = /\bwho\b|\bwhom\b|\bwith whom\b/.test(q);
  const whereIntent = /\bwhere\b/.test(q);

  // "with <name>" → who terms; "at/in <place>" → where terms. Capture up to two
  // words, split on "and", drop anything that's a stopword or starts with a digit
  // (so "at 2pm" / "at 9" never become a place). Captured phrases are removed
  // from the keyword pool so they don't double-match.
  const claimed = new Set<string>();
  if (dateSpan) {
    q.slice(dateSpan.index, dateSpan.index + dateSpan.length)
      .split(/[^a-z0-9]+/)
      .forEach((w) => {
        if (w) claimed.add(w);
      });
  }
  const who: string[] = [];
  const where: string[] = [];
  const grab = (re: RegExp, out: string[]) => {
    let m: RegExpExecArray | null;
    const rx = new RegExp(re.source, 'gi');
    while ((m = rx.exec(q))) {
      const phrase = m[1];
      phrase
        .split(/\s+and\s+|[,&]/)
        .map((s) => s.trim())
        .forEach((tok) => {
          tok.split(/\s+/).forEach((w) => {
            if (w.length > 1 && !stop.has(w) && !/^\d/.test(w)) {
              out.push(w);
              claimed.add(w);
            }
          });
        });
    }
  };
  // "with <name>" → who. "at <place>" → where ("at" only — "in" is too often
  // non-locative: "in the morning", "in June"). A leading-digit token is dropped
  // so "at 2pm" / "at 9" never become a place.
  grab(/\bwith\s+([a-z][a-z'’\s]{1,30}?)(?=\s+(?:on|at|in|for|this|next|today|tomorrow|$)|[.?!,]|$)/, who);
  grab(/\bat\s+([a-z][a-z0-9'’\s]{1,30}?)(?=\s+(?:on|with|for|this|next|today|tomorrow|$)|[.?!,]|$)/, where);

  // TIME-OF-DAY filter (independent of the date range — "tomorrow afternoon" applies both).
  // A specific time ("3pm", "3:30pm", "15:00") matches that hour (or the exact minute); a
  // part-of-day word matches its band. Matched time tokens are CLAIMED so they don't also
  // keyword-match. Filtering happens in runLocal against each record's `time` (minutes/day).
  const TOD: Record<string, [number, number]> = {
    morning: [300, 719], // 05:00–11:59
    afternoon: [720, 1019], // 12:00–16:59
    evening: [1020, 1259], // 17:00–20:59
    night: [1260, 1439], // 21:00–23:59
    tonight: [1080, 1439], // 18:00–23:59
    noon: [720, 720],
    midnight: [0, 0],
  };
  const tm = q.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/) || q.match(/\b(\d{1,2}):(\d{2})\b/);
  if (tm) {
    let h = +tm[1];
    const hasMin = tm[2] != null && /^\d{2}$/.test(tm[2]);
    const mm = hasMin ? +tm[2] : 0;
    const ap = tm[3]; // am/pm (first alt) or undefined for the 24h colon form
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h < 24 && mm < 60) {
      const startMin = h * 60 + mm;
      // hour-only ("3pm") matches the whole hour; "3:30pm" / "15:00" is an exact minute
      timeRange = { start: startMin, end: hasMin ? startMin : startMin + 59 };
      timeLabel = origSlice(tm).trim();
      tm[0].split(/\s+/).forEach((w) => claimed.add(w.toLowerCase()));
    }
  } else {
    for (const word of Object.keys(TOD)) {
      if (new RegExp('\\b' + word + '\\b').test(q)) {
        timeRange = { start: TOD[word][0], end: TOD[word][1] };
        timeLabel = word;
        claimed.add(word);
        break;
      }
    }
  }

  // "when is the MEETING", "what time is my appointment" — remembered as the subject (see runLocal)
  const subjects = Array.from(
    new Set(
      (q.match(SUBJECT_RE) ?? []).map((w) =>
        w.replace(/ies$/, 'y').replace(/s$/, '').replace(/activity$/, 'activit'),
      ),
    ),
  );

  const keywords = q
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => (w.length > 2 || isSynonymWord(w)) && !stop.has(w) && !claimed.has(w) && !/^\d+$/.test(w));

  // Forward-looking schedule question (see Interpretation.upcoming). An explicit date
  // range always wins (the user named the window), and any past cue opts out.
  const scheduleIntent =
    /\b(schedules?|agenda|calendars?|upcoming|coming up|plans?|itinerary|events?|appointments?|appts?|meetings?|meetups?|reservations?)\b|\bwhat(?:'|’)?s on\b(?!\s+(?:the|my|a|an|our|top)\b)|\bwhat is on\b(?!\s+(?:the|my|a|an|our|top)\b)/.test(q);
  const pastCue =
    /\b(past|previous|earlier|ago|history|happened|was|were|did|done|attended|missed|last)\b/.test(q);
  // 2.0.0: "what are my activities / tasks / errands" with nothing else to look for = a schedule
  // question ("kids activities" keeps its word "kids" and stays a plain search)
  const scheduleWords = scheduleIntent || (keywords.length === 0 && /\b(activit(?:y|ies)|tasks?|errands?|commitments?|engagements?|doing)\b/.test(q));
  if (!range && scheduleWords && !pastCue) {
    label = 'upcoming';
  } else if (!range && scheduleWords && /\b(past|previous|earlier|history)\b/.test(q)) {
    label = 'past';
  }
  const upcoming = label === 'upcoming';
  const past = label === 'past';
  const pastTense =
    !range && !upcoming && !past &&
    /\b(did|didn'?t|was|wasn'?t|were|weren'?t|went|gone|been|had|happened|ago|last time|previously|recently|lately)\b/.test(q);

  return {
    range, point, label, timeRange, timeLabel, who, whoIntent, subjects, where, whereIntent, upcoming, past, pastTense, keywords,
    whoDisplay: who.map(recase),
    whereDisplay: where.map(recase),
    keywordsDisplay: keywords.map(recase),
  };
}

/** Minutes-from-midnight for a record's "HH:MM" time, or null when timeless. */
function timeMinutes(time: string | null): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  return m ? +m[1] * 60 + +m[2] : null;
}

/** Stable sort key: undated/untimed sink to the bottom (matches prototype). */
export function sortByWhen(a: Rec, b: Rec): number {
  const av = (a.date || '9999') + (a.time || '99:99');
  const bv = (b.date || '9999') + (b.time || '99:99');
  return av < bv ? -1 : av > bv ? 1 : 0;
}

export interface QueryResult {
  results: Rec[];
  label: string | null;
  interpText: string; // matched-field provenance, e.g. "who: Sam · when: Friday"
  keywords: string[];
  answer: string | null; // a direct one-line answer when the question has a clear intent
  // For the spoken reply (lib/voice.ts) — built from fields, not from the display text:
  range: { start: string; end: string } | null; // the date window asked about, if any
  intent: AnswerIntent | null; // what the direct answer is about
  best: Rec | null; // the record the direct answer reads from
  keywordsDisplay: string[]; // the user's own words (for "nothing about …")
  lookingBack: boolean; // the question is about the past (spoken in the past tense)
  spoken?: string; // a grounded Gemma sentence, when one replaced the rules' line
  closest?: string | null; // a leftover word that was left out so a near record could answer
  asked?: string; // the question, so a miss can be pointed at the right record
  // Categories (variant experiment):
  category?: string | null; // the category this result was scoped to, if any
  categoryMiss?: string | null; // the category had nothing, but the general search does
  categoryAction?: { kind: 'categorize'; name: string } | null; // "categorize this as X" — the app layer applies it to the record on screen
}

// 'say' (build 99): the answer IS the record's own words — a note that doesn't have the asked field
// filled in ("there are two chicken on the fridge", "Sam owes me 20 dollars") is read back as it is
export type AnswerIntent = 'price' | 'when' | 'where' | 'who' | 'say';

export interface QueryEngine {
  run(saved: Rec[], q: string): QueryResult;
}

/**
 * Normalized content key over the given fields — lifted out of `dedupe` so the
 * save-time near-match matcher (`lib/match.ts`) shares the EXACT normalization and
 * can't drift from the query-time dedup. Each field is null-coalesced, trimmed,
 * lowercased, and pipe-joined.
 */
export function contentKey(rec: Rec, fields: (keyof Rec)[]): string {
  return fields
    .map((f) => (rec[f] ?? '').toString().trim().toLowerCase())
    .join('|');
}

/** Record types that belong in an undated "what's my schedule" answer. */
const SCHEDULE_TYPES = new Set(['event', 'appointment', 'meeting', 'reminder']);

/** A timed event stays "current" this long after it starts (a dinner that began 20 minutes
 * ago still answers "what's on tonight"). */
export const PAST_GRACE_MIN = 60;

/**
 * Has this scheduled item already happened? (1.9.1) Only schedule types count — a receipt,
 * invoice or menu with a date is a record of something, not an appointment, so it never
 * "expires". Timed: past once start + PAST_GRACE_MIN is behind `now`. Untimed: past once its
 * day is over. Undated: never past.
 */
export function isPastEvent(r: Rec, now: Date = new Date()): boolean {
  if (!r.date || !SCHEDULE_TYPES.has((r.type || '').toLowerCase())) return false;
  const today = iso(now);
  if (r.date < today) return true;
  if (r.date > today) return false;
  const min = timeMinutes(r.time);
  if (min == null) return false;
  return min + PAST_GRACE_MIN <= now.getHours() * 60 + now.getMinutes();
}

export const DEDUPE_FIELDS: (keyof Rec)[] = ['type', 'title', 'date', 'time', 'location', 'people', 'notes'];

/** Capture time embedded in an id from `datetime.id()` (prefix + Date.now()); 0 if absent. */
function idTime(recId: string): number {
  const m = recId.match(/\d{13}/);
  return m ? Number(m[0]) : 0;
}

/**
 * Ids of EXACT-content duplicates in the saved set (same key as the query-time `dedupe`
 * below, so the two can't drift). The NEWEST record of each identical group is kept —
 * newest by the capture time in its id, falling back to list order (saved is
 * newest-first) when an id carries no timestamp (e.g. a record Muse wrote on Harbor).
 * Records that differ in any user-visible field are never returned.
 */
export function duplicateIds(recs: Rec[]): string[] {
  const ordered = recs
    .map((r, i) => ({ r, i, t: idTime(r.id) }))
    .sort((a, b) => b.t - a.t || a.i - b.i);
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const { r } of ordered) {
    const key = contentKey(r, DEDUPE_FIELDS);
    if (seen.has(key)) dups.push(r.id);
    else seen.add(key);
  }
  return dups;
}

/**
 * Collapse functionally-identical records so repeated parses of the same source
 * don't stack as duplicate findings. The dedup key is the CONTENT (type + the
 * five user-visible fields); id/imageId/thumb/via are ignored. Keeps the first
 * occurrence in the already-sorted list.
 */
function dedupe(recs: Rec[]): Rec[] {
  const seen = new Set<string>();
  const out: Rec[] = [];
  for (const r of recs) {
    const key = contentKey(r, DEDUPE_FIELDS);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Best match for a direct answer: the record whose TITLE contains the most query
 * keywords (a title hit beats an incidental notes hit). Results are pre-sorted by
 * score, then date, so the first record at the top score is the earliest.
 */
function pickBest(results: Rec[], keywords: string[], field: 'location' | 'people' | null = null): Rec | null {
  if (!results.length) return null;
  if (!keywords.length) return results[0];
  let best = results[0];
  let bestScore = -1;
  for (const r of results) {
    const title = (r.title || '').toLowerCase();
    // a record with the asked field filled ("where" → a place) wins a tie (build 99)
    const score = keywords.reduce((n, k) => n + (wordIn(title, k) ? 1 : 0), 0) + (field && r[field] ? 0.5 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

/** Pull a money amount out of a record (notes first, then title) for "how much". */
function findAmount(r: Rec): string | null {
  const hay = (r.notes || '') + ' ' + (r.title || '');
  const m = hay.match(
    /[$€£]\s?\d[\d,]*(?:\.\d{1,2})?|\d[\d,]*(?:\.\d{1,2})?\s?(?:usd|eur|gbp|dollars?|euros?)/i,
  );
  return m ? m[0].replace(/\s+/g, '') : null;
}

function moneyOf(raw: string): { n: number; unit: string } | null {
  const m = raw.match(/([$€£])?\s?(\d[\d,]*(?:\.\d{1,2})?)\s?(usd|eur|gbp|dollars?|euros?)?/i);
  if (!m) return null;
  const n = Number(m[2].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const mark = (m[1] || '') + (m[3] || '');
  const unit = /€|eur/i.test(mark) ? 'euros' : /£|gbp/i.test(mark) ? 'pounds' : 'dollars';
  return { n, unit };
}

/** The total of amounts already written in the matched records. Null unless two or more share a currency. */
export function sumAmounts(recs: Rec[]): string | null {
  const parsed = recs.map(findAmount).map((s) => (s ? moneyOf(s) : null)).filter((x): x is { n: number; unit: string } => !!x);
  if (parsed.length < 2) return null;
  const unit = parsed[0].unit;
  if (parsed.some((p) => p.unit !== unit)) return null;
  const n = parsed.reduce((a, p) => a + p.n, 0);
  const num = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return `${num} ${unit}`;
}

/** Human-readable when for the answer line (mirrors InfoWindow's whenLine). */
function readableWhen(r: Rec): string {
  if (!r.date) return r.time ? spokenTime(r.time) : '';
  const d = parseISO(r.date);
  const base = WD[d.getDay()].slice(0, 3) + ', ' + MON[d.getMonth()] + ' ' + d.getDate();
  return r.time ? base + ' · ' + spokenTime(r.time) : base;
}

/**
 * A one-line direct answer when the question carries a clear intent (how-much /
 * when / where / who) and a best match exists. Null → no headline, cards only.
 * Reads STRAIGHT from the matched record's stored fields — no invention.
 */
function buildAnswer(
  results: Rec[],
  qRaw: string,
  keywords: string[],
  whoIntent: boolean,
  whereIntent: boolean,
): { answer: string | null; intent: AnswerIntent | null; best: Rec | null } {
  const none = { answer: null, intent: null, best: null };
  if (!results.length) return none;
  const q = qRaw.toLowerCase();
  const priceIntent = /\bhow much\b|\bhow many\b|\bprice\b|\bcosts?\b|\bfee\b|\$/.test(q);
  const whenIntent = /\bwhen\b|\bwhat\s+time\b/.test(q);
  const best = pickBest(results, keywords, whereIntent ? 'location' : whoIntent ? 'people' : null);
  if (!best) return none;
  // A pasted question stores the answer in notes. Say that, not the question again.
  if (best.via === 'Pasted text' && best.notes?.trim()) {
    return { answer: best.notes.trim(), intent: 'say', best };
  }
  const t = best.title;
  // a note (anything that isn't a schedule item) says things in its own words
  const noteLike = !SCHEDULE_TYPES.has((best.type || '').toLowerCase());
  const say = { answer: t, intent: 'say' as const, best };
  if (priceIntent) {
    const total = sumAmounts(results);
    if (total) return { answer: `The total is ${total}`, intent: 'price', best };
    const amt = findAmount(best);
    const inTitle = !!amt && (best.title || '').replace(/\s+/g, '').toLowerCase().includes(amt.toLowerCase());
    if (inTitle || (!amt && noteLike)) return say; // "Sam owes me 20 dollars", "how many chicken"
    return { answer: t + ' — ' + (amt || best.notes || 'no price listed'), intent: 'price', best };
  }
  if (whenIntent) {
    // an old note may say its day in words; a note that SAYS its time ("the gym opens at 6 am") is read as it is
    if (noteLike && ((!best.date && !best.time) || /\d|\b(?:today|tonight|tomorrow|noon|midnight|morning|afternoon|evening)\b/i.test(t))) return say;
    return { answer: t + ' — ' + (readableWhen(best) || 'no date listed'), intent: 'when', best };
  }
  if (whereIntent) {
    if (!best.location && (noteLike || saysPlace(t))) return say;
    return { answer: t + ' — ' + (best.location || 'no location listed'), intent: 'where', best };
  }
  if (whoIntent) {
    if (!best.people && noteLike) return say;
    return { answer: t + ' — ' + (best.people || 'no people listed'), intent: 'who', best };
  }
  return none;
}

/** Does a title say where something is in its own words ("two chicken ON THE FRIDGE")? (build 99) */
export function saysPlace(title: string | null | undefined): boolean {
  return /\b(?:on|in|at|inside|under|underneath|behind|beside|near|next\s+to|by|above|below|between|outside|into)\s+(?:the|a|an|my|our|your|his|her|their|this|that)?\s*[a-z0-9]/i.test(title || '');
}

/** The amount a price answer reads (exported for the spoken reply). */
export { findAmount };

/**
 * Field-aware local filter. A record must satisfy EVERY active constraint:
 * when (date range), who (people), where (location), and a general keyword
 * search across all fields. Image-derived records query identically to typed
 * ones — same fields, no separate path.
 */
// build 120: "number", "name", "time" alone say nothing — "what is my cabin number" must not open the locker note
const WEAK = new Set(['number', 'numbers', 'name', 'names', 'time', 'thing', 'things', 'place', 'day', 'one', 'item', 'stuff']);

/**
 * build 121: two passes. Exact words first (as in build 119, fast). Only if that finds nothing — or
 * has to leave a word out to find something — are typos, endings and number words allowed.
 */
/** "Ship safety" for a spoken confirmation ("Ship safety category selected."). */
const capName = (name: string): string => (name ? name[0].toUpperCase() + name.slice(1) : name);

/** The empty result a category command answers with (select / clear / list / categorize). */
function categoryCommandResult(saved: Rec[], cmd: CategoryCommand): QueryResult {
  const base: QueryResult = {
    results: [],
    label: null,
    interpText: 'category',
    keywords: [],
    answer: null,
    range: null,
    intent: null,
    best: null,
    keywordsDisplay: [],
    lookingBack: false,
  };
  if (cmd.kind === 'clear') {
    clearActiveCategory();
    return { ...base, answer: 'Category cleared — searching everything now.', interpText: 'category cleared' };
  }
  if (cmd.kind === 'list') {
    const known = allCategories(saved);
    return {
      ...base,
      answer: known.length
        ? `Your categories: ${known.join(', ')}.`
        : 'No categories yet — add #ship safety to a note to start one.',
      interpText: 'list: categories',
    };
  }
  if (cmd.kind === 'select') {
    const known = allCategories(saved);
    // A misheard name still finds the category it meant; a new name creates it.
    // A trailing word never invents a phantom ("ship safety tomorrow" is
    // "ship safety" when that category exists).
    const name = resolveTag(cmd.name, known);
    setActiveCategory(name);
    const count = saved.filter((e) => recordTags(e).includes(name)).length;
    return {
      ...base,
      category: name,
      answer: count
        ? `${capName(name)} category selected.`
        : `${capName(name)} category selected — nothing saved in it yet.`,
      interpText: `category: ${name}`,
    };
  }
  // "categorize this as X" — the app layer applies it to the record on screen.
  // Resolve the name first, so a trailing word lands in the category that
  // exists instead of inventing a new one.
  const name = resolveTag(cmd.name, allCategories(saved));
  return {
    ...base,
    categoryAction: { kind: 'categorize', name },
    answer: `Added to ${name}.`,
    interpText: `category: ${name}`,
  };
}

/**
 * A scoped question that found nothing: if the general search WOULD have
 * found something, say so and offer the way out — never silently fall back,
 * or the category stops meaning anything. The general run is one extra pass,
 * only on an empty category result.
 */
function categoryMissResult(final: QueryResult, saved: Rec[], qRaw: string, ignorePastTense: boolean, activeCat: string | null): QueryResult {
  if (!activeCat) return final;
  clearActiveCategory();
  let general: QueryResult;
  try {
    general = runLocal(saved, qRaw, ignorePastTense);
  } finally {
    setActiveCategory(activeCat);
  }
  if (!general.results.length) return final;
  return {
    ...final,
    categoryMiss: activeCat,
    answer: `Nothing in ${activeCat}. Say "clear category" to search everything.`,
  };
}

function runLocal(saved: Rec[], qRaw: string, ignorePastTense = false): QueryResult {
  // Categories (variant experiment): commands first, then a tag in the question
  // scopes it — before the search passes, so a bare "#ship safety" never
  // becomes keywords and a select never becomes a save.
  if (categoriesEnabled()) {
    const cmd = parseCategoryCommand(qRaw);
    if (cmd) {
      // A command is still a question asked — it refreshes the 5-minute
      // clock on the selected category (list/categorize don't set one).
      touchActiveCategory();
      return categoryCommandResult(saved, cmd);
    }
    const tags = extractTags(qRaw);
    if (tags.length) {
      const known = allCategories(saved);
      setActiveCategory(resolveTag(tags[0], known));
      // The tag's own words must not become search keywords — a record that
      // matches only via its "#ship safety" tag would otherwise answer a
      // question about something else entirely.
      qRaw = stripTags(qRaw);
    }
  }
  // The active category expires after a few minutes with no questions; a
  // question that arrives in time refreshes it.
  const activeCat = categoriesEnabled() ? getActiveCategory() : null;
  if (activeCat) touchActiveCategory();
  setLooseMatching(false);
  let a: QueryResult;
  try {
    a = runLocalPass(saved, qRaw, ignorePastTense, activeCat);
  } finally {
    setLooseMatching(true);
  }
  // An exact hit stands. Typos and endings run only when that hit is empty.
  if (a.results.length && !a.closest) return a;
  if (!a.results.length) {
    const b = runLocalPass(saved, qRaw, ignorePastTense, activeCat);
    if (b.results.length) return b;
    return categoryMissResult(a, saved, qRaw, ignorePastTense, activeCat);
  }
  // The exact pass already named a record by leaving one word out. A fuzzy word may repair that same
  // record. It must not jump to a different one.
  const dropped = (a.closest || '').toLowerCase();
  const repaired = a.results.filter((r) => wordIn(`${r.title || ''} ${r.notes || ''} ${r.location || ''} ${r.people || ''} ${r.type || ''}`, dropped));
  if (!repaired.length) return a;
  const answer = a.answer?.replace(/^Leaving out “[^”]*”\. /, '') ?? a.answer;
  const interpText = a.interpText.replace(/ · leaving out: .*$/, '');
  return { ...a, results: repaired, closest: null, answer, interpText };
}

function runLocalPass(saved: Rec[], qRaw: string, ignorePastTense = false, activeCategory: string | null = null): QueryResult {
  qRaw = expandWords(qRaw).replace(/\bget[\s-]?together\b/gi, 'party').replace(/\bpay\s+day\b/gi, 'payday').replace(/\bwi[\s-]fi\b/gi, 'wifi');
  // 2.0.0: "list all reminders / notes / schedules / records" → every record of that TYPE, to look at
  const list = parseListAll(qRaw);
  if (list && list.where === 'records') return listRecords(saved, list.type, list.label, activeCategory);
  const interp = interpret(qRaw);
  const {
    range, label, timeRange, timeLabel, who, whoIntent, where, whereIntent, upcoming, past, keywords,
    whoDisplay, whereDisplay, keywordsDisplay,
  } = interp;
  // "how much WAS the shore tour?" can be about a booking that's still ahead — if looking back
  // finds nothing, the caller retries without the past-tense restriction (see end of runLocal).
  const pastTense = interp.pastTense && !ignorePastTense;
  // "what is my id" keeps no search word ("id" is too short). That is not a request for every
  // saved record. A schedule, a day, a person, or a place still lists what it asked for.
  if (
    !keywords.length &&
    !interp.subjects.length &&
    !who.length &&
    !where.length &&
    !range &&
    !upcoming &&
    !past &&
    !pastTense &&
    !activeCategory // a selected category is itself an anchor — "show me" lists it
  ) {
    return {
      results: [],
      label: null,
      interpText: 'no exact match',
      keywords: [],
      answer: null,
      range: null,
      intent: null,
      best: null,
      keywordsDisplay: [],
      lookingBack: false,
      category: activeCategory,
    };
  }
  const now = new Date();
  const todayIso = iso(now);
  const today0 = new Date(now);
  today0.setHours(0, 0, 0, 0);
  // Per-question search view: a record's normalized text is built ONCE per pass
  // and reused by every select() trial — the keyword-drop fallback runs one full
  // scan per keyword, and relevance() re-scored the same text again. Same
  // matches, less work. Keyed by record object: the pass only reads `saved`.
  // hay / titleNotes are LAZY: a question with no keywords must not pay to
  // build the big search blob (measured: eager cost more than it saved).
  interface RecView {
    ttl: string;
    loc: string;
    people: string;
    hay: string | null;
    toks: string[] | null;
    titleNotes: string | null;
    tnToks: string[] | null;
    saidDayFor: string | null;
    saidDay: boolean;
    cats: string[] | null; // the record's #tags — parsed once per pass
  }
  const views = new Map<Rec, RecView>();
  const viewOf = (e: Rec): RecView => {
    let v = views.get(e);
    if (!v) {
      v = {
        ttl: (e.title || '').toLowerCase(),
        loc: (e.location || '').toLowerCase(),
        people: (e.people || '').toLowerCase(),
        hay: null,
        toks: null,
        titleNotes: null,
        tnToks: null,
        saidDayFor: null,
        saidDay: false,
        cats: null,
      };
      views.set(e, v);
    }
    return v;
  };
  // A record's categories — its #tags — parsed once per pass, not once per trial.
  const tagsOf = (e: Rec): string[] => {
    const v = viewOf(e);
    if (v.cats == null) v.cats = recordTags(e);
    return v.cats;
  };
  const hayOf = (e: Rec): string => {
    const v = viewOf(e);
    if (v.hay == null) {
      v.hay = ((e.title || '') + ' ' + (e.location || '') + ' ' + (e.people || '') + ' ' + (e.notes || '') + ' ' + (e.type || '')).toLowerCase();
    }
    return v.hay;
  };
  // The loose rules (typos, endings) scan word by word — the token split is done
  // ONCE per record per pass, not once per keyword per record.
  const tokensOf = (e: Rec): string[] => {
    const v = viewOf(e);
    if (v.toks == null) v.toks = hayOf(e).split(/[^a-z0-9]+/);
    return v.toks;
  };
  const titleNotesOf = (e: Rec): string => {
    const v = viewOf(e);
    if (v.titleNotes == null) v.titleNotes = ((e.title || '') + ' ' + (e.notes || '')).toLowerCase();
    return v.titleNotes;
  };
  const titleNotesTokensOf = (e: Rec): string[] => {
    const v = viewOf(e);
    if (v.tnToks == null) v.tnToks = titleNotesOf(e).split(/[^a-z0-9]+/);
    return v.tnToks;
  };
  // A keyword's forms, stems and short-form regex are derived ONCE per pass and
  // shared by every record it is tested against — the select trials, the
  // keyword-drop fallback and the scoring all test the same few words.
  const prepCache = new Map<string, PreparedWord>();
  const prep = (k: string): PreparedWord => {
    let p = prepCache.get(k);
    if (!p) {
      p = prepareWord(k);
      prepCache.set(k, p);
    }
    return p;
  };
  // A day kept only in the words ("George birthday on December the 6th" saved with no date field)
  // still answers "what do I have on December 6". A real date field always wins. "deck 4" is not a day.
  // The date-phrase read is cached per record per day — it runs once, not once per select() trial.
  const saysThisDay = (e: Rec, day: string): boolean => {
    const v = viewOf(e);
    if (v.saidDayFor === day) return v.saidDay;
    const said = `${e.title || ''} ${e.notes || ''}`;
    const hit = matchDatePhrase(said, today0);
    let ok = !!(hit && iso(hit.start) === day && iso(hit.end) === day);
    if (!ok) {
      const md = matchMonthDay(said.toLowerCase());
      ok = !!md && iso(nextFutureDate(today0, md.mo, md.dd)) === day;
    }
    v.saidDayFor = day;
    v.saidDay = ok;
    return ok;
  };
  // Past events stay OUT of answers unless the question is about the past: "past events",
  // or a window that's entirely behind us ("yesterday", "last week", an earlier date).
  const askingPast = past || pastTense || (!!range && range.end < todayIso);

  const select = (keys: string[]) => {
    const filtered = saved
    .filter((e) => {
      // Categories: when one is selected, only its records are searched — this
      // gate runs before the date/who/where/keyword gates, and the tiered
      // scoring then ranks what is left.
      if (activeCategory && !tagsOf(e).includes(activeCategory)) return false;
      if (range) {
        const inField = !!(e.date && e.date >= range.start && e.date <= range.end);
        const saidIt = !e.date && range.start === range.end && saysThisDay(e, range.start);
        // A pasted question often names a year ("in 1920"). That is part of the question,
        // not a day to filter the folder by. Keep the fact when its own words include that year.
        const year = range.start.slice(0, 4);
        const wholeYear = range.start === `${year}-01-01` && range.end === `${year}-12-31`;
        const factYear =
          wholeYear &&
          !e.date &&
          e.via === 'Pasted text' &&
          `${e.title || ''} ${e.notes || ''}`.includes(year);
        if (!inField && !saidIt && !factYear) return false;
      }

      // 1.9.1: an event that has already happened is never part of a normal answer.
      if (!askingPast && isPastEvent(e, now)) return false;

      // "What's my schedule?" — drop past-dated records; keep undated ones only when
      // they are events (a menu item or note isn't part of a schedule).
      if (upcoming) {
        if (e.date) {
          if (e.date < todayIso) return false;
        } else if (!SCHEDULE_TYPES.has((e.type || '').toLowerCase())) {
          return false;
        }
      }
      if (past && !isPastEvent(e, now)) return false; // "past events" = schedule items that happened
      // "when did I go …" — an appointment that hasn't happened yet isn't an answer
      if (pastTense && e.date && SCHEDULE_TYPES.has((e.type || '').toLowerCase()) && !isPastEvent(e, now)) return false;

      // Time-of-day: a timeless record can't satisfy a "3pm"/"afternoon" filter.
      if (timeRange) {
        const min = timeMinutes(e.time);
        if (min == null || min < timeRange.start || min > timeRange.end) return false;
      }

      const v = viewOf(e);
      const people = v.people;
      // the record names the question's subject ("where is the MEETING") — counts like a named thing
      const namesSubject =
        interp.subjects.length > 0 &&
        interp.subjects.some((sj) => wordInP(titleNotesOf(e), titleNotesTokensOf(e), prep(sj)));
      const named = keys.length > 0 || namesSubject;
      if (who.length && !who.some((w) => people.includes(w))) return false;
      // build 99: "who …" with a thing named ("who is coming to the party") — a record that names it
      // counts even with nobody in its people field (a note keeps every word in its title)
      if (whoIntent && !who.length && !people.trim() && !named) return false;

      const loc = v.loc;
      // "at the gala dinner" often names the EVENT, not a place — so place words may match the title too
      const ttl = v.ttl;
      if (where.length && !where.some((w) => loc.includes(w) || ttl.includes(w))) return false;
      // build 99 (user: "take a note, there are two chicken on the fridge" — "where is the chicken"
      // found nothing): a note says its place in its own words, so with a thing named, a record that
      // names it counts even with no place field; the answer reads the note itself
      if (whereIntent && !where.length && !loc.trim() && !named) return false;

      if (keys.length) {
        const hay = hayOf(e);
        const toks = tokensOf(e);
        // build 99: "chickens" finds "chicken" (and "chicken" finds "chickens" — a substring already)
        if (!keys.some((k) => wordInP(hay, toks, prep(k)))) return false;
        // when the question names something real, a record that matches only "number" / "name" / "time" is not it
        const strong = keys.filter((k) => !WEAK.has(k));
        if (strong.length && !strong.some((k) => wordInP(hay, toks, prep(k)))) return false;
      }
      return true;
    });
    const scored = filtered
      .sort(sortByWhen)
      .map((e, i) => ({ e, i, s: scoreHit(e, keys) }))
      // Best match first, date breaks ties — newest first when looking back, so the
      // past order narrow() used to reverse is carried by the tiebreak now.
      .sort((a, b) => b.s - a.s || (past || pastTense ? -1 : 1) * (a.i - b.i));
    if (!keys.length) return scored.map((x) => x.e);
    // Floor: a record must match at least one word exactly (one loose guess in the
    // loose pass), and stay within two points of the best match — so a lone
    // incidental word drops off once a real match exists, but the only real match
    // is never dropped for being weak. Then the top 8: what the screen shows and
    // what Gemma grounds on. List questions (no keywords) keep date order, no
    // floor, no cap.
    const floor = Math.max(looseMatching() ? 1 : 2, (scored[0]?.s ?? 0) - 2);
    return scored.filter((x) => x.s >= floor).slice(0, SCORE_CAP).map((x) => x.e);
  };

  // Tiered score: how strongly a record matches the question's words. A word in
  // the title counts most (3), an exact word anywhere else counts 2, a typo or
  // word-ending guess counts 1 — per word, best tier wins. Ranked always (date
  // only breaks ties): before, a dated question came back in date order, so a
  // weak hit on the right day beat the right record. List questions have no
  // keywords, so every record scores 0 and date order is the answer, as before.
  // Scored from the per-question view — the search text is not rebuilt here.
  const SCORE_CAP = 8;
  function scoreHit(e: Rec, keys: string[]): number {
    if (!keys.length) return 0;
    const v = viewOf(e);
    const hay = hayOf(e);
    const toks = tokensOf(e);
    let n = 0;
    for (const k of keys) {
      const p = prep(k);
      if (wordInExactP(v.ttl, p)) n += 3;
      else if (wordInExactP(hay, p)) n += 2;
      else if (wordInLooseP(toks, p)) n += 1;
    }
    return n;
  }

  // "when is the meeting" names one thing. "any meetings this week" and "what's my schedule" do not.
  const asksOneThing = /\b(?:when|where|who)\b|\bwhat\s+time\b/.test(qRaw.toLowerCase());
  const narrow = (list: Rec[], keys: string[]): { results: Rec[]; subjectHit: boolean; subjectMiss: boolean } => {
    let results = dedupe(list);
    let subjectHit = false;
    let subjectMiss = false;
    if (!keys.length && interp.subjects.length) {
      const says = results.filter((e) => {
        const hay = `${e.title || ''} ${e.notes || ''} ${e.location || ''} ${e.type || ''}`.toLowerCase();
        const toks = hay.split(/[^a-z0-9]+/);
        return interp.subjects.some((s) => wordInP(hay, toks, prep(s)));
      });
      if (says.length) {
        results = says;
        subjectHit = true;
      } else if (asksOneThing) {
        // No meeting is not the next work item. A list question still keeps the schedule.
        results = [];
        subjectMiss = true;
      }
    }
    // Past order is carried by the score sort's tiebreak (newest first), not a
    // reverse here — reversing would flip the best match to the bottom.
    return { results, subjectHit, subjectMiss };
  };

  let { results, subjectHit, subjectMiss } = narrow(select(keywords), keywords);
  if (pastTense && !results.length) return runLocal(saved, qRaw, true);
  // A question you pointed at a record for opens that record, before a looser guess.
  if (!results.length) {
    const title = hintedTitle(qRaw);
    if (title) {
      const want = title.toLowerCase().trim();
      // A pointed-at record outside the selected category stays outside it.
      const hit = saved.filter(
        (e) =>
          (!activeCategory || recordTags(e).includes(activeCategory)) &&
          ((e.title || '').toLowerCase().trim() === want || (want.length > 2 && (e.title || '').toLowerCase().trim().includes(want))),
      );
      if (hit.length) {
        results = dedupe(hit.sort(sortByWhen));
        subjectMiss = false;
      }
    }
  }
  // One leftover wrong word ("the meeting on the duck") must not wipe a real match.
  // Drop the word that leaves the smallest set. Never drop the last word if nothing else anchors it.
  let closest: string | null = null;
  const anchored = interp.subjects.length > 0 || who.length > 0 || where.length > 0 || !!range;
  if (!results.length && keywords.length && (anchored || keywords.length > 1)) {
    let best: Rec[] | null = null;
    let dropped = '';
    for (let i = 0; i < keywords.length; i++) {
      const keys = keywords.filter((_, j) => j !== i);
      if (!keys.length && !anchored) continue;
      if (keys.length && !anchored && keys.every((k) => WEAK.has(k))) continue;
      const trial = narrow(select(keys), keys).results;
      if (!trial.length) continue;
      if (!best || trial.length < best.length) {
        best = trial;
        dropped = keywordsDisplay[i] || keywords[i];
      }
    }
    if (best) {
      results = best;
      closest = dropped;
      subjectMiss = false;
      subjectHit = !keywords.filter((k) => k !== dropped.toLowerCase()).length && interp.subjects.length > 0;
    }
  }

  // Provenance: which fields the query routed to (who · where · when · what).
  const bits: string[] = [];
  if (activeCategory) bits.push('category: ' + activeCategory);
  if (who.length) bits.push('who: ' + whoDisplay.join(', '));
  else if (whoIntent) bits.push('who');
  if (where.length) bits.push('where: ' + whereDisplay.join(', '));
  else if (whereIntent) bits.push('where');
  const shownKeys = closest ? keywordsDisplay.filter((k) => k.toLowerCase() !== closest.toLowerCase()) : keywordsDisplay;
  // A named thing that isn't saved is said by name. "Nothing coming up" would hide the work item that was not the answer.
  const missedSubject = !results.length && subjectMiss;
  if (label && !missedSubject) bits.push('when: ' + label);
  if (timeLabel) bits.push('time: ' + timeLabel);
  const answerKeys = missedSubject ? interp.subjects : shownKeys;
  if (answerKeys.length) bits.push('what: ' + answerKeys.join(', '));
  else if (subjectHit) bits.push('what: ' + interp.subjects.join(', '));
  if (closest) bits.push('leaving out: ' + closest);
  const interpText = bits.length ? bits.join(' · ') : 'everything';
  let { answer, intent, best } = buildAnswer(results, qRaw, answerKeys.map((k) => k.toLowerCase()), whoIntent, whereIntent);
  if (closest && answer) answer = `Leaving out “${closest}”. ` + answer;
  const lookingBack = past || pastTense || (!!range && range.end < todayIso);
  return {
    results,
    label: missedSubject ? null : label,
    interpText,
    keywords: answerKeys.map((k) => k.toLowerCase()),
    answer,
    range: missedSubject ? null : range,
    intent,
    best,
    keywordsDisplay: answerKeys,
    lookingBack,
    closest,
    category: activeCategory,
  };
}

const LIST_TYPES: Record<Exclude<RecordListType, 'all'>, Set<string>> = {
  event: new Set(['event', 'appointment', 'meeting']),
  reminder: new Set(['reminder']),
  note: new Set(['note']),
};

/** Every record of one type (or all), in date order — what "list all reminders" shows. */
function listRecords(saved: Rec[], type: RecordListType, label: string, category: string | null = null): QueryResult {
  const inCategory = (e: Rec): boolean => !category || recordTags(e).includes(category);
  const results = dedupe(
    saved.filter((e) => (type === 'all' || LIST_TYPES[type].has((e.type || '').toLowerCase())) && inCategory(e)).sort(sortByWhen),
  );
  return {
    results,
    label: `all ${label}`,
    interpText: `list: all ${label}` + (category ? ` · category: ${category}` : ''),
    keywords: [],
    answer: results.length
      ? `${results.length} ${results.length === 1 ? label.replace(/s$/, '') : label}`
      : category
        ? `No ${label} in ${category} yet`
        : `No ${label} saved yet`,
    range: null,
    intent: null,
    best: null,
    keywordsDisplay: [],
    lookingBack: false,
    category,
  };
}

/** The on-device engine used everywhere today. */
export const localEngine: QueryEngine = { run: runLocal };

/**
 * Parse a natural "When" string ("Tuesday 2pm", "Jun 24", "tomorrow 09:00") into
 * a stored date + time, reusing the same date interpreter the query uses. Used by
 * the Text tab's local authoring — fully offline, no Gemini.
 */
export function parseWhen(text: string): { date: string | null; time: string | null } {
  const { range, point } = interpret(text);
  // voice.27: a window ("next year", "March 2028") gives a reminder its single day (point)
  const date = point ?? (range ? range.start : null);
  const t = text.toLowerCase();
  const pad = (n: number) => String(n).padStart(2, '0');
  let time: string | null = null;
  let m = t.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/);
  if (m) {
    let h = +m[1];
    const mm = +m[2];
    if (m[3] === 'pm' && h < 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
    if (h < 24 && mm < 60) time = pad(h) + ':' + pad(mm);
  } else if ((m = t.match(/\b(\d{1,2})\s*(am|pm)\b/))) {
    let h = +m[1];
    if (m[2] === 'pm' && h < 12) h += 12;
    if (m[2] === 'am' && h === 12) h = 0;
    if (h < 24) time = pad(h) + ':00';
  }
  return { date, time };
}
