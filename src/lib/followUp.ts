/**
 * One follow-up. "When is the meeting?" then "who is coming?" or "and Saturday?"
 * still means that meeting. A full new question replaces it. A private question never
 * calls this.
 */
import { interpret } from './query';

interface Slot {
  subject: string;
}

let slot: Slot | null = null;

const DAY =
  /^(?:today|tonight|tomorrow|yesterday|(?:this|next|last)\s+(?:week|weekend|month|morning|afternoon|evening)|(?:on\s+)?(?:mon|tues|wednes|thurs|fri|satur|sun)day)$/i;
const LEAD = /^(?:and|also|what about|how about)\s+/i;

export function clearFollowUp(): void {
  slot = null;
}

export function isFollowUp(text: string): boolean {
  if (!slot) return false;
  const t = text.trim().replace(/[?.!]+$/g, '').replace(LEAD, '');
  return DAY.test(t) || /^(?:who(?:'s| is| are)?(?:\s+(?:coming|there|going|invited))?|where(?:\s+is(?:\s+(?:it|that))?)?)$/i.test(t);
}

/** The question to run. A fragment keeps the last subject. Anything else is unchanged. */
export function continueQuestion(text: string): string {
  if (!isFollowUp(text) || !slot) return text.trim();
  const t = text.trim().replace(/[?.!]+$/g, '').replace(LEAD, '');
  if (/^who\b/i.test(t)) return `who is coming to the ${slot.subject}`;
  if (/^where\b/i.test(t)) return `where is the ${slot.subject}`;
  return `when is the ${slot.subject} ${t}`;
}

/** Remember the subject of a question that found something. */
export function rememberQuestion(text: string): void {
  const i = interpret(text);
  const subject = i.subjects[0] || i.keywords.find((k) => k.length > 2) || '';
  if (!subject) {
    slot = null;
    return;
  }
  slot = { subject };
}
