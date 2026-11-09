/**
 * Capture log — every parse attempt: thumbnail + produced JSON + auto-verdict.
 * Also the natural home for surfacing pending (queued) captures. Bounded so the
 * persisted thumbnails don't grow without limit (prototype cap = 25).
 */
import type { LogEntry } from '../types';
import { id } from './datetime';
import { KEYS, loadJSON, saveJSON } from './persist';
import { shareJSON } from './share';

const CAP = 25;

export function loadLog(): LogEntry[] {
  return loadJSON<LogEntry[]>(KEYS.log, []);
}

export function saveLog(list: LogEntry[]): void {
  saveJSON(KEYS.log, list.slice(0, CAP));
}

/** Prepend a new entry (assigns id + ts), cap, persist; returns the new list. */
export function addLog(existing: LogEntry[], entry: Omit<LogEntry, 'id' | 'ts'>): LogEntry[] {
  const full: LogEntry = { ...entry, id: id('l'), ts: Date.now() };
  const next = [full, ...existing].slice(0, CAP);
  saveLog(next);
  return next;
}

/** Empty the capture log (diagnostics only — never touches Saved records or the queue). */
export function clearLog(): LogEntry[] {
  saveLog([]);
  return [];
}

export function exportLog(list: LogEntry[]): Promise<void> {
  return shareJSON('capture-log.json', list);
}
