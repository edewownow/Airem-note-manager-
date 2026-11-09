/**
 * Private search (1.10.1) — the ONLY way a question reaches the 🔒 Private folder.
 *
 * A question (typed or spoken in the main ask bar) that STARTS with a trigger — "password search
 * bank app", "private search wifi", "search my passwords for crew portal", "find password gmail" —
 * or (1.10.12) simply ASKS for an ID number or a password — "what's my SSS number?", "what's my
 * gmail password?", "password for netflix" —
 * is taken out of the normal query flow before anything else runs (`Assistant.ask`): it never
 * reaches `runQuery`, answers, Harbor or Gemini. The folder screen opens, asks for the phone's
 * lock, then shows the matches and says only their TITLES (never the note).
 *
 * Questions without a trigger never touch private items.
 *
 * OFFLINE ONLY: pure on-phone matching — no network, no Gemini, no Harbor, ever. No vault import
 * (invariant: only PrivateScreen opens the vault); matching runs inside the unlocked folder on the
 * records it hands in. (A SPOKEN question still goes through Android's voice typing, which usually
 * uses Google to turn speech into text — it hears the question, never the stored password.)
 */
import type { Rec } from '../types';
import { DOC_TITLES, PRIVATE_DOC_TYPE, docKind, type DocGroup } from './privateDocs';

const FILLER = /^(?:(?:ok(?:ay)?|hey|hi|oh|um+|uh+|so|please|can\s+you|could\s+you)[\s,]+)+/i;

// "password search …", "passwords lookup …", "private find …", "secret search …"
const NOUN_FIRST = /^(?:passwords?|private|secrets?)[\s-]+(?:search|find|look[\s-]?up|lookup)\b/i;
// "search my passwords for …", "find password …", "look up private …", "show my passwords"
const VERB_FIRST =
  /^(?:search|find|look[\s-]?up|lookup|show(?:\s+me)?|open)\s+(?:in\s+)?(?:my\s+|the\s+)?(?:passwords?|private(?:\s+folder)?|secrets?)\b/i;

/* ---------------- ID numbers (1.10.12) ---------------- */

/**
 * Philippine government IDs and crew documents — the words people say for them, and the title
 * the Private folder uses. Order matters only for display (the quick-add buttons use QUICK_IDS).
 */
export const ID_LABELS: { title: string; re: RegExp }[] = [
  { title: 'TIN', re: /\btin\b/i },
  { title: 'SSS', re: /\bsss\b/i },
  { title: 'SID', re: /\bsid\b|\bs[\s.]i[\s.]d\b/i },
  // voice.11 (device): the built-in listener writes "pill health" — P/F sound; + fill / feel / pil
  { title: 'PhilHealth', re: /\b(?:phil|fil|pil|pill|fill|feel)[\s-]?health\b/i },
  // 1.12.0-voice.8: + how the built-in listener (Parakeet, English-only) spells the Tagalog word —
  // "pug e-big", "pog e big", "porg e-big" (tested with sherpa-onnx + Parakeet TDT v2).
  { title: 'Pag-IBIG', re: /\bpag[\s-]?ibig\b|\bhdmf\b|\b(?:pag|pug|pog|porg|pack|puck)[\s-]?(?:e|ee|i)[\s-]?big\b/i },
  { title: 'Passport', re: /\bpassport\b/i },
  { title: 'UMID', re: /\bumid\b/i },
  { title: 'National ID', re: /\b(?:phil[\s-]?sys|phil[\s-]?id|national\s+id)\b/i },
  { title: "Driver's license", re: /\bdriver'?s?\s+licen[cs]e\b/i },
  { title: 'PRC license', re: /\bprc\b/i },
  // voice.8: + Parakeet's "semen book" / "Siemen book" for "seaman's book"
  { title: "Seaman's book", re: /\b(?:seam[ae]n|semen|siemen)'?s?\s+book\b|\bsirb\b/i },
  // voice.8 (device: an "SRB" note couldn't be found by asking) — Seaman's Record Book, kept as its
  // own title so notes already saved as "SRB" are found. Spaced / dotted letters count ("S R B").
  { title: 'SRB', re: /\bs[\s.,-]{0,3}r[\s.,-]{0,3}b\b\.?/i },
  // voice.28: a document in the Private folder's Documents section
  { title: 'Visa', re: /\bvisa\b/i },
];
/** The quick-add buttons in the Private folder's note prompt. */
export const QUICK_IDS = ['TIN', 'SSS', 'PhilHealth', 'Pag-IBIG', 'Passport'];

function idLabelAt(text: string): { title: string; index: number; length: number } | null {
  let best: { title: string; index: number; length: number } | null = null;
  for (const { title, re } of ID_LABELS) {
    const m = text.match(re);
    if (m && typeof m.index === 'number' && (!best || m.index < best.index)) best = { title, index: m.index, length: m[0].length };
  }
  return best;
}

// "what's my SSS number", "what is my TIN", "show my PhilHealth", "my passport number?"
const ASK_ID =
  /^(?:(?:what'?s|what\s+is|show(?:\s+me)?|find|get|give\s+me|tell\s+me|read)\s+)?(?:my\s+|the\s+)?(.+?)(?:\s+(?:number|no\.?|now|num|#|id(?:\s+number)?))?\s*[?.!]?$/i;

/**
 * "what's my SSS number?" asked in the ask bar → a Private search for "SSS" (1.10.12): an ID number
 * only lives in the Private folder, so the question goes there — after the fingerprint, titles only
 * are spoken. Only when the question is ABOUT the ID itself (the label is the whole subject).
 */
function askForId(t: string): string | null {
  const m = t.match(ASK_ID);
  if (!m) return null;
  const subject = m[1].trim();
  const id = idLabelAt(subject);
  if (!id) return null;
  // the label must be (nearly) the whole subject: "SSS" / "SSS number" / "Pag-IBIG MID" — not
  // "SSS contribution due date"
  const leftover = (subject.slice(0, id.index) + subject.slice(id.index + id.length))
    .replace(/\b(?:number|no|now|num|id|card|mid|account)\b\.?/gi, '')
    .replace(/[\s#.?]+/g, '');
  return leftover ? null : id.title;
}

// "what's my gmail password", "netflix password?", "show me the bank PIN", "my wifi login"
const ASK_PASS_AFTER =
  /^(?:(?:what'?s|what\s+is|what\s+was|show(?:\s+me)?|find|get|give\s+me|tell\s+me|read)\s+)?(?:my\s+|the\s+)?(.+?)\s+(?:passwords?|pass\s?codes?|pin(?:\s+(?:code|number))?|log\s?ins?)\s*\??$/i;
// "password for netflix", "what's the password for the crew wifi", "my PIN for the ATM"
const ASK_PASS_FOR =
  /^(?:(?:what'?s|what\s+is|what\s+was|show(?:\s+me)?|find|get|give\s+me|tell\s+me|read)\s+)?(?:my\s+|the\s+)?(?:passwords?|pass\s?codes?|pin(?:\s+(?:code|number))?|log\s?ins?)\s+(?:for|of|to)\s+(?:my\s+|the\s+)?(.+?)\s*\??$/i;

/**
 * A QUESTION about a password asked in the ask bar (1.10.12) → a Private search: "what's my gmail
 * password?" → "gmail". It's a question (no value said) — a sentence that GIVES a password ("the
 * wifi password is crew2026") is a save, handled by parsePrivateSave, not here.
 */
function askForPassword(t: string): string | null {
  // voice.25 (device: "save my pc pin no." opened a LOOKUP): a sentence that starts with "save" is a
  // save, never a question about a password
  if (SAVE_VERB.test(t.trim())) return null;
  if (/\b(?:is|are|was|:|=)\s+\S/i.test(t.replace(/^(?:what'?s|what\s+is|what\s+was)\s+/i, ''))) return null;
  const m = t.match(ASK_PASS_FOR) ?? t.match(ASK_PASS_AFTER);
  if (!m) return null;
  const subject = m[1].replace(/\b(?:my|the)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  // "change my password" / "reset password" are tasks, not lookups
  if (!subject || /\b(?:remind|change|reset|update|new|forgot|forget|remember|set|create|make|need|have|must|should|will|to)\b/i.test(subject)) return null;
  return subject;
}

/* ---------------- "when does my passport expire?" (voice.29) ---------------- */

const EXP = '(?:expire[sd]?|expiring|expiry(?:\\s+date)?|expiration(?:\\s+date)?|valid(?:ity)?(?:\\s+until)?|run(?:s|ning)?\\s+out)';
// "when does my passport expire", "when my passport expire", "is my passport expired",
// "when is my passport expiry date", "has my visa expired", "when will my SRB expire"
const EXP_A = new RegExp(
  // the question word is REQUIRED — "my passport expires in March" is a statement to save
  `^(?:when\\s+(?:does|do|did|will|is|was|has)?\\s*|(?:is|has|did|does|will)\\s+)(?:my|the)\\s+(.+?)\\s+(?:going\\s+to\\s+|gonna\\s+)?(?:be\\s+)?${EXP}\\b`,
  'i',
);
// "what's my passport expiry", "tell me my visa expiration date"
const EXP_B = new RegExp(`^(?:what'?s|what\\s+is|show(?:\\s+me)?|tell\\s+me|give\\s+me|check)\\s+(?:my|the)\\s+(.+?)\\s+${EXP}\\b`, 'i');
// "what's the expiry date of my passport", "when is the expiration of my seaman's book"
const EXP_C = new RegExp(
  `^(?:what'?s|what\\s+is|when\\s+is|when'?s|tell\\s+me|check)\\s+(?:the\\s+)?${EXP}\\s+(?:of|for|on)\\s+(?:my|the)\\s+(.+?)$`,
  'i',
);
// "which documents expire this year", "what documents are expiring", "any of my documents expired?"
const EXP_ALL = new RegExp(
  `^(?:(?:which|what|any|show(?:\\s+me)?|list|are\\s+any)\\s+(?:of\\s+)?)?(?:my\\s+)?(?:documents?|docs|ids|papers)\\b.*\\b(?:${EXP}|due)\\b`,
  'i',
);

export interface ExpiryAsk {
  term: string; // the document asked about ('' = all documents)
  all: boolean; // "which documents expire …"
  known: boolean; // a document name MemoAirem knows (Passport, Seaman's book, SRB …)
}

/**
 * voice.29 (user: "if user asks when my passport expires, can it query that" → "yes, expiry date
 * and titles are fine" to SAY). A question about a document's EXPIRY → the Private folder, which
 * says the title and the expiry date — never the number.
 */
export function parseExpiryAsk(question: string): ExpiryAsk | null {
  const t = question.trim().replace(FILLER, '').replace(/[?.!]+$/, '');
  if (EXP_ALL.test(t)) return { term: '', all: true, known: true };
  // "my passport expiring?" — with a question mark, the question word may be left out
  const asked = /\?\s*$/.test(question.trim());
  const m =
    t.match(EXP_A) ?? t.match(EXP_B) ?? t.match(EXP_C) ?? (asked ? t.match(new RegExp(`^(?:my|the)\\s+(.+?)\\s+${EXP}\\b`, 'i')) : null);
  if (!m) return null;
  const subject = m[1].replace(/\s+/g, ' ').trim();
  if (!subject || subject.split(' ').length > 5) return null;
  // "visa", "ID", "certificate" — the tag, not one title. "Canadian visa" and "BST" keep going.
  if (tagGroupOf(subject)) return { term: subject, all: false, known: true };
  const id = idLabelAt(subject);
  if (id) {
    // "visa" alone is every visa. "MCV visa" or "Canadian visa" names which one — the identifier stays.
    const extra = (subject.slice(0, id.index) + ' ' + subject.slice(id.index + id.length))
      .replace(/\b(?:number|no\.?|now|num|#|id|card|mid|account|my|the)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!extra) return { term: id.title, all: false, known: true };
    return { term: compactLetters(subject), all: false, known: true };
  }
  return { term: compactLetters(subject), all: false, known: false };
}

/** The search words after a trigger ('' = show everything), or null when there's no trigger. */
export function parsePrivateSearch(question: string): string | null {
  const t = question.trim().replace(FILLER, '');
  const id = askForId(t);
  if (id) return id;
  const pw = askForPassword(t);
  if (pw) return pw;
  const m = t.match(NOUN_FIRST) ?? t.match(VERB_FIRST);
  if (!m) return null;
  return t
    .slice(m[0].length)
    .replace(/^[\s,.:;-]+/, '')
    .replace(/^(?:for|of|about|on)\s+/i, '')
    .replace(/[?.!]+$/, '')
    .trim();
}

/** Words that don't help pick an item ("what's my password for the bank" → "bank"). */
const STOP = new Set([
  'what', 'whats', 'what’s', 'is', 'are', 'my', 'the', 'a', 'an', 'for', 'of', 'to', 'me', 'i',
  'show', 'find', 'please', 'password', 'passwords', 'pass', 'login', 'log', 'in', 'on', 'at',
]);

/** Lower-case, and drop the marks STT and people write differently ("Wi-Fi" = "wifi"). */
function norm(s: string): string {
  return compactLetters(s).toLowerCase().replace(/['’`-]/g, '').replace(/[^a-z0-9\s]/g, ' ');
}

export function searchTerms(query: string): string[] {
  return norm(query)
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
}

/**
 * Items matching the search words, best first. A word counts when a word in the item STARTS with
 * it ("bank" finds "Banking app"); a title hit counts double a username hit. The PASSWORD is never
 * searched (1.10.2) — a search word can't reveal which item holds a given secret. No words → all.
 * `titleOnly` (1.10.10, the folder's voice search): match the label ("what is it for") only.
 */
export function matchPrivate(items: Rec[], query: string, opts: { titleOnly?: boolean } = {}): Rec[] {
  const terms = searchTerms(query);
  if (!terms.length) return items;
  const scored = items
    .map((r) => {
      const title = norm(r.title ?? '').split(/\s+/);
      const user = norm(r.people ?? '').split(/\s+/); // username
      // 2.0.0-autofill.1: a password's website / app (rec.location) — typed search only, like the username
      const site = r.type === 'private' ? norm((r.location ?? '').replace(/\./g, ' ')).split(/\s+/) : [];
      let score = 0;
      for (const t of terms) {
        if (title.some((w) => w.startsWith(t))) score += 2;
        else if (!opts.titleOnly && (user.some((w) => w.startsWith(t)) || site.some((w) => w.startsWith(t)))) score += 1;
      }
      return { r, score };
    })
    .filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  if (scored.length) return scored.map((x) => x.r);
  // voice.10: letters misheard by one ("SRV" / "SRP" for SRB — B/V/P are easy to confuse). Only for
  // a single 3–5 letter term, against titles that are one word of the same length, one letter off.
  if (terms.length === 1 && /^[a-z]{3,5}$/.test(terms[0])) {
    const t = terms[0];
    return items.filter((r) => {
      const w = norm(r.title ?? '').trim();
      if (w.length !== t.length || /\s/.test(w)) return false;
      let diff = 0;
      for (let i = 0; i < t.length; i++) if (w[i] !== t[i]) diff++;
      return diff === 1;
    });
  }
  return [];
}

/** What the phone says — titles only, never a note: "Found Bank app. It's on the screen." */
const DOC_KIND = new Set(['visa', 'visas', 'passport', 'passports', 'license', 'licence', 'licenses', 'licences', 'id', 'ids', 'book', 'books', 'document', 'documents', 'card', 'cards']);

function titleWords(title: string): string[] {
  return norm(title).split(/\s+/).filter(Boolean);
}

function initialsOf(words: string[]): string {
  return words.map((w) => w[0] ?? '').join('');
}

/** "maritime crew visa" and "MCV visa" are the same document. A different visa is not. */
function sameAcronym(title: string[], terms: string[]): boolean {
  if (title.length < 1 || terms.length < 2) return false;
  const ti = initialsOf(title);
  const qi = initialsOf(terms);
  const hit = (terms.some((t) => t.length >= 2 && t.length <= 6 && t === ti) || title.some((w) => w.length >= 2 && w.length <= 6 && w === qi));
  if (!hit) return false;
  const tk = title.filter((w) => DOC_KIND.has(w));
  const qk = terms.filter((t) => DOC_KIND.has(t));
  if (tk.length && qk.length && !qk.every((q) => tk.some((t) => t.startsWith(q) || q.startsWith(t)))) return false;
  return true;
}

/**
 * voice.30: like matchPrivate, but when some titles contain EVERY word asked ("crew ID" → "Crew ID"),
 * only those — so "when does my crew ID expire" doesn't also answer with the company ID.
 * A visa keeps its identifier: a country, or a short name such as MCV (maritime crew visa).
 */
export function matchPrivateBest(items: Rec[], query: string): Rec[] {
  const found = matchPrivate(items, query, { titleOnly: true });
  const terms = searchTerms(query);
  if (terms.length < 2) return found;
  const full = found.filter((r) => {
    const words = titleWords(r.title ?? '');
    return terms.every((t) => words.some((w) => w.startsWith(t)));
  });
  if (full.length) return full;
  const byName = items.filter((r) => sameAcronym(titleWords(r.title ?? ''), terms));
  if (byName.length) return byName;
  // The shared word (visa, id, passport) is not enough when another word named which one.
  if (terms.some((t) => !DOC_KIND.has(t))) return [];
  return found;
}

/** A bare category word. "certificate" is Cert. "BST" and "Canadian visa" are names, so they are not. */
const TAG_GROUP: { group: DocGroup; re: RegExp }[] = [
  { group: 'visa', re: /^visas?$/i },
  { group: 'passport', re: /^passports?$/i },
  { group: 'id', re: /^(?:ids?|i\.?\s?d\.?s?|identification(?:\s+cards?)?)$/i },
  { group: 'training', re: /^(?:certs?|certificates?|training(?:\s+certificates?)?)$/i },
];

export function tagGroupOf(term: string): DocGroup | null {
  const t = term.trim().replace(/[?.!]+$/g, '').replace(/\s+/g, ' ');
  for (const g of TAG_GROUP) if (g.re.test(t)) return g.group;
  return null;
}

/**
 * Documents for an expiry question. A bare category uses the tag (and, for an older document
 * with no tag line, the title). A name still matches the title. "Which documents expire?" is everyone.
 */
export function docsForAsk(docs: Rec[], term: string, all = false): Rec[] {
  if (all) return docs;
  const group = tagGroupOf(term);
  if (!group) return matchPrivateBest(docs, term);
  return docs.filter((r) => r.type === PRIVATE_DOC_TYPE && docKind(r.title, r.notes) === group);
}

export function spokenPrivate(found: Rec[], query: string): string {
  const q = query.trim();
  if (!found.length) return q ? `Nothing in your private folder matches ${q}.` : 'Your private folder is empty.';
  const titles = found.slice(0, 3).map((r) => (r.title || 'Untitled').replace(/\s+/g, ' ').trim());
  if (found.length === 1) return `Found ${titles[0]}. It's on the screen.`;
  const more = found.length > 3 ? ` and ${found.length - 3} more` : '';
  const list = found.length > 3 ? titles.join(', ') : `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`;
  return `Found ${found.length}: ${list}${more}. They're on the screen.`;
}

/* ---------------- saying a password on the Voice tab (1.10.2) ---------------- */

/** "save this password …", "store my PIN …", "new password for …", "private note …" */
const SAVE_TRIGGER =
  /^(?:(?:save|store|keep|add|remember|put|record|note)\s+(?:down\s+)?(?:this|my|a|the|that|new)?\s*(?:passwords?|pass\s?codes?|passwd|pin(?:\s+(?:code|number))?|logins?|secrets?|private\s+note)\b|(?:new\s+)?(?:password|passcode)\s+(?=for\b|is\b|of\b)|private\s+(?:note|save)\b)/i;

/**
 * Safety net: a voice note that mentions a password / passcode / PIN anywhere ("the crew wifi
 * password is crew2026") is treated as private too — it must never be sent to Gemini, synced to
 * Harbor or read aloud just because the trigger wasn't said first.
 */
const SECRET_WORD = /\b(?:passwords?|pass\s?codes?|passwd|pin\s+(?:code|number|is)|my\s+pin\b|security\s+code|cvv)\b/i;

export interface PrivateDraft {
  kind: 'password' | 'note' | 'doc'; // 1.10.12: an ID number → NOTE; voice.28: a passport, seaman's book … → DOCUMENT
  title: string; // what it's for
  username: string;
  password: string;
  content: string; // note items: the ID number / text
  trigger: boolean; // true = "save this password …" said; false = caught by the safety net
}

/**
 * 1.13.0-voice.37 (user: "triggering the private folder without ID no. or pin or password, it does
 * not need to warn me"): did the spoken draft carry an actual SECRET — a password / PIN, or a number
 * / note text? Only then does the folder warn that Google's online recogniser heard it. A label
 * alone ("save my passport", "save my PC pin") is not a secret. The username isn't one either.
 */
export function draftHasSecret(d: { password?: string | null; content?: string | null }): boolean {
  return !!(d.password ?? '').trim() || !!(d.content ?? '').trim();
}

/**
 * An ID number said WITH its value → a private note draft: "my SSS number is 34-1234567-8",
 * "TIN 123-456-789-000", "passport number P1234567A". The label must be followed (after at most
 * "number / no / is / :") by a value with at least 5 digits — so "pay my SSS contribution on the
 * 10th" or "passport expires in March" stay ordinary notes.
 */
/** "save / store / keep / add / record / remember / put (down) (my|a|the|this|new)" before an ID. */
const SAVE_VERB = /^(?:save|store|keep|add|record|remember|put|new)\s+(?:down\s+)?(?:this\s+|my\s+|a\s+|the\s+|new\s+)?/i;
/** Words that only say "the number of" — "id", "no.", "number", "#", "card", "MID". */
// voice.8: + "now" — the built-in listener often writes "no." as "now" ("Save my SRB now.")
const NUMBER_WORDS = /^\s*(?:(?:number|no\.?|now|num|#|id|card|mid|account)\s*){0,3}[.?!]*\s*$/i;

function idNoteDraft(text0: string, trigger: boolean): PrivateDraft | null {
  const saveSaid = SAVE_VERB.test(text0.trim());
  const text = text0.trim().replace(SAVE_VERB, '').replace(/^(?:this\s+|my\s+|the\s+)/i, '');
  const id = idLabelAt(text);
  if (!id) return null;
  const after = text.slice(id.index + id.length);
  // 1.10.14: "save my Pag-IBIG ID no." / "save my passport no." — asked to SAVE, number not said yet:
  // open the note prompt with the title filled in; you type the number there. Only when nothing but
  // number-words follow the ID ("save the SSS contribution receipt" stays an ordinary note), and
  // the ID is the subject (it starts the text after the save words).
  if (saveSaid && id.index === 0 && NUMBER_WORDS.test(after)) {
    return { kind: docOrNote(id.title), title: id.title, username: '', password: '', content: '', trigger: true };
  }
  const v = after.match(/^\s*(?:(?:number|no\.?|num|#|id|card|mid|account)\s*){0,2}(?:\bis\b|:|=|-)?\s*(.+)$/i);
  if (!v) return null;
  const value = v[1].replace(/[\s.,;]+$/, '').trim();
  const digits = (value.match(/\d/g) || []).length;
  if (digits < 5 || !/^[A-Za-z]{0,2}\s*\d/.test(value)) return null;
  return { kind: docOrNote(id.title), title: id.title, username: '', password: '', content: value, trigger };
}

/** voice.28: passports, seaman's books, SRB, licences, visas … open the DOCUMENT form (the number in
 *  its No. box). voice.31: SSS / TIN / PhilHealth / Pag-IBIG too — every ID is a document. */
function docOrNote(title: string): 'doc' | 'note' {
  return DOC_TITLES.has(title) ? 'doc' : 'note';
}

function tidyTitle(s: string): string {
  const t = s
    .replace(/\b(?:my|the|this|a|an)\b/gi, ' ')
    .replace(/\b(?:passwords?|pass\s?codes?|passwd|pin(?:\s+(?:code|number))?|login|account)\b/gi, ' ')
    .replace(/^\s*(?:for|of|to)\s+/i, '')
    .replace(/\s+(?:and|with)\s*$/i, '')
    .replace(/[\s,.;:-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

/** Spoken e-mail → typed: "ede dot v at gmail dot com" → "ede.v@gmail.com" (username only). */
function spokenEmail(s: string): string {
  if (!/\bat\b/i.test(s) || !/\bdot\b/i.test(s)) return s.trim();
  return s
    .replace(/\s+at\s+/gi, '@')
    .replace(/\s+dot\s+/gi, '.')
    .replace(/\s+underscore\s+/gi, '_')
    .replace(/\s+(?:dash|hyphen)\s+/gi, '-')
    .replace(/\s+/g, '')
    .toLowerCase();
}

const USER_RE =
  /\b(?:user\s?name|user\s?id|user|login(?:\s+id)?|e-?mail)\s*(?:is\b|:|=)?\s*(.+?)(?=\s*,?\s+(?:and\s+)?(?:the\s+)?(?:passwords?|pass\s?codes?|passwd|pin)\b|$)/i;
const PASS_RE = /\b(?:passwords?|pass\s?codes?|passwd|pin(?:\s+(?:code|number))?)\s*(?:is\b|:|=)?\s*(.+)$/i;

/**
 * 1.10.15 — the user's rule: "save" + the NAME of any card / ID + "number" / "no." at the end is a
 * private save, even for names MemoAirem doesn't know: "save my bank card no.", "save my crew ID
 * number", "save my BDO account number 1234-5678". The number may follow; nothing else may (so
 * "save the room number 8012 for the guest" stays ordinary). The name becomes the title.
 */
const CARD_SAVE =
  /^(?:save|store|keep|add|record|remember|put)\s+(?:down\s+)?(?:my\s+|the\s+|a\s+|this\s+|new\s+)?([A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*){0,3}?)\s+(?:number|no\.?|now|num|#)\s*(?:[:=-]\s*)?([A-Za-z]{0,3}\s?\d[\d\s-]*[A-Za-z]?)?[.?!]*$/i;

/**
 * Letters said one by one come out spaced or dotted — "S R B", "S.R.B.", "sRB" → "SRB" (voice.8).
 * Short all-letter words with a capital after the first letter are upper-cased ("sRB" → "SRB").
 */
export function compactLetters(s: string): string {
  return s
    .replace(/\b(?:[A-Za-z]\.\s?){2,6}/g, (m) => m.replace(/[\s.]/g, '').toUpperCase() + ' ')
    .replace(/\b(?:[A-Z](?:\s|-|,\s?)){1,5}[A-Z]\b/g, (m) => m.replace(/[\s,-]/g, ''))
    .replace(/\s+$/, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\b[a-z][A-Z]{1,3}\b/g, (w) => w.toUpperCase());
}

/**
 * "what is my <any name> number / no. / ID" (voice.8) → that name, for ANY card — "what's my SRB no.",
 * "what is my crew ID number", "my BDO account number?". The Assistant uses this only when your
 * normal records have nothing for the question, so "what is my room number" still finds a normal note.
 */
const ASK_ANY_CARD =
  /^(?:(?:what'?s|what\s+is|what\s+was|show(?:\s+me)?|find|get|give\s+me|tell\s+me|read)\s+)?(?:my|the)\s+([A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*){0,3}?)\s+(?:number|no\.?|now|num|#|id(?:\s+number)?)\s*[?.!]*$/i;
export function askForAnyCard(question: string): string | null {
  const m = question.trim().replace(FILLER, '').match(ASK_ANY_CARD);
  if (!m) return null;
  const name = compactLetters(m[1].replace(/\s+/g, ' ').trim());
  return name || null;
}

/**
 * "what is my S R V" / "what's my S-R-B" — a question whose subject is ONLY spelled letters (voice.10;
 * device: "what is my S R B" listed the whole week). Letters aren't search words, so the normal
 * search had nothing left and showed everything. Returns the letters joined ("SRV"); the Assistant
 * then asks the Private folder (after checking normal records for that name).
 */
const ASK_LETTERS =
  /^(?:(?:what'?s|what\s+is|what\s+was|show(?:\s+me)?|find|get|give\s+me|tell\s+me|read)\s+)?(?:my|the)\s+((?:[A-Za-z][\s.,-]{0,3}){2,6})(?:\s+(?:number|no\.?|now|num|#|id))?\s*[?.!]*$/i;
export function askForLetters(question: string): string | null {
  const m = question.trim().replace(FILLER, '').match(ASK_LETTERS);
  if (!m) return null;
  const raw = m[1].trim();
  // spelled letters: single letters separated by space / dot / hyphen / comma ("S R V", "S-R-B")
  // …or one short ALL-CAPS word, the way the listener writes initials ("SRV", "SRB")
  if (!/^[A-Za-z](?:[\s.,-]+[A-Za-z]){1,5}[.]?$/.test(raw) && !/^[A-Z]{2,5}\.?$/.test(raw)) return null;
  return raw.replace(/[^A-Za-z]/g, '').toUpperCase();
}

/**
 * voice.12 (device: "it gives a better result if we add ID at the end, like PhilHealth ID") — "save my
 * <name> ID" with no "number": "save my crew ID", "save my company ID 4521". The name + " ID" is the
 * title. Same rule as CARD_SAVE: the value may follow, nothing else.
 */
const CARD_SAVE_ID =
  /^(?:save|store|keep|add|record|remember|put)\s+(?:down\s+)?(?:my\s+|the\s+|a\s+|this\s+|new\s+)?([A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*){0,3}?)\s+id\s*(?:[:=-]\s*)?([A-Za-z]{0,3}\s?\d[\d\s-]*[A-Za-z]?)?[.?!]*$/i;

/**
 * voice.26 — the user's rule: "save my + label should trigger private folder note creation with the
 * label already filled" — "save my SRB", "save my locker code", "save my wifi", "save my locker code
 * 1234". Any label (1–5 words) after "save / store / keep my"; a value with a digit may follow. Runs
 * after the ID / card / named-secret rules, so those keep their own titles.
 */
const SAVE_MY_LABEL =
  /^(?:save|store|keep)\s+(?:down\s+)?my\s+([A-Za-z][A-Za-z0-9'’.-]*(?:\s+[A-Za-z0-9][A-Za-z0-9'’.-]*){0,4}?)(?:\s*(?:\bis\b|:|=|-)?\s*([A-Za-z]{0,3}\s?\d[\d\s-]*[A-Za-z]?))?[.?!]*$/i;

function myLabelDraft(text: string): PrivateDraft | null {
  const m = text.trim().match(SAVE_MY_LABEL);
  if (!m) return null;
  let title = compactLetters(m[1].replace(/\s+/g, ' ').trim()).replace(/[.?!,]+$/, '');
  if (!title) return null;
  if (/^[a-z]{2,3}$/.test(title)) title = title.toUpperCase();
  title = title[0].toUpperCase() + title.slice(1);
  return { kind: 'note', title, username: '', password: '', content: (m[2] || '').trim(), trigger: true };
}

function cardNoteDraft(text: string): PrivateDraft | null {
  let m = text.trim().match(CARD_SAVE);
  if (!m) {
    const i = text.trim().match(CARD_SAVE_ID);
    if (i) m = Object.assign([i[0], i[1] + ' ID', i[2]], { index: 0, input: i.input }) as unknown as RegExpMatchArray;
  }
  if (!m) return null;
  const name = compactLetters(
    m[1]
      .replace(/\b(?:my|the|a|this)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
  if (!name) return null;
  const title = name
    .split(' ')
    .map((w, i) => (/^id$/i.test(w) ? 'ID' : i === 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
  const value = (m[2] || '').trim();
  // voice.31 (user: "let's make it tidy" — all IDs are documents): "save my <card> number / no. / ID"
  return { kind: 'doc', title, username: '', password: '', content: value, trigger: true };
}

/**
 * A voice transcript that holds a password → the draft for the Private folder's prompt (what it's
 * for / username / password), or null for an ordinary voice note. Picks out "username …" and
 * "password …" when said; otherwise splits "<what> is <secret>"; otherwise the remainder goes in
 * the password box. Anything it can't place, you fix in the prompt before saving.
 */
/**
 * voice.25 — "save my PC pin", "save my PC PIN no.", "save my laptop password", "save the ATM pin
 * 1234": a NAMED secret → the PASSWORD prompt (hidden behind the fingerprint), titled with the name
 * ("PC"). Before the card rule, which would have made "PC PIN" a visible note.
 */
const SAVE_NAMED_SECRET =
  /^(?:save|store|keep|add|record|remember|put)\s+(?:down\s+)?(?:my\s+|the\s+|a\s+|this\s+|new\s+)?([A-Za-z0-9][A-Za-z0-9'’.-]*(?:\s+[A-Za-z0-9][A-Za-z0-9'’.-]*){0,3}?)\s+(?:passwords?|pass\s?codes?|passwd|pin(?:\s+code)?|logins?)(?:\s+(?:now|number|num|no)\b\.?)?\s*(?:(?:is|:|=)\s*)?(\S+)?[.?!]*$/i;

function namedSecretDraft(text: string): PrivateDraft | null {
  const m = text.trim().match(SAVE_NAMED_SECRET);
  if (!m) return null;
  let title = compactLetters(m[1].replace(/\b(?:my|the|a|this|for)\b/gi, ' ').replace(/\s+/g, ' ').trim());
  if (!title) return null;
  if (/^[a-z]{2,3}$/.test(title)) title = title.toUpperCase(); // "pc" / "atm" said lower-case → PC / ATM
  const value = (m[2] || '').replace(/[.?!,]+$/, '');
  return {
    kind: 'password',
    title: title[0].toUpperCase() + title.slice(1),
    username: '',
    password: value,
    content: '',
    trigger: true,
  };
}

export function parsePrivateSave(transcript: string): PrivateDraft | null {
  const text = transcript.trim().replace(FILLER, '');
  // "save my PC pin (no.)" / "save my laptop password" — a named secret → the password prompt
  const named = namedSecretDraft(text);
  if (named) return named;
  const m = text.match(SAVE_TRIGGER);
  // "private note …" → the NOTE prompt with everything said as its text (1.10.12)
  if (m && /private\s+(?:note|save)/i.test(m[0])) {
    const body = text.slice(m[0].length).replace(/^[\s,.:;-]+/, '').trim();
    const id = idNoteDraft(body, true);
    // "private note …" says NOTE — it stays one even when it names an ID
    return id ? { ...id, kind: 'note', content: id.content } : { kind: 'note', title: '', username: '', password: '', content: body, trigger: true };
  }
  // an ID number with its value — before the password rules ("my SSS number is …")
  if (!m || !/pass|pin|login|secret/i.test(m[0])) {
    const id = idNoteDraft(m ? text.slice(m[0].length) : text, !!m);
    if (id) return id;
    // "save my <any card name> number / no." (1.10.15)
    const card = m ? null : cardNoteDraft(text);
    if (card) return card;
    // "save my <any label>" (voice.26) → a Private note with the label filled in
    const mine = m ? null : myLabelDraft(text);
    if (mine) return mine;
  }
  if (!m && !holdsSecret(text)) return null;
  let rest = (m ? text.slice(m[0].length) : text).replace(/^[\s,.:;-]+/, '').trim();
  const fallback = defaultTitle(text);

  let username = '';
  const u = rest.match(USER_RE);
  if (u && typeof u.index === 'number' && u[1].trim()) {
    username = spokenEmail(u[1].replace(/[\s,.;]+$/, ''));
    rest = (rest.slice(0, u.index) + ' ' + rest.slice(u.index + u[0].length)).replace(/\s+/g, ' ').trim();
  }
  let password = '';
  const p = rest.match(PASS_RE);
  if (p && typeof p.index === 'number' && p[1].trim()) {
    password = p[1].trim();
    rest = rest.slice(0, p.index).trim();
  }
  if (!password) {
    // "<for> bank app is 1234" / "wifi: crew2026"
    const split = rest.match(/^(.*?)\s*(?:\bis\b|=|:)\s*(.+)$/i);
    if (split && split[2].trim()) {
      password = split[2].trim();
      rest = split[1];
    } else if (/^for\s+\S/i.test(rest)) {
      // "save this password for netflix" — what it's for, no password said: you type it in the prompt
    } else if (/^(\S*\d\S*)\s+for\s+(.+)$/i.test(rest)) {
      // "9981 for the safe" — the value first, then what it's for
      const v = rest.match(/^(\S*\d\S*)\s+for\s+(.+)$/i)!;
      password = v[1];
      rest = v[2];
    } else if (!username) {
      password = rest; // can't tell — it all goes in the password box, title stays generic
      rest = '';
    }
  }
  return { kind: 'password', title: tidyTitle(rest) || fallback, username, password, content: '', trigger: !!m };
}

/**
 * The safety net fires only when a VALUE is said with the secret word — "… password is crew2026",
 * "PIN: 4471", or digits. "Remind me to change my password" mentions one but holds none, so it stays
 * an ordinary reminder.
 */
/**
 * 2.0.0 build 99 (user: "take note, the WIFI password is printed on the bulletin board" opened the
 * Private folder): what comes after "is" says WHERE the password is or what happened to it — not the
 * password itself. "printed on the board", "on the fridge", "the same as last year", "changed".
 */
const NOT_A_VALUE =
  /^\s*(?:\bis\b|\bwas\b|[:=])\s*(?:(?:also|still|now|just|already)\s+)?(?:printed|written|posted|pinned|taped|stuck|shown|displayed|listed|kept|stored|saved|hidden|on|in|at|inside|under|behind|beside|near|next\s+to|by|from|with|available|given|sent|emailed|texted|shared|the\s+same|same|changed|expired|reset|wrong|incorrect|not|no\s+longer|unknown|missing|lost|forgotten|case\s+sensitive|too\s+(?:long|short|weak)|weak|strong|easy|hard|new|old)\b/i;

function holdsSecret(text: string): boolean {
  const w = text.match(SECRET_WORD);
  if (!w || typeof w.index !== 'number') return false;
  const after = text.slice(w.index + w[0].length);
  if (NOT_A_VALUE.test(after)) return false;
  return /^\s*(?:\bis\b|\bwas\b|[:=])/i.test(after) || /\bis\s+\S/i.test(after) || /\d/.test(text) || /^\s*is\b/i.test(w[0]);
}

/**
 * A title that never holds the secret (titles are spoken by password search): "PIN" for a PIN,
 * "Security code", otherwise "Password".
 */
function defaultTitle(text: string): string {
  if (/\bpin\b/i.test(text)) return 'PIN';
  if (/\b(?:security\s+code|cvv)\b/i.test(text)) return 'Security code';
  if (/\bpass\s?codes?\b/i.test(text)) return 'Passcode';
  return 'Password';
}
