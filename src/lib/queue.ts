/**
 * Pending-parse queue — captures that couldn't parse (offline or no AI link) are
 * enqueued and persisted here, then drained automatically when capability
 * returns (connectivity + AI link). Capture NEVER errors for lack of parse.
 *
 * Stays free of parse.ts to avoid a cycle: the drain receives a processor that
 * actually parses (wired in the state layer), and removes items it handled.
 */
import type { Payload, QueuedCapture } from '../types';
import { id } from './datetime';
import { KEYS, loadJSON, saveJSON } from './persist';

export function loadQueue(): QueuedCapture[] {
  return loadJSON<QueuedCapture[]>(KEYS.queue, []);
}

export function saveQueue(list: QueuedCapture[]): void {
  saveJSON(KEYS.queue, list);
}

/** Enqueue a capture for later parsing; returns the new queue. */
export function enqueue(
  existing: QueuedCapture[],
  item: { payload: Payload },
): QueuedCapture[] {
  const full: QueuedCapture = {
    id: id('q'),
    ts: Date.now(),
    payload: item.payload,
  };
  const next = [...existing, full];
  saveQueue(next);
  return next;
}

export function removeFromQueue(existing: QueuedCapture[], queueId: string): QueuedCapture[] {
  const next = existing.filter((q) => q.id !== queueId);
  saveQueue(next);
  return next;
}

/**
 * Drain the queue oldest-first. `processOne` returns true if the item was
 * handled (remove it) or false to leave it queued (e.g. transient failure).
 * Stops early on the first unhandled item to preserve order. Returns the
 * remaining queue (also persisted).
 */
export async function drainQueue(
  existing: QueuedCapture[],
  processOne: (item: QueuedCapture) => Promise<boolean>,
): Promise<QueuedCapture[]> {
  let remaining = [...existing];
  const ordered = [...existing].sort((a, b) => a.ts - b.ts);
  for (const item of ordered) {
    let handled = false;
    try {
      handled = await processOne(item);
    } catch {
      handled = false;
    }
    if (handled) {
      remaining = remaining.filter((q) => q.id !== item.id);
      saveQueue(remaining);
    } else {
      break; // leave this and the rest queued; try again next time
    }
  }
  return remaining;
}
