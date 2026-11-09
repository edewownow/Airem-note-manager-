// Faithful to MMKV core 2.4.1 (MMKV.cpp getMMKVWithID 241-254, MMKV_IO.cpp removeStorage 1712):
// one cached instance per id per app session — a 2nd open of the same id returns it and IGNORES the
// key; data on disk is encrypted with the key of the instance that wrote it; a fresh session
// decrypts with whatever key it is opened with (wrong key → unreadable).
type Disk = { writtenWith: string | undefined; data: Map<string, string> };
export const disk = new Map<string, Disk>();
let cache = new Map<string, any>();
export function restartApp() { cache = new Map(); }
export function createMMKV(o: any = {}) {
  const id = o.id ?? 'default';
  if (cache.has(id)) return cache.get(id);
  const key: string | undefined = o.encryptionKey;
  const d = disk.get(id) ?? { writtenWith: key, data: new Map() };
  disk.set(id, d);
  const readable = d.data.size === 0 || d.writtenWith === key;
  if (!readable) d.data = new Map(); // MMKV can't decode → treated as empty/corrupt
  d.writtenWith = key;
  const inst = {
    getString: (k: string) => d.data.get(k), set: (k: string, v: string) => d.data.set(k, v), remove: (k: string) => d.data.delete(k),
    clearAll: () => d.data.clear(), trim() {}, contains: (k: string) => d.data.has(k), getAllKeys: () => [...d.data.keys()],
  };
  cache.set(id, inst);
  return inst;
}
export function deleteMMKV(id: string) { cache.delete(id); return disk.delete(id); }
export function existsMMKV(id: string) { return disk.has(id); }
export type MMKV = any;
