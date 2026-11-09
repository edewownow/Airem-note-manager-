/**
 * Voice commands (1.9.0, hardened 1.9.3) — a spoken TRIGGER phrase picks what kind of record to
 * make, and the rest of the sentence is read into fields ON THE PHONE (offline, instant, live):
 *
 *   "set schedule dentist tomorrow at 3pm at Main clinic with Dr Cruz"
 *     → event · What "Dentist" · When "tomorrow 3 pm" · Where "Main clinic" · Who "Dr Cruz"
 *   "remind me to renew SID on Friday"       → reminder · "Renew SID" · Friday
 *   "note the wine list is on page 2"        → note · "The wine list is on page 2"
 *
 * Anything without a trigger returns null and the voice note goes the old way (Gemini when
 * online, local otherwise). Fields feed the SAME `addTypedRecord` path as the Text tab, so the
 * record shape is unchanged (inv. 1). Only words actually spoken are stored — nothing invented.
 *
 * 1.9.3 hardening (found by a false-trigger sweep): bare "schedule …" / "book …" no longer
 * trigger ("schedule for the crew is posted", "book club meets…"); "details" is no longer a
 * notes cue; bare hours use the sentence's context ("dinner at 7", "at 9 tonight" → evening);
 * "9 in the evening" is understood; "from 3 to 11 pm" keeps the end time in notes; "the day
 * after tomorrow", "next week", "this weekend" set the date; month words never become a place.
 */
import type { TypedFields } from '../state/AppContext';
import { matchDatePhrase, parseWhen } from './query';
import { iso } from './datetime';

export type CommandKind = 'event' | 'reminder' | 'note';

export interface VoiceCommand {
  kind: CommandKind;
  trigger: string; // the phrase that was recognised, e.g. "set schedule" ('' when inferred)
  fields: TypedFields;
  inferred?: boolean; // 1.9.4: no trigger was said — the phone picked the label (inferVoiceCommand)
}

/* ---------------- triggers (checked at the START of the sentence) ---------------- */

const TRIGGERS: { kind: CommandKind; re: RegExp }[] = [
  {
    kind: 'event',
    // "set (a/my) schedule", "add an event", "make an appointment", "add a booking", "set an appt",
    // "add to my calendar", "schedule (a) …", "book a …". "schedule" is NOT a trigger when it's
    // talked ABOUT ("schedule for the crew is posted", "schedule was changed"), and a bare
    // "book …" isn't either ("book club meets…") — only "book a / an / my …".
    re: /^(?:(?:set|add|make|create|put)\s+(?:up\s+)?(?:a|an|the|my|new)?\s*(?:schedules?|events?|appointments?|appts?|meetings?|bookings?|reservations?)(?:\s+(?:for|on|to))?|add\s+to\s+(?:my\s+)?(?:schedule|calendar)|put\s+(?:it\s+|this\s+)?(?:on|in|to)\s+(?:my\s+|the\s+)?(?:schedule|calendar)|new\s+(?:schedules?|events?|appointments?|appts?|meetings?|bookings?|reservations?)|book\s+(?:a|an|my)(?:\s+(?:appointment|meeting|appt|booking|reservation))?(?=\s)|schedule(?:\s+(?:a|an|my))?(?=\s+(?!(?:for|is|was|of|has|had|will|says|said|changed|update|updated|posted|shows?)\b)\w))\b/i,
  },
  {
    kind: 'reminder',
    re: /^(?:remind\s+me(?:\s+to|\s+about)?|(?:set|add|make|create)\s+(?:a|an|new)?\s*(?:reminders?|alarms?|tasks?|to-?dos?|errands?|chores?)(?:\s+(?:to|for|about|that))?|new\s+(?:reminders?|alarms?|tasks?|to-?dos?|errands?|chores?)(?:\s+(?:to|for))?|reminder(?:\s+(?:to|for|that))?)\b/i,
  },
  {
    kind: 'note',
    // 2.0.0 build 99 (user: "take note … is the instruction, not the content"): also "take notes",
    // "save / write / jot (down) a note", "write down …", "jot down …", "note down …"
    re: /^(?:(?:take|add|make|create|save|write|jot)\s+(?:down\s+)?(?:a|an|new|this)?\s*(?:notes?|memos?)(?:\s+(?:that|of|down))?|(?:write|jot|note)\s+(?:this\s+|it\s+)?down(?:\s+that)?|new\s+(?:note|memo)|(?:note|memo)(?:\s+(?:that|to\s+self))?)\b/i,
  },
];

/** Polite or filler words people say before the trigger ("okay, please set schedule …"). */
const LEAD = /^(?:(?:ok(?:ay)?|hey|hi|oh|um+|uh+|so|and|also|right|alright|please|can\s+you|could\s+you|i\s+want\s+to|i'd\s+like\s+to|let's)[\s,]+)+/i;

/* ---------------- speech-to-text clean-up ---------------- */

const HOURS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const HOUR_WORD = '(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\\d{1,2})';

/** Words that place a bare hour in the evening / morning ("dinner at 7", "breakfast at 8"). */
const EVENING_CUE = /\b(tonight|evening|night|dinner|supper|party|drinks|cocktails?|show|gala|movie|bar|club)\b/i;
const MORNING_CUE = /\b(morning|breakfast|sunrise|dawn)\b/i;

function hourOf(h: string): number {
  return HOURS[h.toLowerCase()] ?? Number(h);
}

/** Normalise what Android STT writes so the date/time parser understands it. */
function normalise(text: string, now: Date): string {
  let t = text
    .replace(/\b([ap])\.\s?m\.?/gi, (_, x) => `${x.toLowerCase()}m`) // "3 p.m." → "3 pm"
    .replace(/\b(\d{1,2})\s+o'?clock\b/gi, '$1:00') // "3 o'clock" → "3:00"
    .replace(/\bnoon\b/gi, '12pm')
    .replace(/\bmidnight\b/gi, '12am');

  // "the day after tomorrow" → the actual date (the date parser only knows today/tomorrow)
  t = t.replace(/\b(?:on\s+)?(?:the\s+)?day\s+after\s+tomorrow\b/gi, () => {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    return iso(d);
  });

  // "9 in the evening" / "7 in the morning" / "10 at night" → "9 pm" / "7 am" / "10 pm"
  t = t.replace(
    new RegExp(`\\b${HOUR_WORD}(?::(\\d{2}))?\\s+(in\\s+the\\s+(morning|afternoon|evening)|at\\s+night)\\b`, 'gi'),
    (all, h, mm, _p, part) => {
      const n = hourOf(h);
      if (!(n >= 1 && n <= 12)) return all;
      const pm = part ? part.toLowerCase() !== 'morning' : true;
      return `${n}${mm ? ':' + mm : ''} ${pm ? 'pm' : 'am'}`;
    },
  );

  // Context for bare hours, read from the whole sentence BEFORE "tonight" is rewritten.
  const evening = EVENING_CUE.test(t);
  const morning = MORNING_CUE.test(t);
  t = t.replace(/\btonight\b/gi, 'today evening');

  // "at nine" / "at 10" with no am/pm → a clock time. Context wins (dinner / tonight → evening,
  // breakfast / morning → morning); otherwise people mean 7–11 in the morning and 12–6 after noon.
  t = t.replace(
    new RegExp(`\\b(at|from|until|till|to)\\s+${HOUR_WORD}(?::(\\d{2}))?(?!\\s*(?:am|pm)|\\d|:)\\b`, 'gi'),
    (all, cue, h, mm) => {
      const n = hourOf(h);
      if (!(n >= 1 && n <= 12)) return all;
      // "to 5" / "till 5" only counts as a time when a start time was spoken too
      if (/^(to|until|till)$/i.test(cue) && !/\d\s*(am|pm)\b|\d:\d{2}/i.test(t)) return all;
      let ap: 'am' | 'pm';
      if (evening && !morning) ap = n === 12 ? 'am' : 'pm';
      else if (morning && !evening) ap = n === 12 ? 'pm' : 'am';
      else ap = n >= 7 && n <= 11 ? 'am' : 'pm';
      return `${cue} ${n}${mm ? ':' + mm : ''} ${ap}`;
    },
  );
  return t.replace(/\s+/g, ' ').trim();
}

/* ---------------- field extraction ---------------- */

const WEEKDAY = '(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)';
const MONTH_WORD =
  '(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)';
// Words that end a "with …" / "at …" phrase.
const STOP = `(?=\\s+(?:on|at|in|with|today|tomorrow|tonight|next|this|by|from|until|till|notes?|${WEEKDAY})\\b|[,.;]|$)`;

const ONE_TIME = '\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)|\\d{1,2}:\\d{2}';
const TIME_RE = new RegExp(`\\b(?:at\\s+|by\\s+|from\\s+)?(?:${ONE_TIME})\\b`, 'i');
// "from 3 pm to 11 pm" / "3 pm until 5 pm" — the END time has no field, so it goes to notes
const END_RE = new RegExp(`\\s+(?:to|until|till|-)\\s+(${ONE_TIME})\\b`, 'i');
const DAY_RE = new RegExp(
  `\\b(?:on\\s+)?(?:(?:today|tomorrow)(?:\\s+(?:morning|afternoon|evening|night))?|(?:next|this)\\s+(?:${WEEKDAY}|week|weekend|month)|${WEEKDAY}(?!'s))\\b|\\b(?:on\\s+)?\\d{4}-\\d{2}-\\d{2}\\b`,
  'i',
);

function take(re: RegExp, s: string): { hit: string | null; rest: string } {
  const m = s.match(re);
  if (!m || typeof m.index !== 'number') return { hit: null, rest: s };
  return { hit: m[0], rest: (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).replace(/\s+/g, ' ') };
}

function tidy(s: string, capitalise = true): string {
  const t = s
    .replace(/\s+([,.;])/g, '$1')
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '')
    .replace(/^(?:to|for|about|that|a|an)\s+/i, '') // "remind me TO …", "schedule FOR …"
    // a cue left dangling at the end — but not "sign on" / "log on" (crew words, voice.27)
    .replace(/(\S+)\s+(?:on|at|for|with|by|from)$/i, (all, prev) => (/^(?:sign|log|check|signed|logged)$/i.test(prev) && /on$/i.test(all) ? all : prev))
    // "my flight home is [on Dec 15]" / "[Friday] is formal night" — once the date is taken out,
    // the "is" it hung on is left at an edge of the title (1.9.4)
    .replace(/\s+(?:is|are|was|were|will\s+be|starts?|begins?)$/i, (m) => (/start|begin/i.test(m) ? m : ''))
    .replace(/^(?:is|are|was|were|will\s+be)\s+/i, '')
    .trim();
  return t && capitalise ? t[0].toUpperCase() + t.slice(1) : t;
}

function timeHasPassed(time: string, now: Date): boolean {
  const m = time.toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m) return false;
  let h = +m[1];
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  return h * 60 + (m[2] ? +m[2] : 0) <= now.getHours() * 60 + now.getMinutes();
}

/** Read the sentence after the trigger into What / When / Where / Who / Notes. */
function readFields(body: string, kind: CommandKind, now: Date): TypedFields {
  let rest = normalise(body, now);

  // notes: "… note bring passport" / "… notes: …" — everything after the cue
  const notesParts: string[] = [];
  const nm = rest.match(/\s(?:notes?)\s*:?\s+(.+)$/i);
  if (nm && typeof nm.index === 'number') {
    notesParts.push(nm[1].trim());
    rest = rest.slice(0, nm.index);
  }

  if (kind === 'note') {
    // 2.0.0 build 99: a note keeps every word in its title, but a day / time said in it is ALSO
    // stored as the note's date and time — "note meeting on Saturday 1 pm" must answer "when is
    // the meeting" (it used to be saved with no date at all)
    const asEvent = readFields(body, 'event', now);
    const onlyToday = /^today$/i.test(asEvent.when.trim());
    // a time with no day ("the gym opens at 6 am") keeps just the time — a note never gets a day
    // nobody said (the schedule rule adds today / tomorrow for a bare time; not for a note)
    const today0 = new Date(now);
    today0.setHours(0, 0, 0, 0);
    const daySaid = DAY_RE.test(rest) || !!matchDatePhrase(rest, today0);
    const when = onlyToday ? '' : daySaid ? asEvent.when : asEvent.when.replace(/^(?:today|tomorrow)\s+/i, '');
    return { what: tidy(rest), when, where: '', who: '', notes: notesParts.join(' ') };
  }

  // when: one day phrase + one time phrase (removed from the title, kept for parseWhen)
  const whenBits: string[] = [];
  let r = take(DAY_RE, rest);
  if (r.hit) whenBits.push(r.hit.replace(/^on\s+/i, ''));
  rest = r.rest;
  // voice.27: a date WITH its year ("March 5, 2028", "5/3/2027"), a month ("March 2028"), "next
  // year", "in 2 years" — the whole phrase goes to "when", so the year is never dropped
  const today0 = new Date(now);
  today0.setHours(0, 0, 0, 0);
  const md = matchDatePhrase(rest, today0);
  if (md) {
    whenBits.push(rest.slice(md.index, md.index + md.length));
    rest = (rest.slice(0, md.index).replace(/\b(?:on\s+)(?:the\s+)?$/i, '') + ' ' + rest.slice(md.index + md.length)).replace(/\s+/g, ' ');
  }
  r = take(TIME_RE, rest);
  const timeSaid = r.hit ? r.hit.replace(/^(?:at|by|from)\s+/i, '') : null;
  if (timeSaid) whenBits.push(timeSaid);
  rest = r.rest;
  if (timeSaid) {
    // the end of a span ("to 11 pm") — kept, in notes, so it isn't lost or left in the title
    const end = take(END_RE, rest);
    if (end.hit) {
      notesParts.unshift(`until ${end.hit.replace(/^\s*(?:to|until|till|-)\s+/i, '').trim()}`);
      rest = end.rest;
    }
  }
  // A time with no day ("lunch at 1pm") means the next time it comes round: today, or
  // tomorrow if that time has already passed.
  if (timeSaid && whenBits.length === 1) whenBits.unshift(timeHasPassed(timeSaid, now) ? 'tomorrow' : 'today');

  // who: "with Sam and Priya"
  let who = '';
  r = take(new RegExp(`\\bwith\\s+(.+?)${STOP}`, 'i'), rest);
  if (r.hit) who = r.hit.replace(/^with\s+/i, '').trim();
  rest = r.rest;

  // where: "at the Main dining room" / "in Main clinic" (after times are gone, "at" is a place).
  // Never a part of day, a month ("in March"), or a number ("in 3 days").
  let where = '';
  r = take(
    new RegExp(
      `\\b(?:at|in)\\s+(?!the\\s+(?:morning|afternoon|evening)\\b)(?!${MONTH_WORD}\\b)(?!\\d)(.+?)${STOP}`,
      'i',
    ),
    rest,
  );
  if (r.hit) where = r.hit.replace(/^(?:at|in)\s+/i, '').trim();
  rest = r.rest;
  // "on the open deck" — by now every date has been removed, so "on the …" left over is a place
  if (!where) {
    r = take(new RegExp(`\\bon\\s+the\\s+(?!${MONTH_WORD}\\b)(?!\\d)(.+?)${STOP}`, 'i'), rest);
    if (r.hit) where = r.hit.replace(/^on\s+/i, '').trim();
    rest = r.rest;
  }

  // "the crew party" → "Crew party" (a title doesn't need the article; notes keep theirs)
  return {
    what: tidy(rest.replace(/^\s*the\s+/i, '')),
    when: whenBits.join(' '),
    where: tidy(where, false),
    who: tidy(who, false),
    notes: notesParts.join(' · '),
  };
}

/** A recognised voice command, or null when the sentence doesn't start with a trigger. */
export function parseVoiceCommand(transcript: string, now: Date = new Date()): VoiceCommand | null {
  const text = transcript.trim().replace(LEAD, '');
  for (const { kind, re } of TRIGGERS) {
    const m = text.match(re);
    if (!m) continue;
    const body = text.slice(m[0].length).replace(/^[\s,.:;-]+/, '');
    const fields = readFields(body, kind, now);
    // "set a meeting Friday 2 pm", "make an appointment with the doctor Monday" — the command's own
    // word is the only WHAT said, so it becomes the title (an empty title can't be saved)
    if (!fields.what.trim()) {
      const noun = m[0].match(/\b(appointments?|appts?|meetings?|events?|schedules?|reminders?|alarms?|tasks?|to-?dos?|errands?|chores?|bookings?|reservations?)\b/i)?.[1];
      const titled: Record<string, string> = {
        appt: 'Appointment', appts: 'Appointment',
        todo: 'To-do', todos: 'To-do', 'to-do': 'To-do', 'to-dos': 'To-do',
      };
      if (noun && (fields.when || fields.who || fields.where || fields.notes)) {
        const key = noun.toLowerCase();
        const full = titled[key] ?? key.replace(/s$/, '');
        fields.what = full[0].toUpperCase() + full.slice(1);
      }
    }
    return { kind, trigger: m[0].trim().toLowerCase(), fields };
  }
  return null;
}

/* ---------------- no trigger: the phone picks the label (1.9.4) ---------------- */

/** "I need to …", "don't forget to …", "make sure to …", "need milk" — a to-do said without a trigger. */
const NEED =
  /^(?:i\s+(?:really\s+)?(?:need|have|got|must|should|gotta|ought)\s+(?:to\s+)?|i\s+gotta\s+|(?:don'?t|do\s+not)\s+forget\s+(?:to\s+)?|remember\s+to\s+|make\s+sure\s+(?:to\s+|that\s+i\s+)?|need\s+(?:to\s+)?|have\s+to\s+|must\s+|gotta\s+|got\s+to\s+)/i;

/**
 * A sentence that starts with one of these is a job to do → reminder ("buy a bread on your way
 * home"). Not when the verb is part of a noun: "buy-in", "pick-up", "sign on/off" (joining or
 * leaving the ship is a date, not a chore).
 */
const TODO_VERB =
  /^(?:buy|get|grab|pick\s+up|collect|fetch|bring|take|call|phone|ring|text|message|email|e-mail|whatsapp|reply\s+to|tell|ask|pay|send|post|mail|order|book|return|renew|cancel|refill|top\s+up|withdraw|deposit|exchange|change|charge|pack|unpack|clean|wash|iron|fold|fix|repair|feed|water|print|scan|sign(?!\s+(?:on|off)\b)|submit|fill\s+(?:in|out)|finish|check|prepare|cook|drop\s+off|stop\s+by|pass\s+by|try|apply\s+for|update|upload|download|install|backup|back\s+up|save|start|look\s+for|find|follow\s+up|confirm)\b(?![-'])/i;

/**
 * Going somewhere or seeing someone: with a clock time it's an appointment → schedule ("go to the
 * dentist on Thursday at 3", "meet Sam at 5 pm"); without one it's a job → reminder ("go to the
 * bank tomorrow", "see the doctor about my back").
 */
const GO_VERB = /^(?:go\s+to|visit|see|meet|drop\s+by|head\s+to)\b(?![-'])/i;

/**
 * A statement ABOUT something, not a job: "call sign of the ship is ZCDF4", "pick up point is
 * deck 2", "check out time is 10 am", "get well card from the team was lovely". A verb-led sentence
 * that reaches is / are / was / were / costs … within its first 7 words — before any joining word
 * (because, so, if, that …) — is a fact, not a to-do. "buy a gift for Sam because he is leaving"
 * stays a to-do: its "is" comes after "because".
 */
const COPULA = /^(?:is|are|was|were|costs?|means)$/i;
const JOINER = /^(?:because|cause|so|since|if|when|while|that|which|who|before|after|and|or|but|as|until|till)$/i;

function isStatement(body: string): boolean {
  const words = body.toLowerCase().replace(/[,.;:!?]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 8);
  for (let i = 1; i < words.length; i++) {
    if (JOINER.test(words[i])) return false;
    if (COPULA.test(words[i])) return true;
  }
  return false;
}

/** Verbs that pass on a message — "tell the chef the soup is cold" is a job even with its "is". */
const SAY_VERB = /^(?:tell|ask|text|message|email|e-mail|whatsapp|remind|warn|inform)\b/i;

function isTodo(body: string): boolean {
  return TODO_VERB.test(body) && (SAY_VERB.test(body) || !isStatement(body));
}

/** Does this start like a job to do ("Buy a bread …", "I need to call …")? Used for the wording. */
export function todoBody(s: string): string | null {
  const t = s.trim().replace(LEAD, '');
  const need = t.match(NEED);
  const body = need ? t.slice(need[0].length) : t;
  return need || isTodo(body) || GO_VERB.test(body) ? body : null;
}

/**
 * No trigger phrase → the phone picks one of THREE labels itself — reminder, schedule (stored as
 * type "event") or note (used offline, and as the tie-break for Gemini's label online):
 *   1. a to-do ("buy …", "call …", "I need to …", "don't forget to …", "need milk") → reminder,
 *      even with a day or time ("pay the bill on Friday")
 *   2. go / visit / see / meet … → schedule WITH a clock time, reminder without
 *   3. otherwise a day or time in the sentence ("dinner with Sam Friday at 7") → schedule —
 *      except a bare "today" with no time ("great sunset at sea today") → note
 *   4. anything else → note
 * Fields are read exactly as for a spoken command, so only words actually said are stored.
 * Hardened 1.9.4 against a corpus of crew sentences (see CHANGELOG 1.9.4).
 */
export function inferVoiceCommand(transcript: string, now: Date = new Date()): VoiceCommand {
  const text = transcript.trim().replace(LEAD, '');
  const need = text.match(NEED);
  const body = need ? text.slice(need[0].length) : text;
  const pick = (kind: CommandKind, from: string): VoiceCommand => ({
    kind,
    trigger: '',
    inferred: true,
    fields: readFields(from, kind, now),
  });

  if (GO_VERB.test(body)) {
    const asEvent = readFields(body, 'event', now);
    return /\d/.test(asEvent.when) ? { kind: 'event', trigger: '', inferred: true, fields: asEvent } : pick('reminder', body);
  }
  if (need || isTodo(body)) return pick('reminder', body);

  const asEvent = readFields(text, 'event', now);
  const onlyToday = /^today$/i.test(asEvent.when.trim());
  if (asEvent.when && !onlyToday) return { kind: 'event', trigger: '', inferred: true, fields: asEvent };
  return pick('note', text);
}

/** The three voice labels (1.9.4): schedule (stored as "event"), reminder, note. */
export type VoiceLabel = CommandKind;

/** Gemini's types for a schedule item — all saved as "event" (shown and spoken as schedule). */
const SCHEDULE_TYPES = new Set(['event', 'appointment', 'meeting', 'schedule', 'booking', 'reservation', 'flight', 'drill', 'shift', 'party', 'class', 'training']);
/** Gemini's types for a job to do — saved as a reminder. */
const TASK_TYPES = new Set(['reminder', 'task', 'todo', 'to-do', 'to do', 'errand', 'chore', 'shopping', 'shopping list', 'shopping item', 'action', 'action item']);

/**
 * A voice note Gemini read (online, no trigger said) is folded into the SAME three labels as the
 * phone uses (1.9.4): a schedule type → "event", a to-do type → "reminder". Any other type
 * ("wine", "price", "note", "contact" …) is decided by the phone's rules on the sentence, so it
 * lands on reminder / event / note — never a fourth label.
 */
export function voiceNoteType(geminiType: string, transcript: string): VoiceLabel {
  const t = (geminiType || '').toLowerCase().trim();
  if (SCHEDULE_TYPES.has(t)) return 'event';
  if (TASK_TYPES.has(t)) return 'reminder';
  return inferVoiceCommand(transcript).kind;
}

/** The note, schedule, or reminder a spoken save instruction becomes. Null when it is not a save. */
export interface VoiceSaveShape {
  type: string;
  title: string;
  date: string | null;
  time: string | null;
  location: string | null;
  people: string | null;
  notes: string | null;
}

/** Same fields `addTypedRecord` stores for a voice command, so a wrong save can be found again. */
export function voiceSaveShape(text: string, now = new Date()): VoiceSaveShape | null {
  const cmd = parseVoiceCommand(text, now);
  if (!cmd) return null;
  const what = cmd.fields.what.trim();
  const notes = cmd.fields.notes.trim();
  const { date, time } = parseWhen(cmd.fields.when || '');
  const people =
    cmd.fields.who
      .split(/\s*(?:,|\band\b)\s*/i)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(', ') || null;
  return {
    type: cmd.kind,
    title: (what || notes).slice(0, 200) || 'Untitled',
    date,
    time,
    location: cmd.fields.where.trim() || null,
    people,
    notes: notes || null,
  };
}

export function sameSaveShape(
  rec: { type: string; title: string; date: string | null; time: string | null; location: string | null; people: string | null; notes: string | null },
  shape: VoiceSaveShape,
): boolean {
  return (
    rec.type === shape.type &&
    rec.title === shape.title &&
    rec.date === shape.date &&
    rec.time === shape.time &&
    (rec.location ?? null) === shape.location &&
    (rec.people ?? null) === shape.people &&
    (rec.notes ?? null) === shape.notes
  );
}
