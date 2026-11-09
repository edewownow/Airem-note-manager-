/**
 * Corrections — the real accuracy signal. We diff the edited/deleted records
 * against the model's original output and persist them, then feed a few back as
 * few-shot hints on the next parse. Ported from the prototype's
 * snapshot/changed/cleanRec/exampleBlock/savePending logic.
 */
import { CMP, type CmpField, type Correction, type Rec, type Snapshot } from '../types';
import { KEYS, loadJSON, saveJSON } from './persist';

const CAP = 200;

export function snapshot(r: Rec | Snapshot): Snapshot {
  const o = {} as Snapshot;
  CMP.forEach((k) => {
    const v = (r as any)[k];
    o[k] = v == null ? null : v;
  });
  return o;
}

export function changed(a: Snapshot, b: Snapshot): boolean {
  return CMP.some((k) => (a[k] || '') !== (b[k] || ''));
}

/** Only the non-empty comparable fields — for compact few-shot examples. */
export function cleanRec(o: Snapshot | null): Partial<Record<CmpField, string>> {
  const r: Partial<Record<CmpField, string>> = {};
  if (!o) return r;
  CMP.forEach((k) => {
    const v = o[k];
    if (v != null && v !== '') r[k] = v;
  });
  return r;
}

export interface LastInput {
  instruction: string;
  inputKind: string;
  inputText: string | null;
}

/**
 * Diff the saved pending records against the model's originals.
 * Returns the new corrections, most-recent-first (caller prepends + caps).
 */
export function diffPending(
  originalsById: Record<string, Snapshot>,
  survivors: Rec[],
  last: LastInput | null,
): Correction[] {
  const base = {
    ts: Date.now(),
    instruction: last?.instruction ?? '',
    inputKind: last?.inputKind ?? '',
    inputText: last?.inputText ?? null,
  };
  const edits: Correction[] = [];
  const deletes: Correction[] = [];
  const survivingIds = new Set(survivors.map((r) => r.id));

  survivors.forEach((r) => {
    const orig = originalsById[r.id];
    if (!orig) return;
    const after = snapshot(r);
    if (changed(orig, after)) edits.push({ ...base, kind: 'edit', before: orig, after });
  });
  Object.keys(originalsById).forEach((id) => {
    if (!survivingIds.has(id)) {
      deletes.push({ ...base, kind: 'delete', before: originalsById[id], after: null });
    }
  });
  // deletes treated as most-recent (mirrors the prototype's unshift order)
  return [...deletes, ...edits];
}

/**
 * The INPUT line for a correction example. Text-origin corrections echo the source
 * text. IMAGE-origin corrections have no `inputText` (we deliberately do NOT re-send
 * the image — keeps the corrections payload cheap and off the free-tier quota), so we
 * synthesize a TYPE-LEVEL prompt from the corrected record's detected type.
 *
 * Honest limitation: without the image this teaches "for a <type> like this, prefer
 * these fields" (type-level), NOT "for THIS image" (image-specific). That cheaper,
 * more generalizable signal is the intended trade — not a shortcut to revisit.
 */
function exampleInput(c: Correction): string {
  if (c.inputText) return c.inputText.slice(0, 200);
  const t = (c.after && c.after.type) || 'item';
  return `a ${t} captured from a photo (no source text — learn the field choices for this type)`;
}

/** Build the LEARNED EXAMPLES block injected into the parse system prompt. */
export function buildExamples(corrections: Correction[], useExamples: boolean): string {
  if (!useExamples || !corrections.length) return '';
  // Include IMAGE-origin edits too (previously dropped for lacking inputText): a photo
  // edit still teaches type-level extraction habits via the corrected field values.
  const edits = corrections.filter((c) => c.kind === 'edit' && c.after).slice(0, 3);
  const drops = corrections
    .filter((c) => c.kind === 'delete' && c.before && c.before.title)
    .slice(0, 4);
  let s = '';
  if (edits.length) {
    s +=
      '\n\nLEARNED EXAMPLES (the user corrected these — match this style and field choices):\n' +
      edits
        .map((c) => `INPUT: ${exampleInput(c)}\nOUTPUT: ${JSON.stringify([cleanRec(c.after)])}`)
        .join('\n');
  }
  if (drops.length) {
    s +=
      '\n\nThe user has removed items like ' +
      drops.map((c) => `"${c.before!.title}"`).join(', ') +
      " — don't capture that kind of low-value item.";
  }
  return s;
}

/* ---------------- persistence ---------------- */
export function loadCorrections(): Correction[] {
  return loadJSON<Correction[]>(KEYS.corrections, []);
}
export function saveCorrections(list: Correction[]): void {
  saveJSON(KEYS.corrections, list.slice(0, CAP));
}
/** Prepend new corrections (most-recent-first) and cap. */
export function prependCorrections(existing: Correction[], added: Correction[]): Correction[] {
  return [...added, ...existing].slice(0, CAP);
}
