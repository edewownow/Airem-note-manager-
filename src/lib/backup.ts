/**
 * Reset backup — the safety net behind Settings → Reset → Undo (1.7.0).
 *
 * Start fresh writes ONE snapshot of everything it is about to delete (records, capture
 * log, offline queue, corrections) BEFORE deleting anything, and only proceeds when the
 * snapshot reads back intact. Undo merges the snapshot back in; the snapshot stays until
 * the user deletes it or runs another reset (which replaces it). It lives only on this
 * phone — never on Harbor.
 */
import type { Correction, LogEntry, QueuedCapture, Rec } from '../types';
import { persist } from './persist';

const BACKUP_KEY = 'reset_backup';

export interface ResetBackup {
  ts: number; // when the reset ran
  saved: Rec[];
  log: LogEntry[];
  queue: QueuedCapture[];
  corrections: Correction[];
}

/** Write the snapshot and confirm it reads back. false → do NOT delete anything. */
export function saveBackup(b: ResetBackup): boolean {
  try {
    const raw = JSON.stringify(b);
    persist.set(BACKUP_KEY, raw);
    return persist.getString(BACKUP_KEY) === raw;
  } catch {
    return false;
  }
}

export function loadBackup(): ResetBackup | null {
  const raw = persist.getString(BACKUP_KEY);
  if (!raw) return null;
  try {
    const b = JSON.parse(raw) as ResetBackup;
    return b && Array.isArray(b.saved) ? b : null;
  } catch {
    return null;
  }
}

export function clearBackup(): void {
  persist.delete(BACKUP_KEY);
}
