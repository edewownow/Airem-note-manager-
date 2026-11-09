/**
 * Pasted text on the File screen.
 * Rule: a numbered list is one saved entry per number, even when that number
 * has no Answer line. An Answer line stays inside the same number. Nothing
 * is sent off the phone.
 */

export interface PastedItem {
  question: string;
  answer: string;
}

interface Mark {
  n: number;
  at: number;
  end: number;
}

function tidy(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Drop a comma left behind by "bucket, number 3". */
function edge(s: string): string {
  return tidy(s)
    .replace(/^[,;.\s]+/, '')
    .replace(/[,;]+$/, '')
    .replace(/\s+\.$/, '')
    .trim();
}

/**
 * "number 2" / "number 2." / "number 3" inside a sentence.
 * "a dog name red number 2. fish …, number 3 there are 5000…" is three items.
 * The words before the first "number 2" are the first item when it does not say "number 1".
 */
function wordMarks(text: string): Mark[] {
  const re = /\bnumber\s+(\d{1,3})\b\s*[.)]?/gi;
  const marks: Mark[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    marks.push({ n: +m[1], at: m.index, end: m.index + m[0].length });
  }
  return marks;
}

function blocksFromWords(text: string, marks: Mark[]): string[] {
  const bodies: string[] = [];
  const before = text.slice(0, marks[0].at).trim();
  if (before && marks[0].n !== 1) bodies.push(before);
  for (let i = 0; i < marks.length; i++) {
    const next = marks[i + 1]?.at ?? text.length;
    bodies.push(text.slice(marks[i].end, next).trim());
  }
  return bodies;
}

function collect(text: string, re: RegExp, numGroup: number): Mark[] {
  const marks: Mark[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const lead = m[1].length;
    marks.push({ n: +m[numGroup], at: m.index + lead, end: m.index + m[0].length });
  }
  return marks;
}

/** "1." "2)" "10." — the dot or bracket is optional, so "3 data" counts too. */
function punctuatedHits(text: string): Mark[] {
  return collect(text, /(^|[\s])(\d{1,3})[.)][ \t]+/g, 2);
}

/** "3 data" with no dot. A year or "5000" is too long to be an item number. */
function bareHits(text: string): Mark[] {
  return collect(text, /(^|[\s])(\d{1,3})[ \t]+(?=[A-Za-z])/g, 2);
}

/**
 * "1. data" and "1 data" are the same item. A dot after the number is optional,
 * and a list may mix both. "1. data 2 data 3. data" is three items.
 * When both "2 dogs" and "2. fish" could be number 2, the one with the dot wins.
 */
function digitMarks(text: string): Mark[] {
  const punct = punctuatedHits(text);
  const bare = bareHits(text);
  const start = punct.find((h) => h.n === 1) ?? bare.find((h) => h.n === 1);
  if (!start) return [];
  const chain: Mark[] = [start];
  let expect = 2;
  for (;;) {
    const after = chain[chain.length - 1].at;
    const withDot = punct.find((h) => h.n === expect && h.at > after);
    const noDot = bare.find((h) => h.n === expect && h.at > after);
    const next = withDot ?? noDot;
    if (!next) break;
    chain.push(next);
    expect += 1;
  }
  return chain;
}

function blocksFrom(text: string, marks: Mark[]): string[] {
  return marks.map((mark, i) => {
    const next = marks[i + 1]?.at ?? text.length;
    return text.slice(mark.end, next).trim();
  });
}

function normalizePaste(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/[\u2028\u2029]/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\uFF1A/g, ':')
    .trim();
}

/** True when the paste has at least one numbered item. */
export function isNumberedList(raw: string): boolean {
  const text = normalizePaste(raw);
  return wordMarks(text).length >= 1 || digitMarks(text).length >= 1;
}

/**
 * One entry per number. No Answer line is required — the number's own words
 * are the entry. When an Answer line is there, it stays with that number.
 * A paste with no numbers is one entry, the whole text.
 */
export function parsePastedItems(raw: string): PastedItem[] {
  const text = normalizePaste(raw);
  if (!text) return [];

  const words = wordMarks(text);
  const digits = digitMarks(text);
  const blocks = words.length ? blocksFromWords(text, words) : blocksFrom(text, digits);
  if (!blocks.length) {
    const whole = tidy(text);
    return whole ? [{ question: whole, answer: '' }] : [];
  }

  return blocks
    .map((body) => {
      const m = body.match(/^([\s\S]*?)\s*(?:\n+\s*)?Answer\s*:\s*([\s\S]*)$/i);
      if (!m) return { question: edge(body), answer: '' };
      const question = edge(m[1]);
      const answer = edge(m[2]);
      if (!question) return { question: answer, answer: '' };
      return { question, answer };
    })
    .filter((item) => item.question);
}
