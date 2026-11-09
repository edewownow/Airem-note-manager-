/**
 * Save-time near-match detection — when a freshly parsed record overlaps one already
 * saved (the "same flyer parsed twice" case), surface it so the USER decides
 * update / create-new / keep-existing instead of silently stacking a duplicate.
 *
 * v1 scope: the INTERACTIVE save only (`savePending`). The auto-drain path (`drainNow`)
 * commits queued offline captures without any review and is a KNOWN GAP — see
 * MEMOAIREM_MANIFEST.md §8 (v2: a shared `commitRecords()` with a silent auto-policy).
 *
 * Normalization is reused from `query.ts` `contentKey` so the floor can't drift from
 * the query-time dedup.
 */
import type { Rec } from '../types';
import { contentKey } from './query';

/** The near-match floor: ≥2 of these (normalized, both non-empty) → candidate. Notes
 * are EXCLUDED (wobble-prone); date is allowed to vary (same flyer, new date). */
export const MATCH_FIELDS: (keyof Rec)[] = ['title', 'location', 'time'];

/** Fields shown in the diff prompt and applied on UPDATE. id / type / via / imageId /
 * thumb are NOT touched — the existing record keeps its identity and image. */
export const DIFF_FIELDS: (keyof Rec)[] = ['title', 'date', 'time', 'location', 'people', 'notes'];

export interface NearMatch {
  existing: Rec;
  matchCount: number; // how many MATCH_FIELDS matched (2 or 3)
}

/** Count normalized matches across MATCH_FIELDS. A field counts ONLY if BOTH sides are
 * non-empty and equal — two nulls (e.g. both time-less menu items) must NOT count, so
 * unrelated records that merely share a venue don't false-positive on an empty time. */
function countMatches(a: Rec, b: Rec): number {
  let n = 0;
  for (const f of MATCH_FIELDS) {
    const va = contentKey(a, [f]);
    const vb = contentKey(b, [f]);
    if (va && vb && va === vb) n += 1;
  }
  return n;
}

/**
 * Best near-match for `pending` among `existing` records: the one sharing ≥2 of
 * {title, location, time}. Most matches wins; a tie resolves to the most recent
 * existing — the lists are newest-first, so the first encountered at the top count
 * (strict `>`) is the most recent. Returns null when nothing clears the floor.
 */
export function findNearMatch(pending: Rec, existing: Rec[]): NearMatch | null {
  let best: NearMatch | null = null;
  for (const e of existing) {
    if (e.id === pending.id) continue; // never match a record against itself
    const matchCount = countMatches(pending, e);
    if (matchCount >= 2 && (!best || matchCount > best.matchCount)) {
      best = { existing: e, matchCount };
    }
  }
  return best;
}

/**
 * UPDATE: copy the pending record's content fields (DIFF_FIELDS) onto the existing
 * record, keeping the existing record's id, type, via, imageId, and thumb. Mirrors the
 * `addTypedRecord` editingId replace-in-array pattern — one record survives, at its id.
 */
export function applyUpdate(existing: Rec, pending: Rec): Rec {
  // The fields copied here are exactly DIFF_FIELDS (kept explicit for type-safety);
  // id / type / via / imageId / thumb are intentionally retained from `existing`.
  return {
    ...existing,
    title: pending.title,
    date: pending.date,
    time: pending.time,
    location: pending.location,
    people: pending.people,
    notes: pending.notes,
  };
}
