/**
 * Help the listener prefer words you actually use.
 *
 * Google (Android 13+) is given these phrases while it listens. When it returns more than one
 * guess, the one that matches your phrases wins. A single unknown word that is one letter off a
 * phrase you use is snapped to that phrase. Notes and the Private folder are never sent.
 */
const SKIP = new Set([
  'the', 'a', 'an', 'my', 'me', 'i', 'is', 'are', 'on', 'at', 'in', 'to', 'for', 'of', 'and', 'or',
  'with', 'from', 'this', 'that', 'it', 'was', 'be', 'have', 'has', 'do', 'did', 'note', 'notes',
  'today', 'tomorrow', 'please', 'what', 'when', 'where', 'who', 'how', 'why',
]);
const LONG_NUMBER = /\d(?:[\s-]?\d){3,}/;
const MAX_HINTS = 48;

export interface HearRecord {
  type: string;
  title: string;
  location: string | null;
  people: string | null;
}

function addPhrase(out: string[], seen: Set<string>, raw: string): void {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (t.length < 2 || t.length > 60 || LONG_NUMBER.test(t)) return;
  const key = t.toLowerCase();
  if (seen.has(key) || SKIP.has(key)) return;
  seen.add(key);
  if (out.length < MAX_HINTS) out.push(t);
}

/** Phrases the recognizer should expect: words you corrected, then names, places, and short titles. */
export function listenHints(records: HearRecord[], means: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const mean of means) addPhrase(out, seen, mean);
  for (const rec of records) {
    if (rec.type === 'private' || rec.type === 'private-note' || rec.type === 'private-doc') continue;
    if (rec.people) for (const person of rec.people.split(',')) addPhrase(out, seen, person);
    if (rec.location) addPhrase(out, seen, rec.location);
    const title = (rec.title || '').trim();
    if (!title) continue;
    const words = title.split(/\s+/);
    if (words.length <= 4) addPhrase(out, seen, title);
    for (const word of words) addPhrase(out, seen, word);
  }
  return out;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function mentions(text: string, hint: string): boolean {
  const re = new RegExp(`(^|[^a-z0-9])${esc(hint.toLowerCase())}(?=$|[^a-z0-9])`, 'i');
  return re.test(text.toLowerCase());
}

/** How well a guess lines up with phrases you use. A longer phrase counts for more. */
function score(text: string, hints: string[]): number {
  let n = 0;
  for (const hint of hints) if (mentions(text, hint)) n += hint.split(/\s+/).length;
  return n;
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 99;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let last = i - 1;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = a[i - 1] === b[j - 1] ? last : 1 + Math.min(last, prev[j], prev[j - 1]);
      last = prev[j];
      prev[j] = cur;
    }
    if (Math.min(...prev) > 1) return 99;
  }
  return prev[b.length];
}

/** Swap one unknown word for the only saved word it is a single letter away from. */
function snapWords(text: string, hints: string[]): string {
  const singles = hints.filter((h) => !/\s/.test(h) && h.length >= 4).map((h) => h.toLowerCase());
  if (!singles.length) return text;
  return text.split(/(\s+)/).map((part) => {
    if (!part || /\s/.test(part)) return part;
    const bare = part.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
    if (bare.length < 4) return part;
    const low = bare.toLowerCase();
    if (singles.includes(low) || SKIP.has(low)) return part;
    const near = singles.filter((h) => editDistance(low, h) === 1);
    if (near.length !== 1) return part;
    const swapped = near[0];
    const cased = bare[0] === bare[0].toUpperCase() ? swapped[0].toUpperCase() + swapped.slice(1) : swapped;
    return part.replace(bare, cased);
  }).join('');
}

/** Speech splits a day into two words. "sat today" is Saturday. "deck" is never a month. */
const DAY_JOINS: [RegExp, string][] = [
  [/\bsat\s+today\b/gi, 'Saturday'],
  [/\bsat\s+urday\b/gi, 'Saturday'],
  [/\bto\s+morrow\b/gi, 'tomorrow'],
];

export function mendHearing(text: string): string {
  let out = text;
  for (const [re, word] of DAY_JOINS) out = out.replace(re, word);
  return out;
}

/**
 * Pick the recognizer guess that best matches your phrases, then snap a one-letter miss.
 * The first guess stays when nothing else matches better.
 */
export function shapeHeard(alternatives: string[], hints: string[]): string {
  const list = alternatives.map((a) => a.trim()).filter(Boolean);
  if (!list.length) return '';
  let best = list[0];
  if (hints.length && list.length > 1) {
    let bestScore = score(best, hints);
    for (const alt of list.slice(1)) {
      const next = score(alt, hints);
      if (next > bestScore) {
        best = alt;
        bestScore = next;
      }
    }
  }
  return mendHearing(hints.length ? snapWords(best, hints) : best);
}
