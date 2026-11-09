/**
 * Records store — CRUD behind a small interface so the backing store can change
 * (MMKV now; expo-sqlite later) without touching components.
 *
 * UPGRADE SEAM: move to expo-sqlite when record/image volume grows so queries
 * can be indexed and history can be larger.
 */
import type { Rec } from '../types';
import { KEYS, loadJSON, saveJSON } from './persist';

export const store = {
  load(): Rec[] {
    return loadJSON<Rec[]>(KEYS.records, []);
  },
  save(list: Rec[]): void {
    saveJSON(KEYS.records, list);
  },
  all(): Rec[] {
    return store.load();
  },
  remove(id: string): Rec[] {
    const next = store.load().filter((r) => r.id !== id);
    store.save(next);
    return next;
  },
  /** Remove several records in one write (Remove duplicates / Clear all). */
  removeMany(ids: string[]): Rec[] {
    const drop = new Set(ids);
    const next = store.load().filter((r) => !drop.has(r.id));
    store.save(next);
    return next;
  },
};
