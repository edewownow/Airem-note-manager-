/**
 * Shared types. The record shape is FIXED by the brief — do not change it.
 */

/** The captured/stored record. Shape is fixed (brief §6, guardrails). */
export interface Rec {
  id: string;
  type: string;
  title: string;
  date: string | null; // "YYYY-MM-DD"
  time: string | null; // "HH:MM" 24h
  location: string | null;
  people: string | null;
  notes: string | null;
  via: string | null; // provenance: source label ("photo.jpg", "Voice note", "typed")
  imageId: string | null; // links to session full-res image
  thumb: string | null; // persisted small jpeg data URI
}

/** The 7 content fields compared when diffing edits → corrections. */
export const CMP = [
  'type',
  'title',
  'date',
  'time',
  'location',
  'people',
  'notes',
] as const;
export type CmpField = (typeof CMP)[number];

/** A snapshot of just the comparable fields (for correction diffing). */
export type Snapshot = Record<CmpField, string | null>;

/** Auto-check verdict. */
export type Status = 'ok' | 'warn' | 'fail';
export interface Verdict {
  status: Status;
  notes: string[];
}

/** Input to the parse step. `data` is base64 for inline kinds (image/pdf), raw text for text. */
export interface Payload {
  kind: 'image' | 'pdf' | 'text'; // image|pdf → inline_data; text → text part
  data: string; // base64 (image/pdf) or raw text
  mediaType?: string; // mime for inline kinds, e.g. "image/jpeg" / "application/pdf"
  uri?: string; // file:// uri (thumbnail source for images)
  label: string;
  detectedType?: string; // raw detected mime/category, for capture-log routing visibility
  route?: string; // chosen path: "inline_data image" | "inline_data pdf" | "text"
}

/** A correction: the real accuracy signal, diffed against the model's output.
 * Scope is gone (the parser auto-detects), so `instruction` is now always "" —
 * the correction is steered purely by the before/after diff. */
export interface Correction {
  ts: number;
  kind: 'edit' | 'delete';
  instruction: string; // legacy field — empty now that scope is removed
  inputKind: string;
  inputText: string | null;
  before: Snapshot | null;
  after: Snapshot | null;
}

/** One capture-log entry: the attempt, its JSON, and a verdict. `label` carries
 * the source name (filename / "Voice note" / "photo.jpg"); the detected content
 * type + EXTRACT/DESCRIBE mode live in `notes`. */
export interface LogEntry {
  id: string;
  ts: number;
  label: string; // source label (was the scope instruction; scope is gone)
  kind: Payload['kind'] | 'file'; // 'file' = a router rejection (office/unsupported)
  thumb: string | null;
  count: number;
  status: Status;
  notes: string[];
  raw: string;
  parsed: Array<Pick<Rec, 'type' | 'title' | 'date' | 'time' | 'location' | 'people' | 'notes'>>;
}

/** The configurable AI link (Settings). Key in the only place the key lives. */
export interface AiLink {
  provider: 'gemini';
  apiKey: string;
  model: string;
}

/** Runtime capability, checked at call time. */
export interface Capability {
  online: boolean;
  aiLinked: boolean;
  canParse: boolean; // online && aiLinked
}

/** A capture that couldn't parse yet (offline / no link) — queued. The parser is
 * source-agnostic now, so the queued item is just the payload. */
export interface QueuedCapture {
  id: string;
  ts: number;
  payload: Payload;
}
