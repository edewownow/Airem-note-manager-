/**
 * 2.0.0 build 97 — MemoAirem learns from you, on the phone only (user: "make the app understand
 * future commands with accuracy, learning from it as we talk to it more").
 *
 *  1. LESSONS from corrections. "It was a question" / "Save it instead" teach the SHAPE of what was
 *     said — days, times and numbers become placeholders, small words drop out — so "activities on
 *     Friday" learned once also covers "activities tomorrow". A lesson beats the word rules
 *     (lib/intent.ts), never the private-folder rules.
 *  2. MY WORDS. "When I say PH I mean PhilHealth" (said, typed in Settings, or by tapping a wrong
 *     word under the big mic). The big mic swaps them in before it asks or saves, so the next time
 *     that word is heard it already means what you typed.
 *  3. MISSES. Questions that found nothing, and every correction — a list in Settings to look at,
 *     export (to send to the developer) or clear.
 *
 * Never kept: anything for the Private folder (passwords, IDs, cards) and any sentence with a long
 * number (4+ digits in a row) — it might be a secret. Nothing here leaves the phone unless you export it.
 */
import { persist } from './persist';

export type LearnedIntent = 'ask' | 'save';

const LESSONS = 'learn_lessons';
const WORDS = 'learn_words';
const MISSES = 'learn_misses';
const HINTS = 'learn_record_hints';
const MAX_LESSONS = 300;
const MAX_WORDS = 100;
const MAX_MISSES = 200;

export interface Lesson {
  shape: string; // e.g. "activities <day>"
  intent: LearnedIntent;
  example: string; // the last sentence that taught it (your words)
  n: number; // how many times
  at: number; // last time (ms)
}

export interface MyWord {
  say: string; // what you say ("PH")
  mean: string; // what you mean ("PhilHealth")
  at: number;
  via?: 'mic'; // fixed with Fix a word on the big mic — its own list in Settings
}

export type MissKind = 'no-answer' | 'was-question' | 'was-save';

export interface Miss {
  text: string;
  kind: MissKind;
  at: number;
}

/* ---------------- storage (MMKV via lib/persist) ---------------- */

function load<T>(key: string): T[] {
  try {
    const a = JSON.parse(persist.getString(key) ?? '[]');
    return Array.isArray(a) ? (a as T[]) : [];
  } catch {
    return [];
  }
}

function store<T>(key: string, list: T[]): void {
  persist.set(key, JSON.stringify(list));
}

/* ---------------- what may be kept ---------------- */

/** A long number (4+ digits in a row, spaces / dashes allowed between) — might be a secret. */
const LONG_NUMBER = /\d(?:[\s-]?\d){3,}/;
const PRIVATE_WORDS =
  /\b(?:pass\s?words?|pass\s?codes?|pins?|log\s?ins?|private|secret|sss|tin|phil\s?health|pag-?ibig|hdmf|umid|passports?|visas?|prc|srb|seaman'?s|licen[cs]e|national\s+id|id|ids|i\.d\.?|cards?|cvv|bank\s+account|account\s+(?:no|number))\b/i;

/** May this sentence be remembered at all? (Private-folder sentences and long numbers never.) */
export function keepable(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 200) return false;
  if (LONG_NUMBER.test(t)) return false;
  if (PRIVATE_WORDS.test(t)) return false;
  return true;
}

/* ---------------- 1. lessons ---------------- */

const FILLER = /^(?:(?:ok(?:ay)?|hey|hi|oh|um+|uh+|so|please|and|also|can\s+you|could\s+you)[\s,]+)+/i;
const DAY =
  /\b(?:today|tonight|tomorrow|yesterday|(?:this|next|last)\s+(?:week|weekend|month|year|morning|afternoon|evening|night|\w+day)|(?:mon|tues|wednes|thurs|fri|satur|sun)day|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*(?:\s+\d{1,2}(?:st|nd|rd|th)?)?|\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|in\s+\d+\s+(?:days?|weeks?|months?|years?))\b/g;
const TIME = /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|\b\d{1,2}:\d{2}\b|\b(?:noon|midnight|morning|afternoon|evening)\b/g;
const SMALL = new Set(['a', 'an', 'the', 'on', 'at', 'in', 'for', 'of', 'to', 'my', 'me', 'i', 'is', 'are', 'please', 'do', 'have', 'got']);

/** The sentence's shape: placeholders for days / times / numbers, small words out, lower case. */
export function shapeOf(text: string): string {
  let t = text.toLowerCase().trim().replace(FILLER, '');
  t = t.replace(/[’']/g, "'").replace(/[?!,;"]+/g, ' ').replace(/\.(?!m\b|\d)/g, ' ');
  t = t.replace(DAY, ' <day> ').replace(TIME, ' <time> ').replace(/\b\d+(?:\.\d+)?\b/g, ' <n> ');
  const words = t.split(/\s+/).filter((w) => w && !SMALL.has(w));
  // "<day> <day>" (e.g. "tomorrow morning") → one
  return words.filter((w, i) => !(w === words[i - 1] && w.startsWith('<'))).join(' ');
}

export function listLessons(): Lesson[] {
  return load<Lesson>(LESSONS).sort((a, b) => b.at - a.at);
}

/** Remember the shape of a sentence you corrected. Returns false when it may not be kept. */
export function learnIntent(text: string, intent: LearnedIntent, now = Date.now()): boolean {
  if (!keepable(text)) return false;
  const shape = shapeOf(text);
  if (!shape || shape.split(' ').length > 12) return false;
  const list = load<Lesson>(LESSONS).filter((l) => l.shape !== shape);
  const old = load<Lesson>(LESSONS).find((l) => l.shape === shape);
  list.push({ shape, intent, example: text.trim().slice(0, 200), n: old && old.intent === intent ? old.n + 1 : 1, at: now });
  store(LESSONS, list.sort((a, b) => b.at - a.at).slice(0, MAX_LESSONS));
  return true;
}

/** What a lesson says about this sentence (null = nothing learned for its shape). */
export function learnedIntent(text: string): LearnedIntent | null {
  const shape = shapeOf(text);
  if (!shape) return null;
  const hit = load<Lesson>(LESSONS).find((l) => l.shape === shape);
  return hit ? hit.intent : null;
}

export function forgetLesson(shape: string): void {
  store(
    LESSONS,
    load<Lesson>(LESSONS).filter((l) => l.shape !== shape),
  );
}

/* ---------------- 2. my words ---------------- */

export function listWords(): MyWord[] {
  return load<MyWord>(WORDS).sort((a, b) => a.say.localeCompare(b.say));
}

/** Words corrected with Fix a word on the big mic. */
export function listMicWords(): MyWord[] {
  return listWords().filter((w) => w.via === 'mic');
}

const clean = (s: string) => s.replace(/^[\s"'“”‘’]+|[\s"'“”‘’.?!,]+$/g, '').replace(/\s+/g, ' ').trim();

/** Add or change one ("PH" → "PhilHealth"). `via: 'mic'` files it under Fixed on the mic. Returns an error, or null when saved. */
export function setWord(sayRaw: string, meanRaw: string, now = Date.now(), via?: 'mic'): string | null {
  const say = clean(sayRaw);
  const mean = clean(meanRaw);
  if (!say || !mean) return 'Fill in both: what you say, and what you mean.';
  if (say.length > 40 || mean.length > 60) return 'Keep it short — a word or a few.';
  if (say.toLowerCase() === mean.toLowerCase()) return 'Those are the same.';
  if (LONG_NUMBER.test(say) || LONG_NUMBER.test(mean)) return 'No long numbers here — they might be private.';
  const list = load<MyWord>(WORDS).filter((w) => w.say.toLowerCase() !== say.toLowerCase());
  if (list.length >= MAX_WORDS) return `Up to ${MAX_WORDS} words — remove one first.`;
  list.push(via ? { say, mean, at: now, via } : { say, mean, at: now });
  store(WORDS, list);
  return null;
}

/** The words of a spoken line, in order. */
export function wordsOf(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/** Replace one word. An empty replacement drops it. The rest of the line stays. */
export function replaceWordAt(text: string, index: number, mean: string): string {
  const words = wordsOf(text);
  if (index < 0 || index >= words.length) return text.trim();
  const next = mean.trim();
  if (!next) words.splice(index, 1);
  else words[index] = next;
  return words.join(' ');
}

export function removeWord(say: string): void {
  store(
    WORDS,
    load<MyWord>(WORDS).filter((w) => w.say.toLowerCase() !== say.toLowerCase()),
  );
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Your words swapped for what you mean — longest first, whole words only, any case. */
export function expandWords(text: string, words: MyWord[] = load<MyWord>(WORDS)): string {
  if (!words.length || !text) return text;
  let out = text;
  for (const w of [...words].sort((a, b) => b.say.length - a.say.length)) {
    // Plain letter/number boundaries. The phone's JS engine does not apply \p{L} the way Node does,
    // and a missed match left the same wrong word in the next question.
    const re = new RegExp(`(^|[^A-Za-z0-9])${esc(w.say).replace(/\s+/g, '\\s+')}(?=$|[^A-Za-z0-9])`, 'gi');
    out = out.replace(re, (_m, pre) => `${pre}${w.mean}`);
  }
  return out;
}

/** "when I say PH I mean PhilHealth" / "remember PH means PhilHealth" → the pair, else null. */
export function parseTeach(text: string): { say: string; mean: string } | null {
  const t = text.trim().replace(FILLER, '').replace(/[.!]+$/, '');
  const m =
    t.match(/^(?:remember\s+(?:that\s+)?)?when\s+i\s+say\s+(.+?)[\s,]+i\s+mean\s+(.+)$/i) ??
    t.match(/^remember\s+(?:that\s+)?["“]?(.+?)["”]?\s+(?:means|stands\s+for)\s+(.+)$/i);
  if (!m) return null;
  const say = clean(m[1]);
  const mean = clean(m[2]);
  if (!say || !mean || say.split(' ').length > 5 || mean.split(' ').length > 8) return null;
  return { say, mean };
}

/* ---------------- 3. misses ---------------- */

export function listMisses(): Miss[] {
  return load<Miss>(MISSES).sort((a, b) => b.at - a.at);
}

/** Note something MemoAirem got wrong or couldn't answer. Private-looking sentences are never kept. */
export function noteMiss(text: string, kind: MissKind, now = Date.now()): boolean {
  if (!keepable(text)) return false;
  const t = text.trim().slice(0, 200);
  const list = load<Miss>(MISSES).filter((m) => !(m.text.toLowerCase() === t.toLowerCase() && m.kind === kind));
  list.push({ text: t, kind, at: now });
  store(MISSES, list.sort((a, b) => b.at - a.at).slice(0, MAX_MISSES));
  return true;
}

export function clearMisses(): void {
  persist.delete(MISSES);
}

/* ---------------- a miss pointed at the right record ---------------- */

export interface RecordHint {
  shape: string;
  title: string;
  at: number;
}

export function listRecordHints(): RecordHint[] {
  return load<RecordHint>(HINTS).sort((a, b) => b.at - a.at);
}

/** Remember that this question shape is answered by that saved title. */
export function learnRecord(question: string, title: string, now = Date.now()): boolean {
  if (!keepable(question) || !keepable(title)) return false;
  const shape = shapeOf(question);
  const kept = title.trim().slice(0, 200);
  if (!shape || !kept) return false;
  const list = load<RecordHint>(HINTS).filter((h) => h.shape !== shape);
  list.push({ shape, title: kept, at: now });
  store(HINTS, list.sort((a, b) => b.at - a.at).slice(0, 100));
  return true;
}

export function forgetRecordHint(shape: string): void {
  store(HINTS, load<RecordHint>(HINTS).filter((h) => h.shape !== shape));
}

/** The title you pointed at for a question of this shape, if any. */
export function hintedTitle(question: string): string | null {
  const shape = shapeOf(question);
  if (!shape) return null;
  return load<RecordHint>(HINTS).find((h) => h.shape === shape)?.title ?? null;
}

/** The export file: plain lines a person (or the developer) can read. */
export function missesReport(appVersion: string, now = new Date()): string {
  const lines = listMisses().map((m) => {
    const what = m.kind === 'no-answer' ? 'NO ANSWER' : m.kind === 'was-question' ? 'WAS A QUESTION (saved by mistake)' : 'WAS A SAVE (answered by mistake)';
    return `${new Date(m.at).toISOString().slice(0, 16).replace('T', ' ')}\t${what}\t${m.text}`;
  });
  const lessons = listLessons().map((l) => `${l.intent.toUpperCase()}\t${l.shape}\t(e.g. "${l.example}", ${l.n}×)`);
  const words = listWords().map((w) => `${w.say} → ${w.mean}`);
  return [
    `MemoAirem ${appVersion} — what it missed (${now.toISOString().slice(0, 10)})`,
    'Nothing private is ever kept in this list.',
    '',
    `MISSES (${lines.length})`,
    ...lines,
    '',
    `LESSONS (${lessons.length})`,
    ...lessons,
    '',
    `MY WORDS (${words.length})`,
    ...words,
    '',
  ].join('\n');
}

/** Everything learned, gone (Settings → Learning → Forget all). */
export function forgetAllLearning(): void {
  persist.delete(LESSONS);
  persist.delete(WORDS);
  persist.delete(MISSES);
  persist.delete(HINTS);
}
