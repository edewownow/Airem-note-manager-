/**
 * One mic, two jobs (1.12.0-voice.13) — does a spoken sentence want an ANSWER or to be SAVED?
 * Word rules only, on the phone. Measured on 222 sentences (scripts/intent-measure.ts, 2026-10-27):
 * 97.3% right — every save and question already in the tests right; misses are short fragments said
 * with no "?" ("dinner with Sam") and odd statements that start like questions. The ask bar never
 * acts on its own: the guess only sets the button (Ask / Save), you tap it, and can flip it first.
 *
 * Private rules run first, exactly as the ask bar's own (passwords / IDs → the Private folder).
 */
import { parsePrivateSearch, parsePrivateSave, askForAnyCard, askForLetters, parseExpiryAsk } from './privateSearch';
import { parseListAll } from './listCommands';
import { expandWords, learnedIntent, parseTeach } from './learning';
import { parseCategoryCommand } from './categories';
import { categoriesEnabled } from './categories';
import { pAsk, type IntentWeights } from './intentModel';
import MODEL from './intentModel.weights.json';

/**
 * build 98: when the rules AREN'T sure, MemoAirem's own small model (lib/intentModel.ts) picks which
 * pill is filled — it never acts on its own (measured: scripts/intent-model/train.ts).
 */
function modelGuess(t: string, fallback: Intent): Intent {
  try {
    return pAsk(MODEL as IntentWeights, t) >= 0.5 ? 'ask' : 'save';
  } catch {
    return fallback;
  }
}

export type Intent = 'ask' | 'save';

/* ---------------- classifier ---------------- */

const FILLER = /^(?:(?:ok(?:ay)?|hey|hi|oh|um+|uh+|so|please|and|also|can\s+you|could\s+you)[\s,]+)+/i;
// explicit save words at the start — always a save
const SAVE_START =
  /^(?:set\s+(?:a\s+)?(?:schedule|reminder|alarm)|schedule\b|remind\s+me|reminder\b|note\b|take\s+(?:a\s+)?note|make\s+a\s+note|save\b|store\b|add\b|record\b|remember\s+(?:to|that)\b|don'?t\s+forget|private\s+note|put\s+down)/i;
// question openers
const WH = /^(?:what|what'?s|whats|when|when'?s|where|where'?s|who|who'?s|whom|whose|which|how|how'?s|why)\b/i;
const AUX = /^(?:is|are|am|was|were|do|does|did|can|could|will|would|should|shall|have|has|had|any|anything|is\s+there|are\s+there)\b/i;
const LOOKUP = /^(?:show|list|find|search|look\s+up|lookup|check|tell\s+me|give\s+me|read\s+(?:me\s+)?(?:my|the)|open)\b/i;
// "when I get home, call Sam" / "where the bus stops, wait" — a wh-word starting a CLAUSE, not a question
const WH_CLAUSE = /^(?:when|where|if|once|after|before)\s+(?:i|we|you|he|she|they|it|the|my|our|sam|mom)\b(?!\s*(?:'s|is|are)\b)/i;
// a bare time window — "today", "this week", "tomorrow?" — is a question about it
const BARE_WHEN =
  /^(?:(?:for\s+)?(?:today|tonight|tomorrow|yesterday|this\s+(?:week|weekend|month|morning|afternoon|evening)|next\s+(?:week|weekend|month|\w+day)|(?:on\s+)?(?:mon|tues|wednes|thurs|fri|satur|sun)day))\s*[?.!]?$/i;

/**
 * 2.0.0 (user: "what activities I have today" didn't get the right answer): "what / which / any /
 * my" + a schedule word ("activities", "tasks", "plans", "appointments" …), or a schedule word + a
 * day ("activities today", "my agenda tomorrow") — a question about the schedule, always.
 */
const SCHED_NOUN = '(?:activit(?:y|ies)|tasks?|errands?|chores?|plans?|appointments?|appts?|meetings?|meetups?|events?|schedules?|agenda|calendars?|things\\s+to\\s+do|to-?\\s?dos?|commitments?|bookings?|reservations?)';
const SCHED_ASK = new RegExp(
  `^(?:(?:what|which|any)\\s+(?:are\\s+)?(?:my\\s+|the\\s+)?${SCHED_NOUN}\\b|(?:my\\s+)?${SCHED_NOUN}\\s+(?:for\\s+|on\\s+)?(?:today|tonight|tomorrow|this\\s+(?:week|weekend|month|morning|afternoon|evening)|next\\s+(?:week|weekend|month)|(?:mon|tues|wednes|thurs|fri|satur|sun)day)\\s*[?.!]?$)`,
  'i',
);

/**
 * build 98 (found by the new sentences in scripts/intent-data.ts — the rules SAVED these with
 * certainty): "cost of the tour", "date of my flight", "time of the briefing", "notes about the gala",
 * "remind me what I have today" are questions. Not when the sentence states something ("the price of
 * Moet is 120 dollars" stays a save).
 */
const ASK_PHRASE =
  /^(?:(?:the\s+)?(?:cost|price|time|date|day|location|place|address|name|number|start|end)\s+of\s+|remind\s+me\s+(?:what|when|where|who|which|how)\s+(?:i|we|is|are|was|do|did|have)\b|(?:my\s+|the\s+)?notes\s+(?:about|on|for|from)\s+)/i;
const STATES = /\b(?:is|are|was|were|costs?|starts?|ends?)\b|=/i;
const askPhrase = (t: string) => ASK_PHRASE.test(t) && !STATES.test(t.replace(ASK_PHRASE, ''));

export function intentOf(text: string): Intent {
  const raw = text.trim().replace(FILLER, '');
  // A teaching sentence keeps the word you said. Every other sentence uses the corrected word
  // before the rules decide question or save.
  if (parseTeach(raw)) return 'ask';
  const t = expandWords(raw);
  // Private rules first, exactly as the ask bar does today (voice.29: + expiry questions)
  if (parseListAll(t)) return 'ask'; // 2.0.0: "list all passwords …"
  if (parseExpiryAsk(t)) return 'ask';
  if (parsePrivateSearch(t) !== null) return 'ask';
  if (parsePrivateSave(t)) return 'save';
  // 2.0.0 build 97: what YOU taught ("It was a question" / "Save it instead") beats the word rules
  const learned = learnedIntent(t);
  if (learned) return learned;
  if (askPhrase(t)) return 'ask'; // build 98
  if (SCHED_ASK.test(t)) return 'ask';
  if (SAVE_START.test(t)) return 'save';
  if (BARE_WHEN.test(t)) return 'ask';
  if (WH_CLAUSE.test(t)) return 'save';
  // round 2 ------------------------------------------------------------
  // "how to make…", "who to call…" — a how-to / who-to is a note
  if (/^(?:how|what|who|where|when|which)\s+to\b/i.test(t)) return 'save';
  // "check out time…", "check in at 3" — a phrasal noun, not a lookup
  if (/^check\s+(?:out|in)\b/i.test(t)) return 'save';
  // "find a gift…", "check the tire pressure", "look up the train times" — a to-do, unlike
  // "find Sam" / "check my schedule" / "show me this week" / "find the price of …"
  if (/^(?:find|check|look\s+up|search\s+for)\s+(?:a|an|some)\b/i.test(t)) return 'save';
  if (/^check\s+the\s+(?!price|time|date|schedule|menu)/i.test(t)) return 'save';
  if (/^look\s+up\s+the\b/i.test(t)) return 'save';
  // short fragments with no "?" that only make sense as a lookup: "my reminders", "Penfolds price"
  if (/^(?:my\s+)?(?:reminders|notes|schedule|events|agenda|plans)\s*[?.!]?$/i.test(t)) return 'ask';
  if (/^(?:\S+\s+){0,2}(?:price|cost|address|number)\s*[?.!]?$/i.test(t) && !/\b(?:is|are|was)\b/i.test(t)) return 'ask';
  if (WH.test(t) || AUX.test(t) || LOOKUP.test(t)) return 'ask';
  if (askForLetters(t) || askForAnyCard(t)) return 'ask';
  if (/\?\s*$/.test(t)) return 'ask';
  return 'save';
}

/* ---------------- sure or not (1.12.0-voice.16) ----------------
 * User: "let it execute the command if it's a clear instruction — Ask and Save are just the fallback".
 * `sure` = act at once; otherwise the Ask / Save pills appear. Sure only for forms that leave no
 * doubt; measured in scripts/intent-measure.ts (a wrong SURE guess acts wrongly, so precision is
 * what counts there).
 */
const SURE_WH =
  /^(?:what'?s|whats|when'?s|where'?s|who'?s|how'?s|(?:what|when|where|who|which|how|why)\s+(?:is|are|was|were|do|does|did|will|would|can|could|should|am|time|much|many|day|date|kind|about))\b/i;
const SURE_AUX = /^(?:(?:do|did|does|have|has|am)\s+i\b|(?:is|are)\s+there\b|any(?:thing)?\b|(?:is|are)\s+(?:my|the)\b)/i;
const SURE_LOOKUP = /^(?:show|list|find|search|check|tell|give|read|open)\s+(?:me\s+)?(?:my|all)\b/i;

export interface IntentGuess {
  intent: Intent;
  sure: boolean;
}

export function classifyIntent(text: string): IntentGuess {
  const raw = text.trim().replace(FILLER, '');
  if (parseTeach(raw)) return { intent: 'ask', sure: true };
  const t = expandWords(raw);
  // Categories: a bare tag ("#ship safety"), "clear category", "list categories"
  // and "categorize this as …" are commands that want a spoken reply, never a
  // save — a bare tag must not land as a note. Gated on the Settings switch,
  // so with categories off a "#…" note is just a note. Checked on the raw
  // text, the same text the engine checks, so the two never disagree.
  if (categoriesEnabled() && parseCategoryCommand(raw)) return { intent: 'ask', sure: true };
  // 2.0.0: "list all passwords / IDs / reminders …" — always an ask, at once (never a save)
  if (parseListAll(t)) return { intent: 'ask', sure: true };
  const intent = intentOf(t);
  if (parseExpiryAsk(t) || parsePrivateSearch(t) !== null || parsePrivateSave(t)) return { intent, sure: true };
  if (learnedIntent(t)) return { intent, sure: true }; // build 97: taught by you
  if (intent === 'save') {
    if (SAVE_START.test(t)) return { intent, sure: true };
    // a plain statement: sure when it's a full sentence (4+ words) and not a question in disguise
    const words = t.replace(/[?.!,]+/g, ' ').trim().split(/\s+/).filter(Boolean).length;
    const looksAsk = WH.test(t) || AUX.test(t) || LOOKUP.test(t) || /\?\s*$/.test(t);
    if (words >= 4 && !looksAsk) return { intent, sure: true };
    return { intent: modelGuess(t, intent), sure: false };
  }
  // intent === 'ask'
  if (askPhrase(t) || SCHED_ASK.test(t) || BARE_WHEN.test(t) || SURE_WH.test(t) || SURE_AUX.test(t) || SURE_LOOKUP.test(t)) return { intent, sure: true };
  if (/\?\s*$/.test(t) && !SAVE_START.test(t)) return { intent, sure: true };
  return { intent: modelGuess(t, intent), sure: false };
}
