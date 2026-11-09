/**
 * Live Gemma answers. The rules answer first and always remain the fallback.
 * Gemma only replaces the spoken sentence when checkReply accepts it.
 * Nothing from the Private folder is in `rules.results` — questions about secrets
 * never reach here. Logs timings and the reject reason only, never the words.
 */
import { checkReply, GEMMA_SCHEMA, pickRecords, sayMonths, shortIds, systemPrompt, userPrompt } from './gemma';
import type { QueryResult } from './query';
import { llm, llmLog, MIN_TOTAL_RAM_MB } from './llmNative';
import { persist } from './persist';

const MAX_TOKENS = 2048;
const MAX_OUT = 160;

let loading: Promise<void> | null = null;
let started = 0;
const listeners = new Set<() => void>();
const LOAD_MS_KEY = 'gemma_load_ms';
/** A first-time guess until this phone has timed a start (a OnePlus 12 measured about 9 s). */
const FIRST_LOAD_MS = 30_000;

function tell(): void {
  for (const l of listeners) l();
}

/** The screen redraws when a load starts or ends. */
export function subscribeGemmaLoad(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** How long the last successful load took on this phone, else a first-time guess. For the progress bar. */
export function gemmaLoadEstimateMs(): number {
  const saved = Number(persist.getString(LOAD_MS_KEY));
  return Number.isFinite(saved) && saved > 5000 ? saved : FIRST_LOAD_MS;
}

/** True while the startup load is still running. */
export function gemmaIsLoading(): boolean {
  return loading !== null;
}

/** Seconds the current load has been running. The first one takes a few minutes. */
export function gemmaLoadSeconds(): number {
  return started ? Math.max(0, Math.round((Date.now() - started) / 1000)) : 0;
}

/**
 * Load the first model file once. GPU first, then the CPU if the GPU cannot start.
 * The first GPU prepare takes several minutes. Safe to call again.
 */
export function ensureGemmaLoaded(): Promise<void> {
  const m = llm();
  if (!m || m.status().loaded) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    started = Date.now();
    tell();
    try {
      const info = m.deviceInfo();
      if (!info.supported || info.totalRamMb < MIN_TOTAL_RAM_MB) return;
      const file = m.findModels()[0];
      if (!file) return;
      const r = await m.load(file.path, 'auto', MAX_TOKENS);
      llmLog(`ready on ${r.backend} in ${r.ms} ms`);
      persist.set(LOAD_MS_KEY, String(r.ms));
      try {
        m.prepare?.(systemPrompt(new Date()), GEMMA_SCHEMA, MAX_OUT); // the first question skips the set-up too
      } catch {
        /* built when asked instead */
      }
    } catch (e) {
      llmLog(`load failed: ${String((e as Error)?.message ?? e).slice(0, 120)}`);
    } finally {
      loading = null;
      started = 0;
      tell();
    }
  })();
  return loading;
}

/**
 * A grounded sentence for this rules result, or null (keep today's answer).
 * Only the records the rules already matched are shown to the model.
 */
export async function gemmaAnswer(question: string, rules: QueryResult): Promise<string | null> {
  const m = llm();
  if (!m || !m.status().loaded) return null;
  if (!rules.results.length || rules.interpText.startsWith('list: ')) return null;
  const now = new Date();
  const ids = shortIds(pickRecords(question, rules.results, rules.results));
  if (!ids.size) return null;
  try {
    const r = await m.ask(systemPrompt(now), userPrompt(question, ids, now), GEMMA_SCHEMA, MAX_OUT);
    const res = checkReply(r.text, ids);
    // The rules already found records. A sentence that says there is nothing would hide them.
    const denies = res.ok && /\b(?:nothing|no\s+events?|don'?t\s+have|do\s+not\s+have|couldn'?t\s+find|not\s+found)\b/i.test(res.answer);
    const why = denies ? 'denial' : res.ok ? 'used' : res.why;
    llmLog(`ask ${r.ms} ms · ${ids.size} records · ${why === 'used' ? 'used' : 'kept rules ' + why}`);
    return res.ok && !denies ? sayMonths(res.answer) : null;
  } catch (e) {
    llmLog(`ask failed: ${String((e as Error)?.message ?? e).slice(0, 80)}`);
    return null;
  }
}
