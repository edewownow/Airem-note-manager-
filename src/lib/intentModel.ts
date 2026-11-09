/**
 * MemoAirem's OWN small AI (2.0.0 build 98, user: "explore 3 — our own tiny model"): does a sentence
 * want an ANSWER or to be SAVED? A logistic-regression model over hashed word / phrase / letter
 * features, trained from scratch on MemoAirem's own labelled sentences (scripts/intent-data.ts +
 * what users export from "What MemoAirem missed") by scripts/intent-model/train.ts.
 *
 * Tiny (a few KB of numbers), instant, fully offline, on every phone, no licence from anyone.
 * It only HELPS: the word rules (lib/intent.ts) and the private-folder rules decide first; the model
 * is asked only when the rules aren't sure, and acts only when it is very sure itself.
 * Pure — no React Native — so training and the app use the SAME feature code.
 */

export const DIM = 4096; // hashed feature slots

export interface IntentWeights {
  v: number; // format version
  dim: number;
  bias: number;
  w: number[]; // DIM numbers (rounded)
  trained: string; // when / on how many sentences — for About and logs
}

const FILLER = /^(?:(?:ok(?:ay)?|hey|hi|oh|um+|uh+|so|please|and|also|can\s+you|could\s+you)[\s,]+)+/i;
const DAYS =
  /^(?:today|tonight|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening|week|weekend|month|year)$/;

/** FNV-1a → a slot. */
function slot(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % DIM;
}

/** Words, with numbers / times / days made general (the model learns "a day", not "Friday"). */
export function tokens(text: string): string[] {
  const t = text
    .toLowerCase()
    .trim()
    .replace(FILLER, '')
    .replace(/[’']/g, "'")
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)/g, ' _time ')
    .replace(/\b\d+(?:[.,:/-]\d+)*\b/g, ' _num ')
    .replace(/[^a-z_'\s?]/g, ' ');
  return t
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w === '?' ? '_q' : w.endsWith('?') ? w.slice(0, -1) : w))
    .map((w) => (DAYS.test(w) ? '_day' : w))
    .filter(Boolean);
}

/** The features of a sentence: slots that are "on" (with a weight each, mostly 1). */
export function features(text: string): Map<number, number> {
  const f = new Map<number, number>();
  const add = (k: string, v = 1) => {
    const i = slot(k);
    f.set(i, (f.get(i) ?? 0) + v);
  };
  const raw = text.trim();
  const w = tokens(raw);
  add('_bias_len_' + Math.min(w.length, 8));
  if (/\?\s*$/.test(raw)) add('_ends_q');
  if (!w.length) return f;
  add('first:' + w[0]);
  if (w[1]) add('first2:' + w[0] + ' ' + w[1]);
  if (w[2]) add('first3:' + w[0] + ' ' + w[1] + ' ' + w[2]);
  add('last:' + w[w.length - 1]);
  for (let i = 0; i < w.length; i++) {
    add('w:' + w[i]);
    if (i + 1 < w.length) add('b:' + w[i] + ' ' + w[i + 1]);
    // letters: helps with words it never saw ("whats", "wheres", misheard words)
    if (w[i].length >= 4 && !w[i].startsWith('_')) {
      const s = `<${w[i]}>`;
      for (let j = 0; j + 3 <= s.length; j++) add('c:' + s.slice(j, j + 3), 0.3);
    }
  }
  return f;
}

/** Probability that the sentence is a QUESTION (1 = surely ask, 0 = surely save). */
export function pAsk(weights: IntentWeights, text: string): number {
  let z = weights.bias;
  for (const [i, v] of features(text)) z += (weights.w[i] ?? 0) * v;
  return 1 / (1 + Math.exp(-z));
}
