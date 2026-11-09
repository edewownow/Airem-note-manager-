/**
 * 2.0.0 (user: "a list of general search voice commands … list all passwords, list all IDs, so it
 * filters the data and shows it only for the user to view — not saved as data").
 *
 * "List all …" / "show my …" / "view / display / find / search / get / check / open my …" / "what are my …" + a CATEGORY → a filtered list to LOOK at. Never a
 * save, never a keyword search ("list all passwords" used to search for the words "list all").
 *
 *   Private folder (unlock first, as always; titles only are spoken — never a password or a number):
 *     passwords · logins · accounts           → password items
 *     IDs · I'd · I.D.s · cards               → IDs only (SSS, TIN, SID, license, PhilHealth, …)
 *     visas · passports · training certificates → that kind only
 *     documents · docs · papers             → every document, including a seaman's book
 *     private notes · secret notes            → private notes
 *     everything private · my private folder  → all private items
 *   Normal records:
 *     reminders · to-dos · tasks              → type reminder
 *     schedules · events · appointments       → type event (past ones too: "all")
 *     notes (not "private")                   → type note
 *     everything · all my records · all saved → every record
 *
 * Pure (no React Native) — tested in node (scripts/list-commands.ts).
 */

export type PrivateListKind = 'password' | 'doc' | 'id' | 'visa' | 'passport' | 'training' | 'note' | 'all';
export type RecordListType = 'event' | 'reminder' | 'note' | 'all';

export type ListAsk =
  | { where: 'private'; kind: PrivateListKind; label: string }
  | { where: 'records'; type: RecordListType; label: string };

const FILLER = /^(?:(?:ok(?:ay)?|hey|hi|oh|um+|uh+|so|please|and|also|can\s+you|could\s+you|would\s+you|i\s+want\s+to|i'?d\s+like\s+to)[\s,]+)+/i;

// the asking part: "list (all)", "show me (all)", "what are (all)", "all" alone
const VERB =
  '(?:(?:list|show|display|view|see|open|read|give|get|find|search|look\\s+up|check|bring\\s+up|pull\\s+up|let\\s+me\\s+see)(?:\\s+me)?(?:\\s+out)?|what\\s+are|what\'?re|which\\s+are|how\\s+many)';
const ALL = '(?:all(?:\\s+of)?|every|each|the\\s+list\\s+of|a\\s+list\\s+of|everything\\s+in)';
const MINE = '(?:my|the|our|of\\s+my|saved|stored)';
const TAIL =
  '(?:\\s+(?:i\\s+(?:have|saved|got)|(?:that\\s+)?(?:i\\s+)?(?:saved|stored|have)|saved|stored|there|in\\s+(?:my|the)\\s+(?:private\\s+)?folder|in\\s+private|please|now|again))*';

const PRIVATE_WORD = '(?:private|secret|hidden|secure)';
const CATS: { re: string; ask: ListAsk }[] = [
  // private first: "private notes" must not become normal notes
  { re: `${PRIVATE_WORD}\\s+(?:notes?|memos?)`, ask: { where: 'private', kind: 'note', label: 'private notes' } },
  {
    re: `(?:${PRIVATE_WORD}\\s+(?:items?|things|stuff|data|files?|folder|records?)|everything\\s+${PRIVATE_WORD}|${PRIVATE_WORD}\\s+folder|${PRIVATE_WORD})`,
    ask: { where: 'private', kind: 'all', label: 'private items' },
  },
  {
    re: '(?:pass\\s?words?|pass\\s?codes?|log\\s?ins?|accounts?|credentials?|user\\s?names?\\s+and\\s+pass\\s?words?)',
    ask: { where: 'private', kind: 'password', label: 'passwords' },
  },
  { re: 'visas?', ask: { where: 'private', kind: 'visa', label: 'visas' } },
  { re: 'passports?', ask: { where: 'private', kind: 'passport', label: 'passports' } },
  {
    re: '(?:training(?:\\s+certificates?)?|certificates?|certs?)',
    ask: { where: 'private', kind: 'training', label: 'training certificates' },
  },
  {
    // STT writes IDs many ways: "IDs", "ID's", "I.D.s", "I D's", "I'd", "I'ds", "ids"
    re: "(?:i\\.?\\s?d\\.?(?:'?s)?|i'?ds?|ids|id\\s+cards?|identification(?:\\s+cards?)?|cards?)",
    ask: { where: 'private', kind: 'id', label: 'IDs' },
  },
  {
    re: "(?:documents?|docs?|papers?|passports?\\s+and\\s+ids?)",
    ask: { where: 'private', kind: 'doc', label: 'documents' },
  },
  { re: '(?:reminders?|to\\s?-?\\s?dos?|tasks?)', ask: { where: 'records', type: 'reminder', label: 'reminders' } },
  {
    re: '(?:schedules?|events?|appointments?|meetings?|bookings?)',
    ask: { where: 'records', type: 'event', label: 'schedule items' },
  },
  { re: '(?:notes?|memos?)', ask: { where: 'records', type: 'note', label: 'notes' } },
  {
    re: '(?:records?|everything|all\\s+(?:my\\s+)?(?:data|items|things)|(?:saved\\s+)?(?:data|items|things|entries))',
    ask: { where: 'records', type: 'all', label: 'records' },
  },
];

const BUILT = CATS.map((c) => ({
  // VERB [ALL] [MINE] CATEGORY [TAIL]   |   ALL [MINE] CATEGORY [TAIL]   (a verb or "all" is required)
  re: new RegExp(
    `^(?:${VERB}(?:\\s+${ALL})?|${ALL})(?:\\s+${MINE})*\\s+${c.re}${TAIL}$`,
    'i',
  ),
  ask: c.ask,
}));

/** The category list asked for, or null when the sentence isn't a "list all …" command. */
export function parseListAll(text: string): ListAsk | null {
  const t = text
    .trim()
    .replace(FILLER, '')
    .replace(/[?.!,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return null;
  for (const b of BUILT) {
    if (!b.re.test(t)) continue;
    // "find my passport" stays a search for that passport. "list all passports" is the category.
    const one =
      b.ask.where === 'private' &&
      (b.ask.kind === 'passport' || b.ask.kind === 'visa') &&
      /^(?:find|search|look\s+up|check|get)\b/i.test(t) &&
      !/\b(?:all|every|each)\b/i.test(t);
    if (one) continue;
    return b.ask;
  }
  // "what is my id" is the ID category, not every document and not every saved note.
  // "what is my training certificate" is that category. "what is my passport" stays a search for the passport.
  for (const kind of ['id', 'training'] as const) {
    const cat = CATS.find((c) => c.ask.where === 'private' && c.ask.kind === kind);
    if (cat && new RegExp(`^(?:what'?s|what\\s+is)(?:\\s+${MINE})*\\s+${cat.re}${TAIL}$`, 'i').test(t)) return cat.ask;
  }
  return null;
}

const LIST_NAME: Record<PrivateListKind, [string, string]> = {
  password: ['password', 'passwords'],
  id: ['ID', 'IDs'],
  visa: ['visa', 'visas'],
  passport: ['passport', 'passports'],
  training: ['training certificate', 'training certificates'],
  doc: ['document', 'documents'],
  note: ['private note', 'private notes'],
  all: ['private item', 'private items'],
};

/** The words under a filtered Private list: "IDs", "visas", "documents". */
export function privateListLabel(kind: PrivateListKind): string {
  return LIST_NAME[kind][1];
}

/** What the phone SAYS for a private list — titles only (never a password or a number). */
export function spokenPrivateList(kind: PrivateListKind, titles: string[]): string {
  const [name, plural] = LIST_NAME[kind];
  if (!titles.length) return `You have no ${plural} saved.`;
  const shown = titles.slice(0, 8);
  const more = titles.length > shown.length ? `, and ${titles.length - shown.length} more` : '';
  return `You have ${titles.length} ${titles.length === 1 ? name : plural}: ${shown.join(', ')}${more}.`;
}
