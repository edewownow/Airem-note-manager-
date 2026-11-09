/**
 * Private DOCUMENTS (1.12.0-voice.28) — passports, seaman's books, SRB, visas, licences … in the 🔒
 * Private folder, with the user's fields: Document name · No. · Date issued · Date expired · Place
 * of issue · Notes (+ the folder's optional photo).
 *
 * The record shape is FIXED (src/types.ts), so a document maps onto it:
 *   type = 'private-doc' · title = name · people = No. · date = date EXPIRED (ISO — so the list
 *   sorts by expiry) · location = place of issue · notes = "Issued: YYYY-MM-DD" on the first line
 *   (when given), then the free notes. time / via / imageId / thumb as for every private item.
 *
 * Expiry is shown INSIDE the Private folder only (user's choice) — nothing leaves the folder:
 * expired → red, within 6 months → warning (many ports and countries need 6 months' validity),
 * later → the plain date.
 */
import { matchDatePhrase } from './query';
import { iso, MON, parseISO } from './datetime';
import type { Rec } from '../types';

export const PRIVATE_DOC_TYPE = 'private-doc';

/**
 * Document titles: voice saves of these open the DOCUMENT form. voice.31 (user: "let's make it tidy"):
 * EVERY ID is a document — SSS / TIN / PhilHealth / Pag-IBIG included (their dates can stay empty).
 * Keep in step with ID_LABELS in lib/privateSearch.ts.
 */
export const DOC_TITLES = new Set([
  'TIN',
  'SSS',
  'SID',
  'PhilHealth',
  'Pag-IBIG',
  'Passport',
  "Seaman's book",
  'SRB',
  "Driver's license",
  'UMID',
  'National ID',
  'PRC license',
  'Visa',
  'Training certificate',
]);

/** The quick buttons in the document form (voice.31: + the government IDs). */
export const QUICK_DOCS = ['Passport', "Seaman's book", 'SRB', 'Visa', "Driver's license", 'UMID', 'SSS', 'TIN', 'SID', 'PhilHealth', 'Pag-IBIG', 'Training certificate'];

/**
 * Which kind of document a title is. The record shape stays fixed, so the title is the category.
 * An ID is SSS, TIN, SID, a driver's license, PhilHealth, and the other government IDs.
 * A visa, a passport, and a training certificate stay their own. A seaman's book is not put in one of those.
 */
export type DocGroup = 'id' | 'visa' | 'passport' | 'training' | 'other';

const SEAMAN_BOOK = /\b(?:seam[ae]n|semen|siemen)'?s?\s+books?\b|\bsrb\b|\bsirb\b/i;
const VISA_WORD = /\bvisas?\b/i;
const PASSPORT_WORD = /\bpassports?\b/i;
const ID_NAME =
  /\b(?:sss|tin|sid|s[\s.]i[\s.]d|phil\s?health|pag[\s-]?ibig|hdmf|umid|national\s+id|philsys|phil[\s-]?id|prc|driver'?s?\s+licen[cs]e)\b/i;
const TRAINING_WORD = /\btraining\b|\bcertificates?\b/i;
const ID_WORD = /\bids?\b|\bi\.?\s?d\.?(?:'?s)?\b/i;

export function docGroup(title: string): DocGroup {
  const t = title || '';
  if (SEAMAN_BOOK.test(t)) return 'other';
  if (VISA_WORD.test(t)) return 'visa';
  if (PASSPORT_WORD.test(t)) return 'passport';
  if (ID_NAME.test(t)) return 'id';
  if (TRAINING_WORD.test(t)) return 'training';
  if (ID_WORD.test(t)) return 'id';
  return 'other';
}

/** A tag the user sets on a document. Stored in the notes text; the record shape stays fixed. */
export type DocTag = 'id' | 'cert' | 'visa' | 'passport';

export const DOC_TAGS: { id: DocTag; label: string }[] = [
  { id: 'id', label: 'ID' },
  { id: 'cert', label: 'Cert' },
  { id: 'visa', label: 'Visa' },
  { id: 'passport', label: 'Passport' },
];

export function tagLabel(tag: DocTag): string {
  return DOC_TAGS.find((t) => t.id === tag)?.label ?? tag;
}

/** The tag a quick name suggests. A seaman's book suggests none. */
export function suggestTag(title: string): DocTag | null {
  const g = docGroup(title);
  if (g === 'training') return 'cert';
  if (g === 'other') return null;
  return g;
}

const TAG_LINE = /^Tag:\s*(id|cert|visa|passport|none)\s*(?:\r?\n|$)/i;

/**
 * The tag written on this document.
 * `undefined` — no tag line yet (older documents; the title still suggests a kind).
 * `null` — the user left it untagged, so it stays by itself.
 */
export function readDocTag(notes: string | null): DocTag | null | undefined {
  const m = (notes ?? '').match(TAG_LINE);
  if (!m) return undefined;
  const v = m[1].toLowerCase();
  if (v === 'none') return null;
  if (v === 'id' || v === 'cert' || v === 'visa' || v === 'passport') return v;
  return undefined;
}

/** The kind used for a list. A saved tag wins. No tag line falls back to the title. An explicit none stays by itself. */
export function docKind(title: string, notes: string | null): DocGroup {
  const stored = readDocTag(notes);
  if (stored === null) return 'other';
  if (stored === 'cert') return 'training';
  if (stored) return stored;
  return docGroup(title);
}

/** Warning window before a document expires. */
export const SOON_DAYS = 183;

const ISSUED_LINE = /^Issued:\s*(\d{4}-\d{2}-\d{2})\s*(?:\n|$)/;

export function packDocNotes(issued: string | null, notes: string, tag?: DocTag | null): string | null {
  const body = notes.trim();
  const head = tag === undefined ? '' : `Tag: ${tag ?? 'none'}\n`;
  const issuedPart = issued ? `Issued: ${issued}` + (body ? '\n' : '') : '';
  const out = head + issuedPart + body;
  return out || null;
}

export function unpackDocNotes(notes: string | null): { issued: string | null; notes: string; tag: DocTag | null | undefined } {
  let s = notes ?? '';
  const tag = readDocTag(s);
  if (tag !== undefined) s = s.replace(TAG_LINE, '');
  const m = s.match(ISSUED_LINE);
  if (!m) return { issued: null, notes: s, tag };
  return { issued: m[1], notes: s.slice(m[0].length), tag };
}

/**
 * A typed date for a document → ISO, or null when it isn't one. Uses the app's date reader
 * (5/3/2027 = 5 March, day first; "March 5 2027"; "2027-03-05"; "March 2027" → the 1st). The YEAR is
 * required: a bare "March 5" would be a guess for an issue or expiry date.
 */
export function readDocDate(text: string, today: Date = new Date()): string | null {
  const t = text.trim();
  if (!t) return null;
  const day0 = new Date(today);
  day0.setHours(0, 0, 0, 0);
  const hit = matchDatePhrase(t, day0);
  if (!hit || !hit.strong) return null;
  // the whole box should be the date — "renew 2027" isn't one
  const rest = (t.slice(0, hit.index) + t.slice(hit.index + hit.length)).replace(/[\s,.]+/g, '');
  if (rest) return null;
  // only real calendar dates with a year typed (no "next year" / "in 2 years" for a document)
  if (!/\d{4}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2}/.test(t)) return null;
  return iso(hit.point);
}

/** "5 Mar 2027" */
export function showDocDate(isoDate: string | null): string {
  if (!isoDate) return '';
  const d = parseISO(isoDate);
  return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
}

export interface ExpiryStatus {
  level: 'expired' | 'soon' | 'ok';
  text: string;
  days: number;
}

/** How a document's expiry reads today. */
export function expiryStatus(expires: string | null, today: Date = new Date()): ExpiryStatus | null {
  if (!expires) return null;
  const a = new Date(today);
  a.setHours(0, 0, 0, 0);
  const b = parseISO(expires);
  const days = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  const span = (n: number) => {
    const m = Math.round(n / 30.44);
    return n < 60 ? `${n} day${n === 1 ? '' : 's'}` : `${m} month${m === 1 ? '' : 's'}`;
  };
  if (days < 0) return { level: 'expired', text: `Expired ${span(-days)} ago`, days };
  if (days === 0) return { level: 'expired', text: 'Expires today', days };
  if (days <= SOON_DAYS) return { level: 'soon', text: `Expires in ${span(days)}`, days };
  return { level: 'ok', text: `Expires ${showDocDate(expires)}`, days };
}

/** How many documents are expired or due within 6 months. No names. */
export function dueDocCount(items: { type?: string | null; date: string | null }[]): number {
  return items.filter((r) => r.type === PRIVATE_DOC_TYPE && expiryStatus(r.date)?.level !== 'ok').length;
}

/** Documents first-to-expire first; no expiry date last; then by name. */
export function sortDocs<T extends { date: string | null; title: string }>(docs: T[]): T[] {
  return [...docs].sort((x, y) => {
    if (x.date && y.date) return x.date < y.date ? -1 : x.date > y.date ? 1 : x.title.localeCompare(y.title);
    if (x.date) return -1;
    if (y.date) return 1;
    return x.title.localeCompare(y.title);
  });
}

const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "4 March 2032" — for speaking. */
function sayDocDate(isoDate: string): string {
  const d = parseISO(isoDate);
  return `${d.getDate()} ${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** "in 5 years" / "in 3 months" / "in 12 days" / "27 days ago" */
function sayWhen(days: number): string {
  const n = Math.abs(days);
  const y = Math.floor(n / 365.25);
  const m = Math.round(n / 30.44);
  const span = n < 60 ? `${n} day${n === 1 ? '' : 's'}` : y >= 2 ? `${y} years` : `${m} month${m === 1 ? '' : 's'}`;
  return days < 0 ? `${span} ago` : `in ${span}`;
}

/** "Your passport expires on 4 March 2032, in 5 years." — the TITLE and the DATE only, never the No. */
/** "passport", "seaman's book" — but "SRB", "US visa" keep their capitals. */
function spokenName(title: string): string {
  const t = (title || 'document').replace(/^your\s+/i, '');
  return /^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t;
}

function oneLine(r: Rec, today: Date): string {
  const name = `Your ${spokenName(r.title)}`;
  const st = expiryStatus(r.date, today);
  if (!r.date || !st) return `${name} has no expiry date saved.`;
  if (st.days === 0) return `${name} expires today.`;
  if (st.days < 0) return `${name} expired on ${sayDocDate(r.date)}, ${sayWhen(st.days)}.`;
  return `${name} expires on ${sayDocDate(r.date)}, ${sayWhen(st.days)}.`;
}

/**
 * voice.29 — what the Private folder SAYS (and shows) for an expiry question (the user: "yes, expiry
 * date — titles are fine"). Never the document number. `found` = the documents matched (or, for
 * "which documents expire …", all documents).
 */
export function spokenExpiry(
  found: Rec[],
  term: string,
  all: boolean,
  today: Date = new Date(),
  /** voice.30: no document matched, but a NOTE / password with that name exists (e.g. SSS) */
  notADoc?: Rec | null,
): string {
  const docs = sortDocs(found);
  if (all) {
    if (!docs.length) return 'You have no documents saved in your private folder yet.';
    const due = docs.filter((r) => {
      const st = expiryStatus(r.date, today);
      return st && st.level !== 'ok';
    });
    if (!due.length) {
      const next = docs.find((r) => r.date);
      const st = next ? expiryStatus(next.date, today) : null;
      return next && next.date && st
        ? `None of your documents expire in the next 6 months. The next to expire is your ${spokenName(next.title)}, on ${sayDocDate(next.date)}, ${sayWhen(st.days)}.`
        : 'None of your documents have an expiry date saved.';
    }
    return due.slice(0, 4).map((r) => oneLine(r, today)).join(' ') + (due.length > 4 ? ` And ${due.length - 4} more.` : '');
  }
  if (!docs.length && notADoc)
    return `Your ${spokenName(notADoc.title)} is saved as a note, with no expiry date. Add it as a document to keep one.`;
  if (!docs.length) return `I couldn't find ${term} in your documents.`;
  if (docs.length > 1) {
    const names = docs.map((r) => spokenName(r.title));
    const shown = names.slice(0, 6);
    const list =
      shown.length === 2
        ? `${shown[0]} and ${shown[1]}`
        : `${shown.slice(0, -1).join(', ')}, and ${shown[shown.length - 1]}`;
    const more = docs.length > shown.length ? ` And ${docs.length - shown.length} more.` : '';
    const one = term.trim().toLowerCase().split(/\s+/);
    const noun =
      one.length === 1 && one[0] ? (one[0].endsWith('s') ? one[0] : `${one[0]}s`) : 'answers';
    return `You have ${docs.length} ${noun}: ${list}.${more} Tap the one you mean.`;
  }
  return oneLine(docs[0], today);
}
