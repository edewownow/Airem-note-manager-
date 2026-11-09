/**
 * Categories — group records with #tags (variant experiment).
 *
 * The tag lives in the record's own text ("Muster drill #ship safety"), so:
 * - a record gains a category just by adding the tag (old records included),
 * - the Harbor copy carries it as plain text (Harbor records have no category field),
 * - there is no migration and no new field on the record.
 *
 * By voice the user says "hashtag ship safety" — speech-to-text hears the word
 * "hashtag", which reads the same as "#". A bare tag ("#ship safety") selects
 * the category; a tag inside a question scopes that question to it; no tag
 * means the general search, exactly as before.
 *
 * The selected category is session-only (like followUp.ts) and deselects itself
 * after a few minutes with no questions asked, so it can never silently narrow
 * a question tomorrow. Categories can be switched off in Settings.
 */
import type { Rec } from '../types';
import { KEYS, persist } from './persist';
import { oneSlip, prepareWord, wordInExactP, wordInLooseP } from './synonyms';

/** A category deselects itself after this long with no questions asked. */
export const CATEGORY_TIMEOUT_MS = 5 * 60 * 1000;

/** The distinct color #tags and category labels render in (see TagText). */
export const TAG_COLOR = '#2279F1';

/* ---------------- settings ---------------- */

/** Categories on/off (Settings). Default on when never set. */
export function categoriesEnabled(): boolean {
  return persist.getString(KEYS.categoriesOn) !== '0';
}
export function setCategoriesEnabled(on: boolean): void {
  persist.set(KEYS.categoriesOn, on ? '1' : '0');
}

/* ---------------- tags in text ---------------- */

/** Lowercase, single spaces, no leading '#'. "Ship  Safety" → "ship safety". */
export function normalizeTag(name: string): string {
  return name.replace(/^#\s*/, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** "hashtag ship safety" (what speech-to-text hears) reads the same as "#ship safety". */
export function normalizeHashtags(text: string): string {
  return text.replace(/\bhashtag\s+#?/gi, '#');
}

// Words that end a tag. A tag is a short noun phrase ("ship safety"); a word
// from this list almost always starts the rest of the sentence ("#ship safety
// at 9am" → "ship safety"), never the category itself.
const TAG_STOP = new Set([
  'at', 'on', 'in', 'for', 'to', 'with', 'and', 'or', 'by', 'from', 'of', 'the', 'a', 'an',
  'is', 'are', 'was', 'were', 'when', 'where', 'who', 'after', 'before', 'until', 'about',
  'near', 'called', 'as', 'it', 'its', 'this', 'that', 'please', 'now',
]);

/**
 * The tag's words out of a raw run after '#', in the user's own casing:
 * at most 3 words, stopping at the first stop-word. "ship safety at 9am" →
 * ["ship", "safety"]; "ship safety and #fire drill" → ["ship", "safety"].
 * Punctuation is stripped from each word ("safety," → "safety"), and a time
 * stops the run too — "#ship safety 9am" is the "ship safety" category at
 * 9am, not a "ship safety 9am" category. A bare number is not a time, so
 * "deck 3" keeps its number; "9 am" (two words) drops the 9 with the am.
 */
export function tagWords(raw: string): string[] {
  const toks = raw.trim().split(/\s+/);
  const words: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    const clean = toks[i].replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
    if (!clean) continue;
    const low = clean.toLowerCase();
    if (/^\d{1,2}:\d{2}(am|pm)?$/.test(low) || /^\d{1,2}(am|pm)$/.test(low)) break;
    if (low === 'am' || low === 'pm') {
      if (words.length && /^\d{1,2}$/.test(words[words.length - 1])) words.pop();
      break;
    }
    if (TAG_STOP.has(low)) break;
    words.push(clean);
    if (words.length >= 3) {
      // The 3-word cap — but a following "am"/"pm" still undoes a trailing
      // hour ("ship safety 9 am" is the "ship safety" tag, not "ship safety 9").
      const next = toks[i + 1]?.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').toLowerCase();
      if ((next === 'am' || next === 'pm') && /^\d{1,2}$/.test(words[words.length - 1])) words.pop();
      break;
    }
  }
  return words;
}

// A tag is '#' + a word run, ending at punctuation, another '#', or the end of
// the text. The group is non-greedy to the first terminator; tagWords() then
// cuts it at stop-words, so a mid-sentence tag does not swallow the sentence.
// '#' may follow opening punctuation ("(#ship safety)") but not a word
// character — C# and a#b are still not tags. Closing punctuation also ends a
// tag, so "(#ship safety)" stops at the ')' instead of running to the end.
// A ':' ends a tag unless a digit follows it — "14:00" is one time token,
// and the group must be allowed through the ':' for tagWords() to see it.
const TAG_RE = /(?:^|[\s([{"'])#\s*([A-Za-z0-9][A-Za-z0-9 \-'’:]*?)(?=\s*(?:[.,;!?#\n)\]}]|:(?!\d))|\s*$)/g;

/** Every #tag in the text, normalized and deduplicated, in order. */
export function extractTags(text: string): string[] {
  const out: string[] = [];
  const src = normalizeHashtags(text);
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(src))) {
    const name = normalizeTag(tagWords(m[1]).join(' '));
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** The categories a record belongs to — the #tags in its title and notes. */
export function recordTags(rec: Rec): string[] {
  // Parsed separately: joining title + notes first would let a tag at the end
  // of the title swallow the first words of the notes ("Drill #ship" +
  // "safety briefing" is the "ship" category, not "ship safety briefing").
  const out = extractTags(rec.title || '');
  for (const t of extractTags(rec.notes || '')) if (!out.includes(t)) out.push(t);
  return out;
}

/** Every category in use across the saved records, in first-seen order. */
export function allCategories(saved: Rec[]): string[] {
  const out: string[] = [];
  for (const rec of saved) {
    for (const t of recordTags(rec)) if (!out.includes(t)) out.push(t);
  }
  return out;
}

/**
 * Split text into plain and #tag segments, for rendering tags in a distinct
 * style (TagText). The tag segments agree with extractTags() — same word rules,
 * same stop-words. A '#' mid-word (C#, a#b) is not a tag; the spoken word
 * "hashtag" marks one too, since saved voice notes carry it as words.
 */
export function splitTags(text: string): { text: string; tag: boolean }[] {
  const segs: { text: string; tag: boolean }[] = [];
  let last = 0;
  let i = 0;
  while (i < text.length) {
    // Next '#' or spoken "hashtag" after i.
    const hash = text.indexOf('#', i);
    const hm = /\bhashtag\s+/i.exec(text.slice(i));
    const hpos = hm ? i + hm.index : -1;
    let start = -1;
    let startLen = 1; // characters the marker itself takes ('#' or 'hashtag ')
    if (hash !== -1 && (hpos === -1 || hash < hpos)) {
      start = hash;
      startLen = 1;
    } else if (hpos !== -1) {
      start = hpos;
      startLen = hm![0].length;
    }
    if (start === -1) break;
    if (start > 0 && !/[\s([{"']/.test(text[start - 1])) {
      i = start + startLen;
      continue; // mid-word — not a tag (C#, a#b)
    }
    // Collect the tag's words from the text after the marker. The regex is
    // sticky and the separator is spaces/tabs only, so the run stops at the
    // next '#' (a second tag), punctuation, or a line break — an unanchored
    // search scanned past those and swallowed the next tag's words
    // ("#ship safety #fire drill" rendered as one tag "#ship safety #fire").
    // The word "hashtag" itself ends a run too (it starts the next tag).
    const wordRe = /[ \t]*([A-Za-z0-9][A-Za-z0-9\-'’]*)/gy;
    wordRe.lastIndex = start + startLen;
    const words: string[] = [];
    const ends: number[] = [];
    let wm: RegExpExecArray | null;
    while (words.length < 3 && (wm = wordRe.exec(text))) {
      const low = wm[1].toLowerCase();
      if (low === 'hashtag') break;
      if (TAG_STOP.has(low)) break;
      if (/^\d{1,2}:\d{2}(am|pm)?$/.test(low) || /^\d{1,2}(am|pm)$/.test(low)) break;
      if (low === 'am' || low === 'pm') {
        // "9 am": the 9 was the hour, not part of the tag.
        if (words.length && /^\d{1,2}$/.test(words[words.length - 1])) {
          words.pop();
          ends.pop();
        }
        break;
      }
      words.push(wm[1]);
      ends.push(wordRe.lastIndex);
    }
    // A trailing hour ("14" in "14:00") is the time, not the tag.
    if (words.length && /^\d{1,2}$/.test(words[words.length - 1]) && /^:\d/.test(text.slice(ends[ends.length - 1]))) {
      words.pop();
      ends.pop();
    }
    // "9 am": the 9 was the hour, not the tag — the 3-word cap stopped the
    // loop before the "am" was seen, so check for it here.
    if (words.length && /^\d{1,2}$/.test(words[words.length - 1]) && /^[ \t]+(am|pm)\b/i.test(text.slice(ends[ends.length - 1]))) {
      words.pop();
      ends.pop();
    }
    const end = ends.length ? ends[ends.length - 1] : start + startLen;
    if (!words.length) {
      i = start + startLen;
      continue;
    }
    if (start > last) segs.push({ text: text.slice(last, start), tag: false });
    segs.push({ text: text.slice(start, end), tag: true });
    last = end;
    i = end;
  }
  if (last < text.length) segs.push({ text: text.slice(last), tag: false });
  return segs.filter((s) => s.text.length > 0);
}

/** Remove every #tag (and spoken "hashtag …") from the text, leaving the rest. */
export function stripTags(text: string): string {
  return splitTags(text)
    .filter((s) => !s.tag)
    .map((s) => s.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Does this text already carry the tag? */
export function hasTagText(text: string, category: string): boolean {
  return extractTags(text).includes(normalizeTag(category));
}

/** Append " #category" to the text, unless it is already tagged. */
export function addTagToText(text: string, category: string): string {
  const name = normalizeTag(category);
  if (!name || hasTagText(text, name)) return text;
  const tag = `#${name}`;
  return text ? `${text.trimEnd()} ${tag}` : tag;
}

/* ---------------- matching a spoken category name ---------------- */

/**
 * The category a spoken name means, from the ones in use. Exact first; then a
 * misheard name ("ship safty") still finds the closest one when every word
 * matches a word of it, exactly or loosely — but a single loose word alone is
 * a guess too far, so it returns null and the caller says the category is new.
 * The word counts must match: "ship" is a different category from "ship
 * safety", not a short way of saying it — otherwise a short name could never
 * be selected while a longer one exists. Every word must match something: a
 * name that is half right ("ship xyz") matches nothing, it does not resolve
 * on its one good word.
 */
export function findCategory(spoken: string, known: string[]): string | null {
  const want = normalizeTag(spoken);
  if (!want) return null;
  if (known.includes(want)) return want;
  const words = want.split(' ');
  let best: string | null = null;
  let bestScore = 0;
  for (const k of known) {
    const parts = k.split(' ');
    if (parts.length !== words.length) continue;
    let s = 0;
    let allScored = true;
    for (const w of words) {
      const p = prepareWord(w);
      if (parts.some((part) => wordInExactP(part, p))) s += 2;
      else if (parts.some((part) => wordInLooseP([part], p))) s += 1;
      // A one-letter typo still counts ("safty" is "safety" missing an e) —
      // the loose pass itself refuses short words, so the check is made here.
      else if (parts.some((part) => oneSlip(w, part))) s += 1;
      else allScored = false;
    }
    if (allScored && s > bestScore) {
      bestScore = s;
      best = k;
    }
  }
  return best;
}

/**
 * The category a tag name means: the longest leading part that is a known
 * category, so a trailing word ("tomorrow", "notes") never invents a phantom
 * category while the real one exists — "#ship safety tomorrow" selects "ship
 * safety". Unknown names stay whole, so a genuinely new category still forms.
 */
export function resolveTag(name: string, known: string[]): string {
  const clean = normalizeTag(name);
  if (!clean) return clean;
  const words = clean.split(' ');
  for (let n = words.length; n > 0; n--) {
    const hit = findCategory(words.slice(0, n).join(' '), known);
    if (hit) return hit;
  }
  return clean;
}

/* ---------------- the active category (session-only) ---------------- */

interface ActiveCategory {
  name: string;
  /** When it was last used — a question refreshes it, silence lets it expire. */
  at: number;
}

let active: ActiveCategory | null = null;

/** The selected category, or null when none is selected or it has expired. */
export function getActiveCategory(now: number = Date.now()): string | null {
  if (!active) return null;
  if (now - active.at > CATEGORY_TIMEOUT_MS) {
    active = null;
    return null;
  }
  return active.name;
}

/** Select a category (normalizing its name). Returns the name it was stored as. */
export function setActiveCategory(name: string, now: number = Date.now()): string {
  const clean = normalizeTag(name);
  active = { name: clean, at: now };
  return clean;
}

/** Clear the selected category (voice "clear category", or the chip's ×). */
export function clearActiveCategory(): void {
  active = null;
}

/** A question was asked — the category stays selected a little longer. */
export function touchActiveCategory(now: number = Date.now()): void {
  if (active) active.at = now;
}

/* ---------------- voice commands ---------------- */

export type CategoryCommand =
  | { kind: 'select'; name: string }
  | { kind: 'clear' }
  | { kind: 'list' }
  | { kind: 'categorize'; name: string };

const CLEAR_RE = /^(?:clear|deselect|remove|exit|drop)(?:\s+the)?\s+categor(?:y|ies)(?:\s+please)?\s*[?.!]?$/i;
const LIST_RE =
  /^(?:list|show|what(?:'s| are)?)(?:\s+(?:me\s+)?(?:all|my|the)\s+)?\s*categor(?:y|ies)(?:\s+please)?\s*[?.!]?$/i;
// "show me the ship safety category" — a select, not the list. (The list
// pattern above matches "show me the categories" first.)
const SHOW_CATEGORY_RE = /^show(?:\s+me)?\s+(?:the\s+)?(.+?)\s+categor(?:y|ies)(?:\s+please)?\s*[?.!]?$/i;
// "categorize this as ship safety" / "put this in ship safety" — "this" is
// required, so a save that starts with "tag" ("tag the bags…") is not mistaken
// for it. "categorize ship safety category" works without "this".
const CATEGORIZE_RE =
  /^(?:categorize|categorise|tag|put)\s+this(?:\s+as|\s+in|\s+under)?\s+(?:the\s+)?(.+?)(?:\s+categor(?:y|ies))?\s*[?.!]?$/i;
const CATEGORIZE_NAMED_RE =
  /^(?:categorize|categorise)\s+(?:the\s+)?(.+?)\s+categor(?:y|ies)\s*[?.!]?$/i;

/**
 * A category command in the user's words, or null when the text is a normal
 * question or save. A bare tag selects; "clear category" clears; "list
 * categories" lists; "categorize this as ship safety" tags the record on screen.
 */
export function parseCategoryCommand(q: string): CategoryCommand | null {
  const t = normalizeHashtags(q.trim());
  if (CLEAR_RE.test(t)) return { kind: 'clear' };
  if (LIST_RE.test(t)) return { kind: 'list' };
  const shown = SHOW_CATEGORY_RE.exec(t);
  if (shown) {
    const name = normalizeTag(tagWords(shown[1]).join(' '));
    if (name) return { kind: 'select', name };
  }
  const cat = CATEGORIZE_RE.exec(t) || CATEGORIZE_NAMED_RE.exec(t);
  if (cat) {
    const name = normalizeTag(tagWords(cat[1]).join(' '));
    if (name) return { kind: 'categorize', name };
  }
  // A bare tag — "#ship safety" (optionally followed by the word "category").
  // Only when the utterance IS the tag: a note that merely starts with one
  // ("#ship safety drill at 9am") is a note to save, not a select command —
  // anything left after removing the tag means it is not bare.
  const bare = /^#\s*(.+?)(?:\s+categor(?:y|ies))?\s*[?.!]?$/.exec(t);
  if (bare) {
    const name = normalizeTag(tagWords(bare[1]).join(' '));
    const rest = stripTags(t)
      .replace(/\bcategor(?:y|ies)\b/gi, '')
      .replace(/\bplease\b/gi, '')
      .replace(/[?.!]+/g, '')
      .trim();
    if (name && !rest) return { kind: 'select', name };
  }
  return null;
}
