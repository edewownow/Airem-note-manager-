/**
 * Early-answer PROBE (feasibility test only). It changes nothing the user sees or hears and never
 * calls Gemma. While a question is spoken it watches the partial words; when they hold steady it
 * takes a snapshot (the words + the record ids Airem finds for them). When the final words arrive it
 * says what the early-answer plan WOULD have done: use the draft, or discard it and why.
 * Log lines carry counts, times and yes/no only, never words or records.
 * See docs/early-answer-plan.md.
 */
export interface Snap {
  text: string;
  ids: string[];
  at: number;
}

export interface Verdict {
  use: boolean;
  why: 'same' | 'no-draft' | 'not-eligible' | 'words-changed' | 'records-differ';
}

export const norm = (t: string): string =>
  t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

const idKey = (ids: string[]): string => [...ids].sort().join(',');

/** What the plan does with a draft once the final words are known. */
export function verdict(snap: Snap | null, finalText: string, finalIds: string[], finalEligible: boolean): Verdict {
  if (!finalEligible) return { use: false, why: 'not-eligible' };
  if (!snap) return { use: false, why: 'no-draft' };
  if (norm(snap.text) !== norm(finalText)) return { use: false, why: 'words-changed' };
  if (idKey(snap.ids) !== idKey(finalIds)) return { use: false, why: 'records-differ' };
  return { use: true, why: 'same' };
}

export interface ProbeDeps {
  eligible: (text: string) => boolean;
  recordsFor: (text: string) => string[];
  log: (line: string) => void;
  now?: () => number;
  stableMs?: number;
  minWords?: number;
  /** Gemma's answer time on this phone, to estimate the time saved. */
  gemmaMs?: number;
}

export function createProbe(deps: ProbeDeps) {
  const now = deps.now ?? Date.now;
  const stableMs = deps.stableMs ?? 900;
  const minWords = deps.minWords ?? 3;
  const gemmaMs = deps.gemmaMs ?? 4200;
  let snap: Snap | null = null;
  let snaps = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstWordAt = 0;
  let last = '';

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const take = (text: string) => {
    timer = null;
    const words = norm(text).split(' ').filter(Boolean).length;
    if (words < minWords || snaps >= 2 || !deps.eligible(text)) return;
    snap = { text, ids: deps.recordsFor(text), at: now() };
    snaps += 1;
  };

  return {
    /** A partial result from the speech service. */
    partial(text: string): void {
      const t = norm(text);
      if (!t) return;
      if (!firstWordAt) firstWordAt = now();
      if (t === last) return;
      last = t;
      clear();
      timer = setTimeout(() => take(text), stableMs);
    },
    /** The final result. Logs what the plan would have done, then resets. */
    final(text: string): Verdict {
      clear();
      const eligible = deps.eligible(text);
      const ids = eligible ? deps.recordsFor(text) : [];
      const v = verdict(snap, text, ids, eligible);
      const gap = snap ? now() - snap.at : 0;
      const saved = v.use ? Math.min(gap, gemmaMs) : 0;
      const spoke = firstWordAt ? now() - firstWordAt : 0;
      deps.log(
        `probe: ${v.use ? 'WOULD USE the draft' : `would DISCARD (${v.why})`} · draft ${snap ? `started ${gap} ms before the end` : 'never started'} · snapshots ${snaps} · ${norm(text).split(' ').filter(Boolean).length} words · spoke for ${spoke} ms${v.use ? ` · about ${saved} ms of the ${gemmaMs} ms Gemma wait saved` : ''}`,
      );
      snap = null;
      snaps = 0;
      firstWordAt = 0;
      last = '';
      return v;
    },
    reset(): void {
      clear();
      snap = null;
      snaps = 0;
      firstWordAt = 0;
      last = '';
    },
  };
}
