/**
 * Drop this file in MemoAirem at src/lib/sync.ts.
 * It pushes and pulls Harbor records without changing the Rec shape.
 * Capture still succeeds when the network is down. The next start() catches up.
 *
 * Wire it from AppProvider:
 *
 *   const sync = useMemo(() => installSync({
 *     load: () => store.all(),
 *     save: (records) => {
 *       store.save(records);
 *       dispatch({ type: "setSaved", saved: records });
 *     },
 *   }), []);
 *   useEffect(() => { void sync.start(); }, [sync]);
 *
 * After a record is stored (savePending, addTypedRecord, saveVoiceNote): sync.afterSave(record)
 * After removeSaved: sync.afterDelete(id)
 */
import type { Rec } from "../types";
import { persist } from "./persist";

const CONFIG_KEY = "harbor_sync";
const CLOCK_KEY = "harbor_clock";
const TOMBSTONE_KEY = "harbor_tombstones";
const CURSOR_KEY = "harbor_cursor";

export type SyncConfig = {
  baseUrl: string;
  apiKey: string;
};

type PublicRecord = {
  id: string;
  type: string;
  title: string;
  date: string | null;
  time: string | null;
  location: string | null;
  people: string | null;
  notes: string | null;
  via: string | null;
  thumb: string | null;
  updated_at: number;
  deleted: boolean;
};

type Tombstone = { id: string; updated_at: number };

export type SyncIO = {
  load: () => Rec[];
  save: (records: Rec[]) => void;
};

export function loadSyncConfig(): SyncConfig | null {
  const raw = persist.getString(CONFIG_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SyncConfig>;
    const baseUrl = (parsed.baseUrl ?? "").trim().replace(/\/+$/, "");
    const apiKey = (parsed.apiKey ?? "").trim();
    if (!baseUrl || !apiKey) return null;
    return { baseUrl, apiKey };
  } catch {
    return null;
  }
}

export function saveSyncConfig(config: SyncConfig): void {
  persist.set(
    CONFIG_KEY,
    JSON.stringify({
      baseUrl: config.baseUrl.trim().replace(/\/+$/, ""),
      apiKey: config.apiKey.trim(),
    }),
  );
}

export type SyncReport = {
  ok: boolean;
  pushed: number;
  message: string;
};

let runSync: (() => Promise<SyncReport>) | null = null;
let inflight: Promise<SyncReport> | null = null;
// The latest bulk-delete chain, so an undo can wait for it before re-uploading.
let deleting: Promise<void> = Promise.resolve();

function runReconcile(io: SyncIO): Promise<SyncReport> {
  if (inflight) return inflight;
  inflight = reconcile(io).finally(() => {
    inflight = null;
  });
  return inflight;
}

export function syncNow(): Promise<SyncReport> {
  if (runSync) return runSync();
  return Promise.resolve({
    ok: false,
    pushed: 0,
    message: "Close MemoAirem completely, open it again, then tap Save Harbor link.",
  });
}

export function installSync(io: SyncIO) {
  const api = {
    afterSave(record: Rec) {
      const updatedAt = Date.now();
      writeClock(record.id, updatedAt);
      void pushRecord(record, updatedAt).catch(() => undefined);
    },
    /** Several new records: one clock write, then each upload. A pasted list must not rewrite the clock 20 times. */
    afterSaveMany(records: Rec[]) {
      if (records.length === 1) {
        api.afterSave(records[0]);
        return;
      }
      if (!records.length) return;
      const updatedAt = Date.now();
      const clocks = readClock();
      for (const record of records) clocks[record.id] = updatedAt;
      persist.set(CLOCK_KEY, JSON.stringify(clocks));
      for (const record of records) void pushRecord(record, updatedAt).catch(() => undefined);
    },
    afterDelete(id: string) {
      api.afterDeleteMany([id]);
    },
    /**
     * Delete one or more records on Harbor (single delete, Remove duplicates, Reset).
     * Tombstones are persisted FIRST so an app close or a dropped link still deletes them
     * on the next sync. If a reconcile is in flight it may hold the old record list and an
     * old clock map, so wait for it, then stamp the clocks again and send the deletes.
     */
    afterDeleteMany(ids: string[]) {
      if (!ids.length) return;
      const stamp = () => {
        const updatedAt = Date.now();
        const clocks = readClock();
        for (const id of ids) clocks[id] = updatedAt;
        persist.set(CLOCK_KEY, JSON.stringify(clocks));
        return updatedAt;
      };
      const updatedAt = stamp();
      const drop = new Set(ids);
      const pending = readTombstones().filter((row) => !drop.has(row.id));
      for (const id of ids) pending.push({ id, updated_at: updatedAt });
      persist.set(TOMBSTONE_KEY, JSON.stringify(pending));
      const busy = inflight ?? Promise.resolve();
      deleting = busy
        .catch(() => undefined)
        .then(() => {
          stamp();
          return pushTombstones();
        })
        .then(
          () => undefined,
          () => undefined,
        );
    },
    /**
     * Undo of a reset: cancel any still-pending Harbor deletes for these records, stamp
     * their clocks so a pull can't re-apply the old delete, wait for any delete already on
     * the wire, then upload them again with a fresh (newer) timestamp.
     */
    afterRestore(records: Rec[]) {
      if (!records.length) return;
      const back = new Set(records.map((r) => r.id));
      const pending = readTombstones().filter((row) => !back.has(row.id));
      persist.set(TOMBSTONE_KEY, JSON.stringify(pending));
      const now = Date.now();
      const clocks = readClock();
      for (const id of back) clocks[id] = now;
      persist.set(CLOCK_KEY, JSON.stringify(clocks));
      void deleting.then(() => {
        for (const record of records) api.afterSave(record);
      });
    },
    start() {
      return runReconcile(io);
    },
  };
  runSync = () => runReconcile(io);
  return api;
}

/** Never rejects — a sync problem becomes a report the user can read, not a stuck spinner. */
async function reconcile(io: SyncIO): Promise<SyncReport> {
  try {
    const report = await reconcileInner(io);
    const waiting = readTombstones().length;
    if (report.ok && waiting > 0) {
      return {
        ok: false,
        pushed: report.pushed,
        message: `${waiting} delete${waiting === 1 ? "" : "s"} still waiting for Harbor. They go out on the next sync.`,
      };
    }
    return report;
  } catch (error) {
    return { ok: false, pushed: 0, message: `Harbor sync stopped: ${(error as Error)?.message ?? error}` };
  }
}

async function reconcileInner(io: SyncIO): Promise<SyncReport> {
  const config = loadSyncConfig();
  if (!config) {
    return { ok: false, pushed: 0, message: "Add the Harbor address and a read-write key." };
  }
  await pushTombstones();
  const since = Number(persist.getString(CURSOR_KEY) ?? "0") || 0;
  const pulled = await request<unknown>(config, `/api/v1/records?since=${since}`);
  if (!pulled.ok) return { ok: false, pushed: 0, message: pulled.message };
  const remote = recordsFrom(pulled.data);
  if (!remote) {
    return { ok: false, pushed: 0, message: "Harbor sent a record list the phone could not read." };
  }
  const clocks = readClock();
  const started = new Set(io.load().map((record) => record.id));
  const local = new Map(io.load().map((record) => [record.id, record]));
  const dropped = new Set<string>();
  let cursor = since;
  for (const row of remote) {
    if (!row || typeof row.id !== "string" || typeof row.updated_at !== "number") continue;
    cursor = Math.max(cursor, row.updated_at);
    const known = Math.max(clocks[row.id] ?? 0, readClock()[row.id] ?? 0);
    if (row.updated_at < known) continue;
    clocks[row.id] = row.updated_at;
    if (row.deleted || tombstoneIds().has(row.id)) {
      dropped.add(row.id);
      local.delete(row.id);
      continue;
    }
    local.set(row.id, applyRemote(local.get(row.id), row));
  }
  for (const id of [...local.keys()]) {
    if (tombstoneIds().has(id) || (started.has(id) && !io.load().some((record) => record.id === id))) {
      dropped.add(id);
      local.delete(id);
    }
  }
  for (const record of io.load()) {
    if (dropped.has(record.id) || tombstoneIds().has(record.id) || local.has(record.id)) continue;
    local.set(record.id, record);
  }
  io.save([...local.values()]);
  const pulledThrough = cursor;
  let pushed = 0;
  for (const record of local.values()) {
    if (tombstoneIds().has(record.id)) continue;
    if (!io.load().some((row) => row.id === record.id)) continue;
    const stamp = Math.max(clocks[record.id] ?? 0, readClock()[record.id] ?? 0);
    if (stamp !== 0 && stamp <= pulledThrough) continue;
    const when = stamp > pulledThrough ? stamp : Date.now();
    const sent = await pushRecord(record, when);
    if (!sent.ok) return { ok: false, pushed, message: sent.message };
    if (sent.skipped) continue;
    clocks[record.id] = sent.updatedAt;
    cursor = Math.max(cursor, sent.updatedAt);
    pushed += 1;
  }
  const disk = readClock();
  for (const [id, stamp] of Object.entries(disk)) {
    if ((clocks[id] ?? 0) < stamp) clocks[id] = stamp;
  }
  persist.set(CLOCK_KEY, JSON.stringify(clocks));
  persist.set(CURSOR_KEY, String(cursor));
  return {
    ok: true,
    pushed,
    message: pushed > 0 ? `Sent ${pushed} to Harbor.` : "Harbor is connected. Nothing new to send.",
  };
}

async function pushRecord(
  record: Rec,
  updatedAt: number,
): Promise<{ ok: true; updatedAt: number; skipped?: boolean } | { ok: false; message: string }> {
  const config = loadSyncConfig();
  if (!config) return { ok: false, message: "Add the Harbor address and a read-write key." };
  const tombstone = readTombstones().find((row) => row.id === record.id);
  if (tombstone && tombstone.updated_at >= updatedAt) {
    return { ok: true, updatedAt: tombstone.updated_at, skipped: true };
  }
  const body = await request<{ applied: boolean; record: PublicRecord }>(
    config,
    `/api/v1/records/${encodeURIComponent(record.id)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        type: record.type,
        title: record.title,
        date: record.date,
        time: record.time,
        location: record.location,
        people: record.people,
        notes: record.notes,
        via: record.via,
        thumb: record.thumb && record.thumb.length <= 500_000 ? record.thumb : null,
        updated_at: updatedAt,
      }),
    },
  );
  if (!body.ok || !body.data) return { ok: false, message: body.ok ? "Harbor sent an empty reply." : body.message };
  return { ok: true, updatedAt: body.data.applied ? updatedAt : body.data.record.updated_at };
}

async function deleteRemote(
  id: string,
  updatedAt: number,
): Promise<"deleted" | "lost" | "missing" | "offline"> {
  const config = loadSyncConfig();
  if (!config) return "offline";
  const result = await request<{ applied?: boolean }>(
    config,
    `/api/v1/records/${encodeURIComponent(id)}?updated_at=${updatedAt}`,
    { method: "DELETE" },
  );
  if (result.ok) return result.data?.applied === false ? "lost" : "deleted";
  if (result.status === 404) return "missing";
  throw new Error(result.message);
}

async function pushTombstones(): Promise<void> {
  for (const row of readTombstones()) {
    try {
      const result = await deleteRemote(row.id, row.updated_at);
      if (result === "deleted" || result === "lost") clearTombstone(row.id);
      else if (result === "missing" && Date.now() - row.updated_at > MISSING_RETIRE_MS) clearTombstone(row.id);
      else if (result === "offline") return;
    } catch {
      return;
    }
  }
}

/**
 * A 404 on delete usually means the record's upload hasn't landed yet, so the tombstone is
 * kept and retried (and blocks any re-upload). But a record deleted before it ever uploaded
 * (e.g. a Reset of old, never-synced records) would 404 forever — retire it after this long.
 * Uploads time out at 20s, so 10 minutes is far past any upload still in flight.
 */
const MISSING_RETIRE_MS = 10 * 60_000;

function recordsFrom(data: unknown): PublicRecord[] | null {
  if (Array.isArray(data)) return data as PublicRecord[];
  if (data && typeof data === "object" && Array.isArray((data as { records?: unknown }).records)) {
    return (data as { records: PublicRecord[] }).records;
  }
  return null;
}

function tombstoneIds(): Set<string> {
  return new Set(readTombstones().map((row) => row.id));
}

function applyRemote(local: Rec | undefined, row: PublicRecord): Rec {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    date: row.date,
    time: row.time,
    location: row.location,
    people: row.people,
    notes: row.notes,
    via: row.via,
    imageId: local?.imageId ?? null,
    thumb: row.thumb ?? local?.thumb ?? null,
  };
}

async function request<T>(
  config: SyncConfig,
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T | null; status: number } | { ok: false; message: string; status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        accept: "application/json",
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    if (!response.ok) return { ok: false, message: explainStatus(response.status), status: response.status };
    if (response.status === 204) return { ok: true, data: null, status: response.status };
    return { ok: true, data: (await response.json()) as T, status: response.status };
  } catch {
    return {
      ok: false,
      status: 0,
      message: "The phone could not reach Harbor. Leave the tunnel window open and use its https address.",
    };
  } finally {
    clearTimeout(timer);
  }
}

function explainStatus(status: number): string {
  if (status === 401) return "Harbor rejected the key. Paste the whole read-write hbr_ key.";
  if (status === 403) return "That key is read-only. Create a read-write key.";
  if (status === 404) return "That address is not Harbor. Paste only the https tunnel address.";
  return `Harbor answered ${status}.`;
}

function readClock(): Record<string, number> {
  const raw = persist.getString(CLOCK_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeClock(id: string, updatedAt: number): void {
  const clocks = readClock();
  clocks[id] = updatedAt;
  persist.set(CLOCK_KEY, JSON.stringify(clocks));
}

function readTombstones(): Tombstone[] {
  const raw = persist.getString(TOMBSTONE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Tombstone[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clearTombstone(id: string): void {
  const next = readTombstones().filter((row) => row.id !== id);
  persist.set(TOMBSTONE_KEY, JSON.stringify(next));
}
