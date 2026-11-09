/**
 * App state hub — React Context + useReducer. The reducer holds shared state;
 * async action methods wrap the pure lib/ layer (parse, store, queue, …) and
 * dispatch plain updates. Components never touch lib/ persistence directly.
 *
 * Offline-first: parseCapture checks capability at call time and either parses
 * (online + linked) or enqueues (queued, auto-drained on reconnect). Capture
 * never errors.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { AppState as AppLifecycle } from 'react-native';
import type {
  AiLink,
  Capability,
  CmpField,
  Correction,
  LogEntry,
  Payload,
  QueuedCapture,
  Rec,
  Snapshot,
} from '../types';
import { store } from '../lib/store';
import { installSync } from '../lib/sync';
import { loadAiLink, saveAiLink, loadVoice, saveVoice } from '../lib/settings';
import { computeCapability, fetchOnline, subscribeOnline } from '../lib/connectivity';
import { parseWithGemini, type RetryInfo } from '../lib/parse';
import { runChecks, statusSummary } from '../lib/checks';
import { duplicateIds, localEngine, parseWhen, sortByWhen, type QueryResult } from '../lib/query';
import { findNearMatch, applyUpdate } from '../lib/match';
import {
  buildExamples,
  diffPending,
  loadCorrections,
  prependCorrections,
  saveCorrections,
  snapshot,
  type LastInput,
} from '../lib/corrections';
import { addLog, clearLog as clearLogFile, exportLog as exportLogFile, loadLog, saveLog } from '../lib/log';
import { clearBackup, loadBackup, saveBackup } from '../lib/backup';
import { drainQueue, enqueue, loadQueue, saveQueue } from '../lib/queue';
import { persist } from '../lib/persist';
import { makeThumb } from '../lib/thumb';
import { shareJSON } from '../lib/share';
import { id } from '../lib/datetime';
import { type PastedItem } from '../lib/pastedText';
import { addTagToText, normalizeTag, recordTags } from '../lib/categories';
import { inferVoiceCommand, parseVoiceCommand, sameSaveShape, voiceNoteType, voiceSaveShape, type VoiceSaveShape } from '../lib/command';

/** The five fielded inputs of the Text tab's local authoring form. */
export interface TypedFields {
  what: string;
  when: string;
  where: string;
  who: string;
  notes: string;
}

export type StatusKind = 'work' | 'done' | 'warn' | 'err';
export interface StatusLine {
  kind: StatusKind;
  text: string;
}

/** A save-time near-match awaiting the user's decision (the modal renders this). */
export interface NearMatchPrompt {
  pending: Rec; // the just-parsed record being saved
  existing: Rec; // the overlapping record already in the store
}
export type NearMatchAction = 'update' | 'create' | 'keep';

interface AppState {
  saved: Rec[];
  pending: Rec[];
  pendingOriginals: Record<string, Snapshot>;
  lastInput: LastInput | null;
  corrections: Correction[];
  useExamples: boolean;
  speakOn: boolean; // 🔊 — spoken answers + voice read-back (session-only, shared by ask bar + capture)
  log: LogEntry[];
  link: AiLink;
  voiceId: string; // selected TTS voice ('' = system default / not yet picked)
  queue: QueuedCapture[];
  online: boolean;
  status: StatusLine | null;
  booted: boolean;
  nearMatch: NearMatchPrompt | null; // the current save-time duplicate prompt, or null
  editRequest: { rec: Rec; nonce: number } | null; // Edit was asked for this record — Capture fills its Text form from it
}

/** Field compare. JSON.stringify would rebuild every photo thumbnail already on the phone. */
function recordChanged(old: Rec, next: Rec): boolean {
  return (
    old.type !== next.type ||
    old.title !== next.title ||
    old.date !== next.date ||
    old.time !== next.time ||
    old.location !== next.location ||
    old.people !== next.people ||
    old.notes !== next.notes ||
    old.via !== next.via ||
    old.imageId !== next.imageId ||
    old.thumb !== next.thumb
  );
}

const initialState: AppState = {
  saved: [],
  pending: [],
  pendingOriginals: {},
  lastInput: null,
  corrections: [],
  useExamples: true,
  speakOn: true,
  log: [],
  link: { provider: 'gemini', apiKey: '', model: 'gemini-2.5-flash' },
  voiceId: '',
  queue: [],
  online: false,
  status: null,
  booted: false,
  nearMatch: null,
  editRequest: null,
};

type Action =
  | { type: 'boot'; payload: Partial<AppState> & { booted: true } }
  | { type: 'setOnline'; online: boolean }
  | { type: 'setStatus'; status: StatusLine | null }
  | { type: 'setLink'; link: AiLink }
  | { type: 'setVoice'; voiceId: string }
  | { type: 'setSaved'; saved: Rec[] }
  | { type: 'setLog'; log: LogEntry[] }
  | { type: 'setCorrections'; corrections: Correction[] }
  | { type: 'setQueue'; queue: QueuedCapture[] }
  | { type: 'toggleExamples' }
  | { type: 'setSpeakOn'; on: boolean }
  | {
      type: 'setPending';
      pending: Rec[];
      originals: Record<string, Snapshot>;
      lastInput: LastInput | null;
    }
  | { type: 'editPending'; id: string; field: CmpField; value: string | null }
  | { type: 'removePending'; id: string }
  | { type: 'clearPending' }
  | { type: 'setNearMatch'; nearMatch: NearMatchPrompt | null }
  | { type: 'setEditRequest'; editRequest: { rec: Rec; nonce: number } | null };

function reducer(state: AppState, a: Action): AppState {
  switch (a.type) {
    case 'boot':
      return { ...state, ...a.payload };
    case 'setOnline':
      return { ...state, online: a.online };
    case 'setStatus':
      return { ...state, status: a.status };
    case 'setLink':
      return { ...state, link: a.link };
    case 'setVoice':
      return { ...state, voiceId: a.voiceId };
    case 'setSaved':
      return { ...state, saved: a.saved };
    case 'setLog':
      return { ...state, log: a.log };
    case 'setCorrections':
      return { ...state, corrections: a.corrections };
    case 'setQueue':
      return { ...state, queue: a.queue };
    case 'toggleExamples':
      return { ...state, useExamples: !state.useExamples };
    case 'setSpeakOn':
      return { ...state, speakOn: a.on };
    case 'setPending':
      return {
        ...state,
        pending: a.pending,
        pendingOriginals: a.originals,
        lastInput: a.lastInput,
      };
    case 'editPending':
      return {
        ...state,
        pending: state.pending.map((r) =>
          r.id === a.id ? { ...r, [a.field]: a.value } : r,
        ),
      };
    case 'removePending':
      return { ...state, pending: state.pending.filter((r) => r.id !== a.id) };
    case 'clearPending':
      return { ...state, pending: [], pendingOriginals: {}, lastInput: null };
    case 'setNearMatch':
      return { ...state, nearMatch: a.nearMatch };
    case 'setEditRequest':
      return { ...state, editRequest: a.editRequest };
    default:
      return state;
  }
}

export interface AppActions {
  setStatus: (kind: StatusKind, text: string) => void;
  clearStatus: () => void;
  saveLink: (link: AiLink) => void;
  /** Settings → the key just restored from a private backup. */
  reloadLink: () => void;
  setVoiceId: (identifier: string) => void;
  loadSample: () => void;
  parseCapture: (payload: Payload) => Promise<void>;
  addTypedRecord: (fields: TypedFields, editingId?: string | null, via?: string, type?: string) => Rec | null;
  /** Pasted text: one record per question and answer, saved on the phone. */
  addPastedFacts: (items: PastedItem[]) => number;
  saveVoiceNote: (transcript: string) => Promise<Rec | null>; // local-first voice (decide-once)
  editPendingField: (recId: string, field: CmpField, value: string | null) => void;
  removePending: (recId: string) => void;
  clearCapture: () => void; // discard pending review + clear the status line ("start fresh")
  savePending: () => void;
  resolveNearMatch: (action: NearMatchAction) => void; // decide the current duplicate prompt
  removeSaved: (recId: string) => void;
  /** Remove this note, schedule, or event and every copy saved with the same words. */
  dropSavedCopies: (rec: Rec) => void;
  /**
   * Drop saves of the misheard line (and copies). `kept` is the corrected save when one is
   * already stored, so the caller does not write a second one. `removed` is true when a
   * wrong note, schedule, or event was cleared.
   */
  replaceMisheardSave: (wrongText: string, rightText: string, saved?: Rec | null) => { kept: Rec | null; removed: boolean };
  removeDuplicates: () => number; // exact-content dups only; returns how many were removed
  clearLog: () => void; // capture log only
  clearAllData: () => boolean; // start fresh (backup first); false = backup failed, nothing deleted
  resetBackupInfo: () => { ts: number; count: number } | null; // what Undo would bring back
  undoReset: () => number; // restore the last reset's backup; returns records restored
  discardResetBackup: () => void; // delete the backup (Undo no longer possible)
  runQuery: (q: string) => QueryResult;
  /** Edit (variant experiment): open the Text form pre-filled with this record. */
  requestEdit: (rec: Rec) => void;
  /** Edit request consumed — the Text form has it now. */
  clearEditRequest: () => void;
  /**
   * Category (variant experiment): add "#category" to the record's notes and
   * save it back through the normal path (Harbor copy updates too). Returns
   * what happened: 'added' with the updated record, 'already' when the
   * record is already in that category, 'gone' when it is no longer saved.
   */
  setRecordCategory: (rec: Rec, category: string) => { rec: Rec | null; status: 'added' | 'already' | 'gone' };
  toggleExamples: () => void;
  setSpeakOn: (on: boolean) => void;
  exportSaved: () => Promise<void>;
  exportLog: () => Promise<void>;
  exportCorrections: () => Promise<void>;
  logFileRouting: (detectedType: string, message: string) => void;
  getImage: (imageId: string | null) => string | null;
  capability: Capability;
}

const Ctx = createContext<{ state: AppState; actions: AppActions } | null>(null);

/** Capture-log note describing how a file was routed (empty for camera/voice/typed). */
function routeNote(payload: Payload): string[] {
  if (!payload.detectedType) return [];
  return [`route: ${payload.detectedType}${payload.route ? ` · sent as ${payload.route}` : ''}`];
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Latest-state ref for async actions (avoids stale closures).
  const stateRef = useRef(state);
  stateRef.current = state;

  // Session-only full-res images (imageId -> data/file uri). Dropped on save.
  const imagesRef = useRef<Record<string, string>>({});

  // Harbor is the HTTPS copy Muse reads. The phone stays the source when offline.
  const sync = useRef(
    installSync({
      load: () => store.all(),
      save: (records) => {
        store.save(records);
        dispatch({ type: 'setSaved', saved: records });
      },
    }),
  ).current;

  const publish = useCallback((saved: Rec[], previous: Rec[]) => {
    store.save(saved);
    dispatch({ type: 'setSaved', saved });
    const prevById = new Map(previous.map((record) => [record.id, record]));
    const changed: Rec[] = [];
    for (const record of saved) {
      const old = prevById.get(record.id);
      if (!old || recordChanged(old, record)) changed.push(record);
    }
    if (changed.length === 1) sync.afterSave(changed[0]);
    else if (changed.length > 1) sync.afterSaveMany(changed);
  }, [sync]);

  // In-flight parse control: the AbortController cancels the live fetch/backoff;
  // the monotonic token invalidates a late-resolving attempt so it can't re-populate
  // the status line after Clear/Cancel or after a newer parse superseded it.
  const parseAbort = useRef<AbortController | null>(null);
  const parseToken = useRef(0);

  const capability = useMemo(
    () => computeCapability(state.online, state.link),
    [state.online, state.link],
  );
  const capRef = useRef(capability);
  capRef.current = capability;

  /* ---------------- boot ---------------- */
  useEffect(() => {
    dispatch({
      type: 'boot',
      payload: {
        saved: store.load(),
        corrections: loadCorrections(),
        log: loadLog(),
        link: loadAiLink(),
        voiceId: loadVoice(),
        queue: loadQueue(),
        booted: true,
      },
    });
    fetchOnline().then((online) => dispatch({ type: 'setOnline', online }));
    const unsub = subscribeOnline((online) => dispatch({ type: 'setOnline', online }));
    void sync.start();
    return unsub;
  }, [sync]);

  // Harbor is the copy Muse writes. Pull it into Saved while the app is open,
  // and again as soon as the app returns to the foreground.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const pull = () => {
      void sync.start();
    };
    const arm = () => {
      pull();
      if (timer) clearInterval(timer);
      timer = setInterval(pull, 20000);
    };
    const disarm = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    if (AppLifecycle.currentState === 'active') arm();
    const sub = AppLifecycle.addEventListener('change', (next) => {
      if (next === 'active') arm();
      else disarm();
    });
    return () => {
      sub.remove();
      disarm();
    };
  }, [sync]);

  const setStatus = useCallback((kind: StatusKind, text: string) => {
    dispatch({ type: 'setStatus', status: { kind, text } });
  }, []);
  const clearStatus = useCallback(() => dispatch({ type: 'setStatus', status: null }), []);

  /* ---------------- one parse attempt (shared by live + drain) ---------------- */
  // The parser is source-agnostic now (no scope): it auto-detects the content
  // type and extracts/describes into the unified record. Returns the records
  // (with via/imageId/thumb attached) plus the log entry.
  const runParseAttempt = useCallback(
    async (
      payload: Payload,
      opts?: { signal?: AbortSignal; onRetry?: (info: RetryInfo) => void },
    ): Promise<{ records: Rec[]; logEntry: Omit<LogEntry, 'id' | 'ts'> }> => {
      const s = stateRef.current;
      const examples = buildExamples(s.corrections, s.useExamples);
      const { records, rawText, parsedOk, mode, detectedTypes, attempts, uploadNote, truncatedNotes } =
        await parseWithGemini({
          payload,
          link: s.link,
          examples,
          signal: opts?.signal,
          onRetry: opts?.onRetry,
        });

      let imageId: string | null = null;
      let thumb: string | null = null;
      if (payload.kind === 'image') {
        imageId = id('img');
        const fullUri = payload.uri ?? `data:${payload.mediaType};base64,${payload.data}`;
        imagesRef.current[imageId] = fullUri; // session full-res
        thumb = await makeThumb(fullUri);
      }
      const pasted = payload.label === 'Pasted text';
      const withMeta = records.map((r) => {
        const base = { ...r, via: payload.label, imageId, thumb };
        if (!pasted) return base;
        // The question is the title and the answer is the notes. A date or a name inside
        // either one stays in the words — it is not a calendar event.
        const title = (r.title || '').replace(/^\d+\.\s*/, '').trim() || 'Untitled';
        let notes = (r.notes || '').replace(/^\s*answer:\s*/i, '').trim();
        const hay = `${title} ${notes}`;
        const kept = [r.date, r.time, r.location, r.people].filter((v): v is string => !!v && !hay.includes(v));
        if (kept.length) notes = [notes, ...kept].filter(Boolean).join(' · ');
        return {
          ...base,
          type: 'fact',
          date: null,
          time: null,
          location: null,
          people: null,
          title,
          notes: notes || null,
        };
      });
      const verdict = runChecks(withMeta, parsedOk);
      const typeNote = `detected: ${detectedTypes.join(', ') || '—'}`;
      const logEntry: Omit<LogEntry, 'id' | 'ts'> = {
        label: payload.label,
        kind: payload.kind,
        thumb,
        count: withMeta.length,
        status: verdict.status,
        notes: [
          ...routeNote(payload),
          typeNote,
          `mode: ${mode}`,
          `records: ${withMeta.length}`,
          ...truncatedNotes,
          ...(uploadNote ? [uploadNote] : []),
          ...(attempts.length ? [`retries: ${attempts.join(' · ')}`] : []),
          ...verdict.notes,
        ],
        raw: rawText,
        parsed: withMeta.map((r) => ({
          type: r.type,
          title: r.title,
          date: r.date,
          time: r.time,
          location: r.location,
          people: r.people,
          notes: r.notes,
        })),
      };
      return { records: withMeta, logEntry };
    },
    [],
  );

  /* ---------------- capability-aware capture ---------------- */
  const parseCapture = useCallback(
    async (payload: Payload) => {
      const s = stateRef.current;
      // Don't stack on a previous attempt: drop any prior (unsaved) pending review
      // before starting, so a fresh parse never layers under stale results.
      if (s.pending.length) dispatch({ type: 'clearPending' });

      // Precondition not met → queue, never error. Be explicit about WHICH one failed
      // (offline vs no key) in both the log note and the user-facing status.
      if (!capRef.current.canParse) {
        const offline = !capRef.current.online;
        let thumb: string | null = null;
        if (payload.kind === 'image') {
          const fullUri = payload.uri ?? `data:${payload.mediaType};base64,${payload.data}`;
          thumb = await makeThumb(fullUri);
        }
        const queue = enqueue(s.queue, { payload });
        dispatch({ type: 'setQueue', queue });
        const log = addLog(stateRef.current.log, {
          label: payload.label,
          kind: payload.kind,
          thumb,
          count: 0,
          status: 'warn',
          notes: [...routeNote(payload), offline ? 'queued (offline)' : 'queued (no AI key)'],
          raw: '',
          parsed: [],
        });
        dispatch({ type: 'setLog', log });
        setStatus(
          'warn',
          offline
            ? 'Saved — offline, will parse automatically when reconnected.'
            : 'Saved — add your Gemini key in Settings to parse this.',
        );
        return;
      }

      // Online + linked → parse now, under a cancellable per-attempt 60s deadline.
      // The token makes THIS the attempt that owns the status line; a Clear/Cancel or
      // a newer parse bumps it, after which a late resolve here is ignored.
      const token = (parseToken.current += 1);
      const controller = new AbortController();
      parseAbort.current = controller;
      const isCurrent = () => parseToken.current === token;

      // Lazy thumbnail for the capture log (only the image kind has one).
      const makeThumbFor = async (): Promise<string | null> => {
        if (payload.kind !== 'image') return null;
        const fullUri = payload.uri ?? `data:${payload.mediaType};base64,${payload.data}`;
        return makeThumb(fullUri);
      };

      setStatus('work', `Reading "${payload.label}"…`);
      try {
        const { records, logEntry } = await runParseAttempt(payload, {
          signal: controller.signal,
          onRetry: (info) => {
            if (isCurrent()) setStatus('work', info.reason);
          },
        });
        if (!isCurrent()) return; // cancelled / superseded — drop this late result
        parseAbort.current = null;
        const log = addLog(stateRef.current.log, logEntry);
        dispatch({ type: 'setLog', log });
        const verdict = { status: logEntry.status, notes: logEntry.notes };
        if (!records.length) {
          dispatch({ type: 'clearPending' });
          setStatus(
            logEntry.status === 'fail' ? 'err' : 'warn',
            statusSummary(verdict, 0) + ' — logged. Try a clearer image or add it as text.',
          );
          return;
        }
        const originals: Record<string, Snapshot> = {};
        records.forEach((r) => (originals[r.id] = snapshot(r)));
        const lastInput: LastInput = {
          instruction: '', // no scope — corrections steer purely by the diff
          inputKind: payload.kind,
          inputText: payload.kind !== 'image' ? String(payload.data).slice(0, 600) : null,
        };
        dispatch({ type: 'setPending', pending: records, originals, lastInput });
        setStatus(logEntry.status === 'ok' ? 'work' : 'warn', statusSummary(verdict, records.length));
      } catch (err: any) {
        // Every failure outcome is logged — no parse may be invisible (incl. timeout,
        // cancel, exhausted-retry). The `attempts` breakdown rides on the error.
        const attempts: string[] = Array.isArray(err?.attempts) ? err.attempts : [];

        // User cancelled (Clear / Cancel) → log for visibility, but NEVER touch the
        // status line: clearCapture already cleared it, or a newer parse now owns it.
        if (err?.isCancel) {
          const thumb = await makeThumbFor();
          const log = addLog(stateRef.current.log, {
            label: payload.label,
            kind: payload.kind,
            thumb,
            count: 0,
            status: 'warn',
            notes: [
              ...routeNote(payload),
              `cancelled by user${attempts.length ? ` · ${attempts.join(' · ')}` : ''}`,
            ],
            raw: '',
            parsed: [],
          });
          dispatch({ type: 'setLog', log });
          return;
        }

        if (!isCurrent()) return; // superseded by a newer parse — ignore late error
        parseAbort.current = null;

        // Classify the REAL cause — never collapse into "no internet":
        //  (a) timeout (err.isTimeout) → clean deadline failure; manual re-tap (image kept).
        //  (b) HTTP error RESPONSE (err.status) → server reachable; 5xx is "busy, retry".
        //  (c) THROWN fetch that looks like transport → genuine offline; queue for drain.
        //  (d) anything else → surface the real message.
        const msg = String(err?.message ?? 'unknown');
        const httpStatus: number | null = typeof err?.status === 'number' ? err.status : null;
        const isTimeout = !!err?.isTimeout;
        const transport =
          !isTimeout &&
          httpStatus == null &&
          /network|fetch|resolve host|unknownhost|timeout|timed out|failed to connect/i.test(msg);

        let note: string;
        let tone: StatusKind;
        let userMsg: string;
        if (isTimeout) {
          note = 'parse timed out (60s)';
          tone = 'err';
          userMsg = 'Gemini didn’t respond in time — tap Parse to try again.';
        } else if (httpStatus != null) {
          note = `gemini HTTP ${httpStatus}: ${msg}`;
          tone = 'err';
          userMsg =
            httpStatus >= 500
              ? `Gemini busy (HTTP ${httpStatus}) — tap Parse to try again.`
              : `Gemini error (HTTP ${httpStatus}) — see capture log.`;
        } else if (transport) {
          note = `transport failed (queued): ${msg}`;
          tone = 'warn';
          userMsg = 'Saved — connection failed, will retry when reconnected.';
        } else {
          note = `parse failed: ${msg}`;
          tone = 'err';
          userMsg = 'Parse failed: ' + msg + '. See capture log.';
        }

        const thumb = await makeThumbFor();
        // Preserve offline-first: only a genuine transport throw queues for drain. A
        // 503/timeout keeps the image in the capture zone (Capture retains `payload`)
        // so the user can re-tap Parse with the image still in hand.
        if (transport) {
          const queue = enqueue(stateRef.current.queue, { payload });
          dispatch({ type: 'setQueue', queue });
        }
        const log = addLog(stateRef.current.log, {
          label: payload.label,
          kind: payload.kind,
          thumb,
          count: 0,
          status: transport ? 'warn' : 'fail',
          notes: [
            ...routeNote(payload),
            note,
            ...(attempts.length ? [`attempts: ${attempts.join(' · ')}`] : []),
          ],
          raw: '',
          parsed: [],
        });
        dispatch({ type: 'setLog', log });
        setStatus(tone, userMsg);
      }
    },
    [runParseAttempt, setStatus],
  );

  /* ---------------- drain queued captures on reconnect ---------------- */
  const draining = useRef(false);
  const drainNow = useCallback(async () => {
    if (draining.current) return;
    if (!capRef.current.canParse) return;
    const q = stateRef.current.queue;
    if (!q.length) return;
    draining.current = true;
    let parsedCount = 0;
    try {
      const remaining = await drainQueue(q, async (item) => {
        const { records, logEntry } = await runParseAttempt(item.payload);
        const log = addLog(stateRef.current.log, logEntry);
        dispatch({ type: 'setLog', log });
        if (records.length) {
          const saved = [...records, ...stateRef.current.saved];
          publish(saved, stateRef.current.saved);
          parsedCount += records.length;
        }
        return true; // handled (parsed or empty) — remove from queue
      });
      dispatch({ type: 'setQueue', queue: remaining });
      if (parsedCount) {
        setStatus('work', `✓ Auto-parsed ${parsedCount} queued item${parsedCount === 1 ? '' : 's'}.`);
      }
    } finally {
      draining.current = false;
    }
  }, [runParseAttempt, setStatus, publish]);

  // Auto-drain whenever capability becomes available and there's a queue.
  useEffect(() => {
    if (capability.canParse && state.queue.length) void drainNow();
  }, [capability.canParse, state.queue.length, drainNow]);

  /* ---------------- pending edit / save ---------------- */
  const editPendingField = useCallback((recId: string, field: CmpField, value: string | null) => {
    dispatch({ type: 'editPending', id: recId, field, value: value ?? null });
  }, []);
  const removePending = useCallback((recId: string) => {
    dispatch({ type: 'removePending', id: recId });
  }, []);
  // "Start fresh" / Cancel: abort any in-flight parse (stops the live fetch AND any
  // pending backoff), invalidate its token so a late resolve can't re-populate the
  // status, then drop the pending review and clear the status line.
  const clearCapture = useCallback(() => {
    parseAbort.current?.abort();
    parseAbort.current = null;
    parseToken.current += 1;
    dispatch({ type: 'clearPending' });
    dispatch({ type: 'setStatus', status: null });
  }, []);

  // ---- save-time near-match resolution (savePending only; drainNow is a known gap) ----
  // The session lives in a ref (transient orchestration); the CURRENT prompt is mirrored
  // in state.nearMatch so the modal can render it. `working` is the final saved array being
  // built (starts as the live saved set), `queue` the remaining pending records to resolve.
  const nmSession = useRef<{ queue: Rec[]; working: Rec[]; originalPending: Rec[] } | null>(null);

  // All pending resolved → one store.save of the built array (mirrors the old single write).
  const finishResolution = useCallback(() => {
    const sess = nmSession.current;
    if (!sess) return;
    publish(sess.working, stateRef.current.saved);
    // drop full-res session images for every record we just resolved — thumbnails persist
    sess.originalPending.forEach((r) => {
      if (r.imageId) delete imagesRef.current[r.imageId];
    });
    nmSession.current = null;
    dispatch({ type: 'setNearMatch', nearMatch: null });
    dispatch({ type: 'clearPending' });
    setStatus('work', '✓ Saved to device. You can now ask about these offline.');
    setTimeout(() => clearStatus(), 2600);
  }, [setStatus, clearStatus, publish]);

  // Walk the pending queue: no-candidate records commit straight into `working`; the first
  // record with a near-match raises the prompt and pauses until resolveNearMatch advances.
  const processNext = useCallback(() => {
    const sess = nmSession.current;
    if (!sess) return;
    while (sess.queue.length) {
      const p = sess.queue[0];
      const cand = findNearMatch(p, sess.working);
      if (cand) {
        dispatch({ type: 'setNearMatch', nearMatch: { pending: p, existing: cand.existing } });
        return; // wait for the user (resolveNearMatch)
      }
      sess.queue.shift(); // no near-match → create normally (current behavior)
      sess.working = [p, ...sess.working];
    }
    finishResolution();
  }, [finishResolution]);

  const resolveNearMatch = useCallback(
    (action: NearMatchAction) => {
      const sess = nmSession.current;
      if (!sess) return;
      const prompt = stateRef.current.nearMatch;
      const p = sess.queue.shift(); // the record currently prompted (queue[0])
      if (p) {
        if (action === 'update' && prompt) {
          const merged = applyUpdate(prompt.existing, p); // pending fields onto existing, same id
          sess.working = sess.working.map((r) => (r.id === prompt.existing.id ? merged : r));
        } else if (action === 'create') {
          sess.working = [p, ...sess.working]; // keep both — pending as a new record
        } // 'keep' → discard the pending record (existing untouched)
      }
      dispatch({ type: 'setNearMatch', nearMatch: null });
      processNext();
    },
    [processNext],
  );

  const savePending = useCallback(() => {
    const s = stateRef.current;
    // diff edits/deletes vs the model's originals → corrections (training data)
    const added = diffPending(s.pendingOriginals, s.pending, s.lastInput);
    if (added.length) {
      const corrections = prependCorrections(s.corrections, added);
      saveCorrections(corrections);
      dispatch({ type: 'setCorrections', corrections });
    }
    // Resolve each pending record against the saved set (prompt on a near-match), then a
    // single store.save of the built array happens in finishResolution.
    nmSession.current = { queue: [...s.pending], working: [...s.saved], originalPending: s.pending };
    processNext();
  }, [processNext]);

  const removeSaved = useCallback((recId: string) => {
    const saved = store.remove(recId);
    dispatch({ type: 'setSaved', saved });
    sync.afterDelete(recId);
  }, [sync]);

  /** Edit (variant experiment): open the Text form pre-filled with this record. */
  const requestEdit = useCallback((rec: Rec) => {
    dispatch({ type: 'setEditRequest', editRequest: { rec, nonce: Date.now() } });
  }, []);
  const clearEditRequest = useCallback(() => {
    dispatch({ type: 'setEditRequest', editRequest: null });
  }, []);

  /**
   * Category (variant experiment): add "#category" to the record's notes and
   * save it back through the normal path, so the Harbor copy updates too.
   * Returns the updated record, or null when it was already in that category
   * (or no longer saved).
   */
  const setRecordCategory = useCallback(
    (rec: Rec, category: string): { rec: Rec | null; status: 'added' | 'already' | 'gone' } => {
      const name = normalizeTag(category);
      const prev = stateRef.current.saved;
      if (!prev.some((r) => r.id === rec.id)) return { rec: null, status: 'gone' };
      // The tag may already be in the title — check the whole record, not
      // just the notes, or the tag gets appended twice (title + notes).
      if (!name || recordTags(rec).includes(name)) return { rec: null, status: 'already' };
      const notes = addTagToText(rec.notes ?? '', name);
      if (notes === (rec.notes ?? '')) return { rec: null, status: 'already' };
      const next: Rec = { ...rec, notes: notes || null };
      publish(prev.map((r) => (r.id === rec.id ? next : r)), prev);
      return { rec: next, status: 'added' };
    },
    [publish],
  );

  const isPrivateType = (type: string) => type === 'private' || type === 'private-note' || type === 'private-doc';

  const shapeOf = (r: Rec): VoiceSaveShape => ({
    type: r.type,
    title: r.title,
    date: r.date,
    time: r.time,
    location: r.location,
    people: r.people,
    notes: r.notes,
  });

  const dropIds = useCallback((ids: string[]) => {
    if (!ids.length) return;
    const saved = store.removeMany(ids);
    dispatch({ type: 'setSaved', saved });
    sync.afterDeleteMany(ids);
  }, [sync]);

  const dropSavedCopies = useCallback((rec: Rec) => {
    if (isPrivateType(rec.type)) return;
    const shape = shapeOf(rec);
    const ids = stateRef.current.saved.filter((r) => !isPrivateType(r.type) && sameSaveShape(r, shape)).map((r) => r.id);
    dropIds(ids);
  }, [dropIds]);

  const replaceMisheardSave = useCallback((wrongText: string, rightText: string, saved?: Rec | null): { kept: Rec | null; removed: boolean } => {
    const now = new Date();
    const wrong = voiceSaveShape(wrongText, now);
    const right = voiceSaveShape(rightText, now);
    const fromRec = saved && !isPrivateType(saved.type) ? shapeOf(saved) : null;
    const prev = stateRef.current.saved;
    const drop = new Set<string>();
    for (const r of prev) {
      if (isPrivateType(r.type)) continue;
      const hitWrong = (wrong && sameSaveShape(r, wrong)) || (fromRec && sameSaveShape(r, fromRec));
      const hitRight = !!(right && sameSaveShape(r, right));
      if (hitWrong && !hitRight) drop.add(r.id);
    }
    dropIds([...drop]);
    const left = drop.size ? store.load() : prev;
    const kept = right ? left.find((r) => !isPrivateType(r.type) && sameSaveShape(r, right)) ?? null : null;
    return { kept, removed: drop.size > 0 };
  }, [dropIds]);

  /* ---------------- cleanup (Saved / Capture log headers) ---------------- */
  // Exact-content duplicates only (same key as the query-time dedup); the newest copy
  // of each identical group survives. Deletes reach Harbor, like a single delete.
  const removeDuplicates = useCallback((): number => {
    const ids = duplicateIds(store.load());
    if (!ids.length) return 0;
    const saved = store.removeMany(ids);
    dispatch({ type: 'setSaved', saved });
    sync.afterDeleteMany(ids);
    return ids.length;
  }, [sync]);

  const clearLog = useCallback(() => {
    dispatch({ type: 'setLog', log: clearLogFile() });
  }, []);

  // Start fresh. Removes every saved record (on the phone AND on Harbor), the capture
  // log, the offline queue, and learned corrections, and drops any capture in review.
  // KEPT: the AI key/model, the Harbor link, and the voice choice (Settings).
  // A backup is written FIRST and must read back intact, or nothing is deleted.
  const clearAllData = useCallback((): boolean => {
    const ok = saveBackup({
      ts: Date.now(),
      saved: store.load(),
      log: loadLog(),
      queue: loadQueue(),
      corrections: loadCorrections(),
    });
    if (!ok) return false;

    parseAbort.current?.abort();
    parseAbort.current = null;
    parseToken.current += 1;
    nmSession.current = null;
    dispatch({ type: 'setNearMatch', nearMatch: null });
    dispatch({ type: 'clearPending' });
    dispatch({ type: 'setStatus', status: null });
    imagesRef.current = {};

    const ids = store.load().map((r) => r.id);
    store.save([]);
    dispatch({ type: 'setSaved', saved: [] });
    sync.afterDeleteMany(ids);

    dispatch({ type: 'setLog', log: clearLogFile() });
    saveQueue([]);
    dispatch({ type: 'setQueue', queue: [] });
    saveCorrections([]);
    dispatch({ type: 'setCorrections', corrections: [] });
    persist.trim(); // MMKV never shrinks on its own (the test phone's file is 128MB)
    return true;
  }, [sync]);

  const resetBackupInfo = useCallback(() => {
    const b = loadBackup();
    return b ? { ts: b.ts, count: b.saved.length } : null;
  }, []);

  // Undo the last reset: merge the backup back in alongside anything captured since
  // (ids already present are left alone), re-upload the restored records to Harbor,
  // then drop the backup.
  const undoReset = useCallback((): number => {
    const b = loadBackup();
    if (!b) return 0;
    const current = store.load();
    const have = new Set(current.map((r) => r.id));
    const restored = b.saved.filter((r) => !have.has(r.id));
    const saved = [...current, ...restored];
    store.save(saved);
    dispatch({ type: 'setSaved', saved });
    sync.afterRestore(restored);

    saveLog([...loadLog(), ...b.log]);
    dispatch({ type: 'setLog', log: loadLog() });
    const q = loadQueue();
    const qIds = new Set(q.map((c) => c.id));
    const queue = [...q, ...b.queue.filter((c) => !qIds.has(c.id))];
    saveQueue(queue);
    dispatch({ type: 'setQueue', queue });
    saveCorrections([...loadCorrections(), ...b.corrections]);
    dispatch({ type: 'setCorrections', corrections: loadCorrections() });

    clearBackup();
    return restored.length;
  }, [sync]);

  const discardResetBackup = useCallback(() => {
    clearBackup();
    persist.trim();
  }, []);

  /* ---------------- file router rejection → capture log ---------------- */
  const logFileRouting = useCallback((detectedType: string, message: string) => {
    const log = addLog(stateRef.current.log, {
      label: 'file router',
      kind: 'file',
      thumb: null,
      count: 0,
      status: 'fail',
      notes: [`route: ${detectedType}`, message],
      raw: '',
      parsed: [],
    });
    dispatch({ type: 'setLog', log });
  }, []);

  /* ---------------- query ---------------- */
  const runQuery = useCallback((q: string): QueryResult => {
    return localEngine.run(stateRef.current.saved, q);
  }, []);

  /* ---------------- text tab: local fielded authoring (no Gemini) ---------------- */
  // Builds a unified record from the What/When/Where/Who/Notes form and saves it
  // straight to the store — instantly queryable, fully offline. Returns false if
  // there's nothing to save. "When" goes through the same local date interpreter.
  // Returns the saved record (for the confirmation card) or null if there's
  // nothing to save. Pass `editingId` to update that record in place instead of
  // inserting a new one (the "Edit" round-trip from the confirmation).
  const addTypedRecord = useCallback(
    (f: TypedFields, editingId?: string | null, via: string = 'typed', type?: string): Rec | null => {
      const what = f.what.trim();
      const notes = f.notes.trim();
      if (!what && !notes) {
        setStatus('warn', 'Add a “what” or a note before saving.');
        return null;
      }
      const { date, time } = parseWhen(f.when || '');
      // Who → people: normalize "Sam and Priya" / "Sam, Priya" → "Sam, Priya".
      const people =
        f.who
          .split(/\s*(?:,|\band\b)\s*/i)
          .map((s) => s.trim())
          .filter(Boolean)
          .join(', ') || null;
      // Editing keeps what the record IS (1.9.3): its type (reminder, appointment, invoice…),
      // where it came from, and its photo. Only the plain note/event default follows the date.
      const prior = editingId ? stateRef.current.saved.find((r) => r.id === editingId) : undefined;
      const defaultType = date ? 'event' : 'note';
      const keptType =
        prior && prior.type && prior.type !== 'event' && prior.type !== 'note' ? prior.type : defaultType;
      const rec: Rec = {
        id: editingId || id('e'),
        type: type ?? (prior ? keptType : defaultType), // a voice command says what it is (1.9.0)
        title: (what || notes).slice(0, 200) || 'Untitled',
        date,
        time,
        location: f.where.trim() || null,
        people,
        notes: notes || null,
        via: prior?.via ?? via, // 'typed' (Text tab), 'Voice note', 'Voice command' — kept on edit
        imageId: prior?.imageId ?? null,
        thumb: prior?.thumb ?? null,
      };
      const prev = stateRef.current.saved;
      const exists = editingId && prev.some((r) => r.id === editingId);
      const saved = exists ? prev.map((r) => (r.id === editingId ? rec : r)) : [rec, ...prev];
      publish(saved, prev);
      clearStatus(); // the confirmation card is the feedback now
      return rec;
    },
    [setStatus, clearStatus, publish],
  );

  /** One JSON-shaped record per pasted question. The answer is stored with it. */
  const addPastedFacts = useCallback(
    (items: PastedItem[]): number => {
      const made: Rec[] = [];
      for (const item of items) {
        const question = item.question.trim();
        const answer = item.answer.trim();
        if (!question) continue;
        made.push({
          id: id('e'),
          type: 'fact',
          title: question,
          date: null,
          time: null,
          location: null,
          people: null,
          notes: answer || null,
          via: 'Pasted text',
          imageId: null,
          thumb: null,
        });
      }
      if (!made.length) {
        setStatus('warn', 'Nothing to save.');
        return 0;
      }
      const prev = stateRef.current.saved;
      publish([...made, ...prev], prev);
      dispatch({
        type: 'setLog',
        log: addLog(stateRef.current.log, {
          label: 'Pasted text',
          kind: 'text',
          thumb: null,
          count: made.length,
          status: 'ok',
          notes: [`${made.length} separate items, saved on this phone`],
          raw: '',
          parsed: made.map((r) => ({
            type: r.type,
            title: r.title,
            date: r.date,
            time: r.time,
            location: r.location,
            people: r.people,
            notes: r.notes,
          })),
        }),
      });
      setStatus('done', `Saved ${made.length} item${made.length === 1 ? '' : 's'}. Each one is its own entry.`);
      return made.length;
    },
    [setStatus, publish],
  );

  /* ---------------- local-first voice capture (1.4.0) ----------------
   * Decide ONCE at capture, parse ONCE, then the record is FINAL — never enriched,
   * merged, re-parsed, or queued for later improvement (the user's "saved = final" rule):
   *   online + linked → LLM parse; ANY failure (or empty) → local save (never lost, never queued).
   *   offline / no key → local save directly (parseWhen for date/time, transcript → title/notes).
   * Because nothing ever updates an existing record, the drainNow near-match gap (inv. 17) is
   * not in play here. Trade (accepted): an offline/fallback voice record stays the SIMPLER shape
   * forever — it will NOT later gain the LLM who/where split. Instant + final over a fragile
   * background upgrade, matching the one-shot capture model. */
  const saveVoiceNote = useCallback(
    async (raw: string): Promise<Rec | null> => {
      const text = raw.trim();
      if (!text) {
        setStatus('warn', 'Nothing to save yet — tap the mic and speak.');
        return null;
      }
      // VOICE COMMAND (1.9.0): "set schedule …", "remind me to …", "note …" → read on the
      // phone (lib/command.ts) and saved straight away as that type — offline, instant, and
      // exactly the fields the user saw previewed. No Gemini for commands.
      const cmd = parseVoiceCommand(text);
      if (cmd) {
        const rec = addTypedRecord(cmd.fields, null, 'Voice command', cmd.kind);
        if (rec) {
          dispatch({
            type: 'setLog',
            log: addLog(stateRef.current.log, {
              label: 'Voice command',
              kind: 'text',
              thumb: null,
              count: 1,
              status: 'ok',
              notes: [`voice command “${cmd.trigger}” → ${cmd.kind} (read on phone)`],
              raw: text,
              parsed: [
                {
                  type: rec.type,
                  title: rec.title,
                  date: rec.date,
                  time: rec.time,
                  location: rec.location,
                  people: rec.people,
                  notes: rec.notes,
                },
              ],
            }),
          });
        }
        return rec;
      }

      const payload: Payload = { kind: 'text', data: text, label: 'Voice note' };

      // ONLINE + linked → parse ONCE with the LLM, save the rich record FINAL. Any failure
      // (503/429/timeout/transport/…) or an empty result falls through to the local save below.
      // `localReason` records WHY we went local, so the single local-save log line is accurate.
      let localReason: string;
      if (capRef.current.canParse) {
        setStatus('work', 'Reading your voice note…');
        try {
          const { records: parsed, logEntry } = await runParseAttempt(payload);
          // No trigger said (1.9.4): Gemini's label stands, but a to-do becomes "reminder" —
          // also when Gemini only says "note" for a plain job ("buy a bread on your way home").
          const records = parsed.map((r) => ({ ...r, type: voiceNoteType(r.type, text) }));
          if (records.length) {
            const saved = [...records, ...stateRef.current.saved];
            publish(saved, stateRef.current.saved);
            dispatch({
              type: 'setLog',
              log: addLog(stateRef.current.log, {
                ...logEntry,
                notes: [
                  'voice → LLM parse (final)',
                  `label ${records.map((r, i) => (r.type === parsed[i].type ? r.type : `${r.type} (Gemini said ${parsed[i].type})`)).join(', ')}`,
                  ...logEntry.notes,
                ],
              }),
            });
            clearStatus(); // the saved-confirmation card is the feedback
            return records[0];
          }
          localReason = 'voice → LLM returned nothing → local save';
        } catch (err: any) {
          // Decide-once: any LLM failure becomes a LOCAL save — NOT a queue, NOT an error toast.
          localReason = `voice → LLM failed (${String(err?.message ?? 'failed').slice(0, 100)}) → local save`;
        }
      } else {
        localReason = capRef.current.online ? 'voice → local save (no AI key)' : 'voice → local save (offline)';
      }

      // LOCAL save (offline, no key, or LLM failed/empty). No trigger was said, so the phone picks
      // the label (1.9.4, lib/command.ts inferVoiceCommand): a to-do → reminder, a day/time →
      // event, else note — fields read exactly as for a spoken command. A long transcript keeps
      // its full text in notes so the >200-char title cap never drops it.
      const inferred = inferVoiceCommand(text);
      const fields: TypedFields = {
        ...inferred.fields,
        notes: text.length > 200 ? text : inferred.fields.notes,
      };
      localReason += ` · label ${inferred.kind} (phone rules)`;
      const rec = addTypedRecord(fields, null, 'Voice note', inferred.kind);
      if (rec) {
        dispatch({
          type: 'setLog',
          log: addLog(stateRef.current.log, {
            label: 'Voice note',
            kind: 'text',
            thumb: null,
            count: 1,
            status: 'ok', // the capture succeeded with no data loss; localReason notes the path
            notes: [localReason],
            raw: '',
            parsed: [
              {
                type: rec.type,
                title: rec.title,
                date: rec.date,
                time: rec.time,
                location: rec.location,
                people: rec.people,
                notes: rec.notes,
              },
            ],
          }),
        });
      }
      return rec;
    },
    [runParseAttempt, addTypedRecord, setStatus, clearStatus],
  );

  /* ---------------- misc ---------------- */
  const toggleExamples = useCallback(() => dispatch({ type: 'toggleExamples' }), []);
  const setSpeakOn = useCallback((on: boolean) => dispatch({ type: 'setSpeakOn', on }), []);

  const setVoiceId = useCallback((identifier: string) => {
    saveVoice(identifier);
    dispatch({ type: 'setVoice', voiceId: identifier });
  }, []);

  const reloadLink = useCallback(() => {
    dispatch({ type: 'setLink', link: loadAiLink() });
  }, []);

  const saveLink = useCallback(
    (link: AiLink) => {
      saveAiLink(link);
      const fresh = loadAiLink();
      dispatch({ type: 'setLink', link: fresh });
      setStatus('work', '✓ Key saved on this device.');
      setTimeout(() => clearStatus(), 2600);
    },
    [setStatus, clearStatus],
  );

  const loadSample = useCallback(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const mk = (addDays: number, time: string, title: string, loc: string, notes: string | null): Rec => {
      const d = new Date(t);
      d.setDate(d.getDate() + addDays);
      const iso2 =
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0');
      return {
        id: id('e'),
        type: 'event',
        title,
        date: iso2,
        time,
        location: loc,
        people: null,
        notes,
        via: 'sample',
        imageId: null,
        thumb: null,
      };
    };
    const samples: Rec[] = [
      mk(0, '09:00', 'Team standup', 'Room 3', null),
      mk(1, '14:30', 'Dentist — Dr. Okafor', 'Downtown Dental', 'bring insurance card'),
      mk(3, '18:00', 'Dinner with Sam', 'Pike Place', null),
      mk(6, '10:00', 'Saturday market run', 'Ballard', null),
      mk(8, '11:00', 'Project review', 'Zoom', 'Q3 roadmap'),
      mk(9, '16:00', 'Yoga class', 'Riverside Studio', null),
      mk(12, '13:00', 'Lunch with Priya', 'Cafe Lago', null),
    ];
    const saved = [...samples, ...stateRef.current.saved];
    publish(saved, stateRef.current.saved);
    setStatus('work', '✓ Loaded a sample week. Try the chips to query it.');
    setTimeout(() => clearStatus(), 2600);
  }, [setStatus, clearStatus, publish]);

  const exportSaved = useCallback(
    () => shareJSON('captures.json', [...stateRef.current.saved].sort(sortByWhen)),
    [],
  );
  const exportLog = useCallback(() => exportLogFile(stateRef.current.log), []);
  const exportCorrections = useCallback(
    () => shareJSON('corrections.json', stateRef.current.corrections),
    [],
  );

  const getImage = useCallback(
    (imageId: string | null) => (imageId ? imagesRef.current[imageId] ?? null : null),
    [],
  );

  const actions = useMemo<AppActions>(
    () => ({
      setStatus,
      clearStatus,
      saveLink,
      reloadLink,
      setVoiceId,
      loadSample,
      parseCapture,
      addTypedRecord,
      addPastedFacts,
      saveVoiceNote,
      editPendingField,
      removePending,
      clearCapture,
      savePending,
      resolveNearMatch,
      removeSaved,
      dropSavedCopies,
      replaceMisheardSave,
      removeDuplicates,
      clearLog,
      clearAllData,
      resetBackupInfo,
      undoReset,
      discardResetBackup,
      runQuery,
      requestEdit,
      clearEditRequest,
      setRecordCategory,
      toggleExamples,
      setSpeakOn,
      exportSaved,
      exportLog,
      exportCorrections,
      logFileRouting,
      getImage,
      capability,
    }),
    [
      setStatus,
      clearStatus,
      saveLink,
      reloadLink,
      setVoiceId,
      loadSample,
      parseCapture,
      addTypedRecord,
      addPastedFacts,
      saveVoiceNote,
      editPendingField,
      removePending,
      clearCapture,
      savePending,
      resolveNearMatch,
      removeSaved,
      dropSavedCopies,
      replaceMisheardSave,
      removeDuplicates,
      clearLog,
      clearAllData,
      resetBackupInfo,
      undoReset,
      discardResetBackup,
      runQuery,
      requestEdit,
      clearEditRequest,
      setRecordCategory,
      toggleExamples,
      setSpeakOn,
      exportSaved,
      exportLog,
      exportCorrections,
      logFileRouting,
      getImage,
      capability,
    ],
  );

  return <Ctx.Provider value={{ state, actions }}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used within AppProvider');
  return v;
}
