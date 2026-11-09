/**
 * Parse — the cloud AI step, PROVIDER-ISOLATED (Gemini). Swap the provider by
 * replacing this module only.
 *
 * SMART ADAPTIVE PARSE (no scope): the model classifies the content type on its
 * own, extracts the fields relevant to that type into the ONE unified record
 * shape, and — when there's little/no readable text — DESCRIBES the image into
 * the same fields so wordless photos are still findable. A real image never
 * yields []. Source (photo / file / text) is irrelevant to the output shape.
 *
 * Keeps the exact Gemini contract (brief §6):
 *   POST .../v1beta/models/{model}:generateContent?key={key}
 *   systemInstruction.parts[].text = the adaptive prompt
 *   contents[0].parts = [{inline_data:{mime_type,data}}] (image/pdf) | [{text}] (text)
 *   generationConfig { temperature:0.2, responseMimeType:"application/json" }
 *
 * Also owns the FILE-TYPE ROUTER (routeFile): detects a picked file and sends it
 * to Gemini correctly (inline image / inline PDF / UTF-8 text), or rejects it
 * with a clear message. Kept here so all provider-specific encoding stays in one
 * place. Binaries (PDF/Office) are NEVER read as text.
 */
import * as FileSystem from 'expo-file-system/legacy';
import type { AiLink, Payload, Rec } from '../types';
import { id, todayContext } from './datetime';
import { resizeForUpload } from './thumb';

const ENDPOINT = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
    key,
  )}`;

/** EXTRACT = read structured fields; DESCRIBE = caption a (near-)wordless image. */
export type ParseMode = 'extract' | 'describe';

/** The describe-fallback labels. If every record uses one of these (and carries
 * no when/where/who), the capture ran in DESCRIBE mode — logged for visibility. */
const DESCRIBE_TYPES = new Set([
  'photo', 'food', 'place', 'object', 'people', 'scene', 'animal', 'nature', 'art',
]);

/**
 * The single adaptive system prompt: classify-then-extract, with a describe
 * fallback. No scope, no user instruction — the model decides what it's looking
 * at and which fields matter.
 */
export function buildSystem(examples: string, now: Date = new Date()): string {
  const ctx = todayContext(now);
  return `You read the user's input (an image, file, or text) and capture structured records into ONE fixed shape, no matter the source.
Today is ${ctx.weekday}, ${ctx.todayISO}. Capture dates/times EXACTLY as the source expresses them, always as an ABSOLUTE date (date as YYYY-MM-DD, time as 24h HH:MM). If the source states a date or time, you MUST capture it — do not drop a date that is present. Treat ordinals and spoken forms as the same date ("Nov 5", "November 5th", "November fifth" all = November 5). Resolve a RELATIVE date ("today", "tomorrow", "next Friday") against today ONLY when the source itself uses that relative phrasing. When a month+day is shown with NO year, output the NEXT FUTURE occurrence: use ${ctx.year} if that month/day is still ahead this year, otherwise ${ctx.year + 1} — NEVER resolve a bare month/day into the past. NEVER invent or supply a date/time that the source does not express — absent → null.
Return ONLY a JSON array — no prose, no markdown code fences.

First, silently identify what the content is (schedule/event, daily schedule/agenda/itinerary/planner, menu, invoice/receipt, contact/business card, flyer/poster, note, list, ticket, label, guide/how-to/article/manual, …). Then EXTRACT the fields that matter for that kind into the unified record:
- event/appointment → what=summary, when=date/time, where=location, who=people
- menu → what=dish, notes=section + price
- invoice/receipt → what=vendor, notes=total + currency + invoice/order number + due date
- contact/business card → what=name, who=the person's name only (a company name goes in notes, NOT people), notes=company + phone, email, role
- flyer/poster/ticket → what=title, when/where if shown, notes=other detail

HOW MANY RECORDS — decide by whether the content is SECTIONED:
- NUMBERED LIST (this rule wins over every rule below): each number is ONE record, even when that number has no Answer line. "1. data 2. data 3 data" (a dot after the number is optional) and "a dog name red number 2. fish is on the blue bucket, number 3 there are 5000 on the safe" are both numbered lists: the words before "number 2" are the first record when it does not already say "number 1". Never merge the list into one record. title = that number's own words. notes = an Answer line under that number, or null when there is none. type = "fact". date, time, location, and people are null.
- FACT PARAGRAPH (only when there is NO numbered list: a continuous paragraph that states more than one separate fact): emit ONE RECORD PER FACT. type = "fact". title = the few words that name that fact. notes = that one fact's own sentence, copied faithfully. date, time, location, and people are null. One sentence that states only one fact stays one record.
- SIMPLE / NON-SECTIONED item (event poster, business card, single notice, receipt, ticket, label, a short note, a photo): emit exactly ONE record. Extract the structured fields above; notes = a faithful short description of the rest. Do NOT split these into many records. A paragraph of several facts is a FACT PARAGRAPH, not a simple note.
- CONTENT-RICH / SECTIONED document (a guide, how-to, article, manual, or any multi-point / numbered / headed document whose sections or steps carry real body text — a menu's dishes count as sections too): emit ONE RECORD PER SECTION. For each section/step set title = that section or step's heading, and notes = that section's FULL body text, transcribed faithfully — the actual advice/instructions/description, NOT a summary and NOT just the heading repeated. So an 8-step how-to becomes 8 records and a 6-dish menu becomes 6 records, each independently findable by its OWN content (a search for words inside step 4's body must return step 4, not just its title). Still pull any date/time/location/people a section contains into that record's own fields.
- SCHEDULE / AGENDA / ITINERARY / PLANNER (a time-ordered list, or a two-column "time | event" layout — a daily schedule, agenda, itinerary, or planner page running across the day): emit ONE RECORD PER ROW. For each row: time = the LEFT column (that row's time, normalized to 24h HH:MM), title = the RIGHT column (that row's event text), type = "event". BIND each time to ITS OWN event — row N's time stays with row N's event; never shift a time onto a neighbouring row (two-column layouts misalign easily — read each line as one time+event pair, top to bottom). Every row shares the SAME date = the schedule's own date if a header/date appears on the page, otherwise null (do NOT invent one). Preserve row order; do NOT drop a row, and do NOT collapse the day into a single summary record (that would lose "what's at 3pm?").
- FALLBACK: if a content-rich document can't be cleanly split into sections, emit ONE record whose notes holds the document's FULL faithful text (every section's body), not a gist.
FAITHFULNESS OVER BREVITY for content-rich documents: never compress the body away or replace it with a bare list of headings — capture what the text actually says so it can be retrieved later. Dropping the body of a section is silent data loss; keep it.

DESCRIBE FALLBACK: if the image has little or no readable text, do NOT return nothing — DESCRIBE it into the same fields. what = a short caption; where/who if visible; when if implied (a clock, daylight); notes = descriptive keyword tags (objects, colors, scene, category) so the photo is findable later. Use a type like "photo", "food", "place", "object", or "people".
Never return [] for a real image — only for genuinely blank or unreadable input.

Each record: {"type": a short lowercase label you choose (e.g. "event", "dish", "invoice", "contact", "photo"), "title": the WHAT — a concise human-readable summary or caption, "date": "YYYY-MM-DD" or null, "time": "HH:MM" 24-hour or null, "location": the WHERE or null, "people": the WHO — names of actual PEOPLE only, comma-separated, or null (a brand, company, venue, or cruise-line name like "Princess" or "Sabatini's" is NOT people — if it's a place put it in location, otherwise notes; never put a brand/company in people), "notes": other detail or descriptive keyword tags, or null}.
Always fill "title". For every OTHER field: extract it ONLY if the source actually contains it; if absent, use null. Never infer, guess, or complete a field from context — the user adds missing details themselves. You MAY normalize a present value to the field's format (dates YYYY-MM-DD, times 24h HH:MM); that is representation, not invention.${examples}`;
}

/** Infer EXTRACT vs DESCRIBE from the produced records (for capture-log visibility). */
export function inferMode(records: Rec[]): ParseMode {
  if (!records.length) return 'extract';
  const allDescribed = records.every(
    (r) => DESCRIBE_TYPES.has(r.type) && !r.date && !r.time && !r.location && !r.people,
  );
  return allDescribed ? 'describe' : 'extract';
}

export function extractJSON(text: string): any[] {
  let t = text.replace(/```json|```/g, '').trim();
  try {
    const v = JSON.parse(t);
    return Array.isArray(v) ? v : v.events || [];
  } catch {
    /* fall through */
  }
  const a = t.indexOf('[');
  const b = t.lastIndexOf(']');
  if (a > -1 && b > a) {
    try {
      return JSON.parse(t.slice(a, b + 1));
    } catch {
      /* ignore */
    }
  }
  return [];
}

/** Hard cap on a single record's notes. The faithful per-section path keeps records
 * small; only the single-record FALLBACK for long, un-splittable docs can hit this. */
export const NOTES_CAP = 4000;

/** Cap notes at NOTES_CAP. When the tail is cut, append a VISIBLE marker so the
 * record itself shows it was truncated — never silently lose the end (the capture
 * log logs it too). NOTE: continuation-record splitting is deferred backlog; this
 * only removes the SILENCE, it doesn't preserve the cut text. */
export function capNotes(raw: string): { value: string; cut: number } {
  if (raw.length <= NOTES_CAP) return { value: raw, cut: 0 };
  const cut = raw.length - NOTES_CAP;
  return { value: raw.slice(0, NOTES_CAP) + `\n\n[... truncated: ${cut} chars cut]`, cut };
}

/** Normalize one raw record into the fixed Rec shape (caps + validation). */
export function normalize(e: any): Rec {
  const time = /^\d{1,2}:\d{2}$/.test(e.time || '') ? String(e.time).padStart(5, '0') : null;
  return {
    id: id('e'),
    type:
      (e.type ? String(e.type) : 'item')
        .toLowerCase()
        .replace(/[^a-z_]/g, '')
        .slice(0, 20) || 'item',
    title: (e.title || 'Untitled').toString().slice(0, 200),
    date: /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') ? e.date : null,
    time,
    location: e.location ? String(e.location).slice(0, 120) : null,
    people: e.people ? String(e.people).slice(0, 120) : null,
    // notes holds full transcribed blocks in transcribe mode — keep generous so
    // content is never dropped (targeted records rarely approach this). On the rare
    // over-cap fallback, capNotes appends a visible truncation marker (not silent).
    notes: e.notes ? capNotes(String(e.notes)).value : null,
    via: null,
    imageId: null,
    thumb: null,
  };
}

/** Surfaced before each backoff wait so the caller can show a "retrying…" line. */
export interface RetryInfo {
  attempt: number; // 1-based number of the attempt that just failed
  waitMs: number; // how long until the next try
  reason: string; // a ready-to-display status string
}

export interface ParseInput {
  payload: Payload;
  link: AiLink;
  examples: string; // pre-built few-shot block from corrections.buildExamples()
  now?: Date;
  /** External cancel — abort() stops the in-flight fetch AND any pending backoff. */
  signal?: AbortSignal;
  /** Called before each retry wait so the UI can show a subtle "retrying…" status. */
  onRetry?: (info: RetryInfo) => void;
}
export interface ParseResult {
  records: Rec[]; // normalized; caller attaches via/imageId/thumb
  rawText: string;
  parsedOk: boolean;
  mode: ParseMode; // 'extract' | 'describe' — for capture-log visibility
  detectedTypes: string[]; // the content types the model chose, for the log
  attempts: string[]; // per-attempt outcome notes (empty on a clean first try)
  uploadNote: string | null; // image downscale-for-upload note, or null (text/pdf)
  truncatedNotes: string[]; // one note per record whose notes hit NOTES_CAP (else empty)
}

/**
 * Per-attempt deadline. A request that gets no response within this aborts cleanly
 * (AbortController) instead of hanging "Reading…" forever. ADAPTIVE by payload: a small TEXT
 * request fails fast (BASE); an IMAGE/PDF upload — the kind that crawls over a high-latency
 * satellite/ship link — gets the full window (MAX). Measured on a cruise satellite uplink:
 * ~800ms RTT, so a TLS handshake + ~0.5MB image upload + model time routinely needs >60s.
 * DEBUG: temporarily shrink (e.g. 3000) to force the timeout path on-device, then
 * RESTORE before commit (MEMOAIREM_MANIFEST.md §5 test rule).
 */
const PARSE_TIMEOUT_BASE_MS = 60_000; // text (small request) — fail fast
const PARSE_TIMEOUT_MAX_MS = 120_000; // image/PDF (large upload over slow/satellite links)
const SERVER_BACKOFFS_MS = [1000, 2000, 4000]; // 5xx: 3 retries (1s, 2s, 4s)
const MAX_RETRY_AFTER_MS = 5000; // 429: only honor a SHORT Retry-After inline

/** Tag a thrown error with extra branch fields the caller reads (mirrors err.status). */
function tagged(message: string, extra: Record<string, unknown>): Error {
  return Object.assign(new Error(message), extra);
}

/** Abortable sleep — resolves 'aborted' the instant `signal` fires, so a Cancel
 * during a backoff wait takes effect immediately. */
function sleep(ms: number, signal?: AbortSignal): Promise<'ok' | 'aborted'> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve('aborted');
    const onAbort = () => {
      clearTimeout(t);
      resolve('aborted');
    };
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve('ok');
    }, ms);
    signal?.addEventListener('abort', onAbort);
  });
}

/** Best error message out of a non-OK Gemini response body. */
async function readApiError(res: Response): Promise<string> {
  let m = 'API ' + res.status;
  try {
    const j = await res.json();
    if (j.error && j.error.message) m = j.error.message;
  } catch {
    /* ignore */
  }
  return m;
}

/** Retry-After header → ms (seconds or HTTP-date), or null if absent/unparseable. */
function retryAfterMs(res: Response): number | null {
  const h = res.headers.get('retry-after');
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(h);
  return Number.isFinite(when) ? Math.max(0, when - Date.now()) : null;
}

/**
 * Run the cloud parse with a per-attempt 60s deadline, external cancel, and
 * retry-with-backoff for transient failures. Throws on a non-recoverable error
 * (the caller decides whether to queue). The thrown error carries `status` (HTTP),
 * `isTimeout`, `isCancel`, and `attempts` (the per-try breakdown) so the caller
 * logs the exact outcome — no parse can hang invisibly. PROVIDER-ISOLATED.
 */
export async function parseWithGemini(input: ParseInput): Promise<ParseResult> {
  const { payload, link, examples, now, signal, onRetry } = input;

  const parts: any[] = [];
  let uploadNote: string | null = null;
  if (payload.kind === 'image' || payload.kind === 'pdf') {
    let data = payload.data;
    let mime = payload.mediaType;
    // Downscale IMAGES to ~1568px on the long edge before upload — full-res photos are
    // multi-MB and the inline POST times out (invariant 16). PDFs are NOT images: leave
    // them as-is (they're usually far smaller than photos). Resize re-encodes JPEG, so a
    // used resize also fixes the mime to image/jpeg. Resize failure → send full-res (logged).
    if (payload.kind === 'image' && payload.uri) {
      const kb = (n: number) => Math.round(n / 1024); // base64 char length ≈ bytes on the wire
      const r = await resizeForUpload(payload.uri);
      if (r.base64) {
        uploadNote = `image downscaled for upload: ~${kb(payload.data.length)}KB → ~${kb(r.base64.length)}KB base64`;
        data = r.base64;
        mime = 'image/jpeg';
      } else if (r.reason === 'small') {
        uploadNote = `image already ≤1568px — sent as-is (~${kb(payload.data.length)}KB base64)`;
      } else {
        uploadNote = `image resize failed — sent full-res (~${kb(payload.data.length)}KB base64)`;
      }
    }
    parts.push({ inline_data: { mime_type: mime, data } });
    const what = payload.kind === 'pdf' ? 'PDF document' : 'image';
    parts.push({ text: `Capture structured records from this ${what}.` });
  } else {
    parts.push({ text: 'Capture structured records from this text:\n\n' + payload.data });
  }
  const url = ENDPOINT(link.model, link.apiKey);
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: buildSystem(examples, now) }] },
    contents: [{ parts }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
  });

  // Adaptive per-attempt deadline: image/PDF uploads get the full 120s window (satellite-tolerant),
  // text fails fast at 60s. (Image already gets the long window, so it does NOT also timeout-retry —
  // that would double the dead-link wait; text keeps its one retry.)
  const isInline = payload.kind === 'image' || payload.kind === 'pdf';
  const timeoutMs = isInline ? PARSE_TIMEOUT_MAX_MS : PARSE_TIMEOUT_BASE_MS;

  const attempts: string[] = []; // per-try outcome breadcrumbs (for the capture log)
  let serverRetries = 0; // 5xx backoff counter (caps at SERVER_BACKOFFS_MS.length)
  let retryAfterUsed = false; // 429: honor a short Retry-After exactly once
  let timeoutRetried = false; // timeout: retry exactly once

  // One fetch per turn, each under its own deadline. A transient failure waits and
  // continues; anything terminal throws with `attempts` attached.
  for (;;) {
    if (signal?.aborted) throw tagged('cancelled', { isCancel: true, attempts });
    const n = attempts.length + 1;

    const ac = new AbortController();
    const forward = () => ac.abort();
    signal?.addEventListener('abort', forward);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ac.abort();
    }, timeoutMs);
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', forward);
    };

    // No response (deadline fired, external cancel, or a genuine transport throw).
    // Returns to signal "retry"; otherwise throws. Keeps the original message on a
    // real transport failure so the caller's offline detection still matches.
    const onNoResponse = async (err: any, where: string): Promise<void> => {
      if (timedOut) {
        attempts.push(`attempt ${n}: ${where} timed out (${timeoutMs / 1000}s)`);
        // Retry once on timeout ONLY for light TEXT requests — an image/PDF already ran the full
        // 120s window, so a second 120s wait would just double the delay on a dead link.
        if (!isInline && !timeoutRetried) {
          timeoutRetried = true;
          onRetry?.({ attempt: n, waitMs: 0, reason: 'Gemini is slow — retrying once…' });
          if ((await sleep(0, signal)) === 'aborted') throw tagged('cancelled', { isCancel: true, attempts });
          return; // caller continues the loop
        }
        throw tagged(`no response within ${timeoutMs / 1000}s`, { isTimeout: true, attempts });
      }
      if (signal?.aborted) throw tagged('cancelled', { isCancel: true, attempts });
      attempts.push(`attempt ${n}: transport ${String(err?.message ?? 'failed')}`);
      throw Object.assign(err instanceof Error ? err : new Error(String(err)), { attempts });
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: ac.signal,
      });
    } catch (err: any) {
      done();
      await onNoResponse(err, 'request');
      continue; // timeout-retry path
    }

    if (res.ok) {
      let text: string;
      try {
        const data = await res.json();
        text = (data.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');
      } catch (err: any) {
        done();
        await onNoResponse(err, 'response');
        continue;
      }
      done();
      const raw = extractJSON(text);
      const parsedOk = /\[[\s\S]*\]/.test(text) || raw.length > 0;
      const records = raw.map((e) => normalize(e));
      const mode = inferMode(records);
      const detectedTypes = [...new Set(records.map((r) => r.type))];
      // Make over-cap notes VISIBLE in the capture log (the record carries its own
      // truncation marker via capNotes; this is the log-side counterpart).
      const truncatedNotes = raw
        .map((e) => (e && e.notes != null ? String(e.notes).length : 0))
        .filter((len) => len > NOTES_CAP)
        .map((len) => `notes truncated: ${len} -> ${NOTES_CAP} chars`);
      return { records, rawText: text.slice(0, 1500), parsedOk, mode, detectedTypes, attempts, uploadNote, truncatedNotes };
    }

    // The server RESPONDED with an error. Classify → retry / fail fast. Carry the
    // HTTP status on the thrown error so it's never collapsed into "no internet".
    const status = res.status;
    const msg = await readApiError(res);
    done();

    // 4xx auth/bad-request → key/model/request is wrong; retrying won't help.
    if (status === 400 || status === 401 || status === 403) {
      attempts.push(`attempt ${n}: HTTP ${status} auth → fail fast`);
      throw tagged(msg, { status, attempts });
    }

    // 429 rate limit → honor a SHORT Retry-After once; otherwise stop.
    if (status === 429) {
      const ra = retryAfterMs(res);
      if (!retryAfterUsed && ra != null && ra <= MAX_RETRY_AFTER_MS) {
        retryAfterUsed = true;
        attempts.push(`attempt ${n}: HTTP 429 → retry after ${Math.round(ra / 1000)}s`);
        onRetry?.({ attempt: n, waitMs: ra, reason: 'Gemini rate-limited — retrying…' });
        if ((await sleep(ra, signal)) === 'aborted') throw tagged('cancelled', { isCancel: true, attempts });
        continue;
      }
      attempts.push(`attempt ${n}: HTTP 429 → stop`);
      throw tagged(msg, { status, attempts });
    }

    // 5xx capacity/server → backoff 1s / 2s / 4s, then give up.
    if (status >= 500) {
      if (serverRetries < SERVER_BACKOFFS_MS.length) {
        const waitMs = SERVER_BACKOFFS_MS[serverRetries];
        serverRetries += 1;
        attempts.push(`attempt ${n}: HTTP ${status} → retry-${status} in ${waitMs / 1000}s`);
        onRetry?.({
          attempt: n,
          waitMs,
          reason: `Gemini busy (HTTP ${status}) — retrying in ${waitMs / 1000}s…`,
        });
        if ((await sleep(waitMs, signal)) === 'aborted') throw tagged('cancelled', { isCancel: true, attempts });
        continue;
      }
      attempts.push(`attempt ${n}: HTTP ${status} → exhausted-${status}`);
      throw tagged(msg, { status, attempts });
    }

    // Any other 4xx (404 / 413 / …) — not retryable.
    attempts.push(`attempt ${n}: HTTP ${status} → no retry`);
    throw tagged(msg, { status, attempts });
  }
}

/* ====================================================================
   FILE-TYPE ROUTER — detect a picked file and encode it for Gemini.
   Detection: mimeType first, then filename extension. Binaries are never
   read as text. Size guards: PDF ≤ 50MB, any inline payload ≤ 100MB.
   ==================================================================== */

const MAX_INLINE_BYTES = 100 * 1024 * 1024; // general inline guard (image + pdf)
const MAX_PDF_BYTES = 50 * 1024 * 1024; // stricter pdf guard

/** A file handed over by the picker (expo-document-picker asset). */
export interface PickedFile {
  uri: string;
  mimeType?: string | null;
  name?: string | null;
  size?: number | null;
}

export type FileCategory = 'image' | 'pdf' | 'text' | 'office' | 'unsupported';

export type RouteResult =
  | { ok: true; payload: Payload; detectedType: string; route: string }
  | { ok: false; message: string; detectedType: string };

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);
const TEXT_MIMES = new Set([
  'text/plain', 'text/csv', 'text/markdown', 'application/json', 'text/xml', 'text/html',
]);
const TEXT_EXT = new Set(['txt', 'csv', 'md', 'json', 'xml', 'html', 'log']);
const OFFICE_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
]);
const OFFICE_EXT = new Set(['docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt']);

function extOf(name?: string | null): string {
  if (!name) return '';
  const m = /\.([a-z0-9]+)$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : '';
}

/** Classify by mime first, then extension. */
export function detectCategory(mime: string, ext: string): FileCategory {
  if (mime.startsWith('image/') || IMAGE_EXT.has(ext)) return 'image';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (OFFICE_MIMES.has(mime) || OFFICE_EXT.has(ext)) return 'office';
  if (mime.startsWith('text/') || TEXT_MIMES.has(mime) || TEXT_EXT.has(ext)) return 'text';
  return 'unsupported';
}

function humanMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

/**
 * Route a picked file to the correct Gemini encoding (or a rejection message).
 * The returned payload carries `detectedType`/`route` so the capture log can
 * show the routing decision.
 */
export async function routeFile(file: PickedFile): Promise<RouteResult> {
  const mime = (file.mimeType ?? '').toLowerCase().split(';')[0].trim();
  const ext = extOf(file.name);
  const category = detectCategory(mime, ext);
  const detectedType = `${mime || '(no mime)'} / .${ext || '?'} → ${category}`;
  const label = file.name ?? 'file';
  const size = typeof file.size === 'number' ? file.size : null;

  switch (category) {
    case 'office':
      return {
        ok: false,
        detectedType,
        message: "Word/Excel/PowerPoint files can't be read directly — export to PDF and re-add.",
      };

    case 'unsupported':
      return {
        ok: false,
        detectedType,
        message: 'Unsupported file type — try an image, PDF, or text file.',
      };

    case 'text': {
      // Never base64 — read as UTF-8 text.
      const text = await FileSystem.readAsStringAsync(file.uri, { encoding: 'utf8' });
      return {
        ok: true,
        detectedType,
        route: 'text',
        payload: { kind: 'text', data: text, label, detectedType, route: 'text' },
      };
    }

    case 'pdf': {
      if (size != null && size > MAX_PDF_BYTES) {
        return { ok: false, detectedType, message: `PDF too large (${humanMB(size)}) — max 50MB.` };
      }
      const data = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' });
      const bytes = size ?? Math.floor(data.length * 0.75);
      if (bytes > MAX_PDF_BYTES) {
        return { ok: false, detectedType, message: `PDF too large (${humanMB(bytes)}) — max 50MB.` };
      }
      if (bytes > MAX_INLINE_BYTES) {
        return { ok: false, detectedType, message: `File too large (${humanMB(bytes)}) — max 100MB.` };
      }
      return {
        ok: true,
        detectedType,
        route: 'inline_data pdf',
        payload: {
          kind: 'pdf',
          data,
          mediaType: 'application/pdf',
          uri: file.uri,
          label,
          detectedType,
          route: 'inline_data pdf',
        },
      };
    }

    case 'image':
    default: {
      if (size != null && size > MAX_INLINE_BYTES) {
        return { ok: false, detectedType, message: `Image too large (${humanMB(size)}) — max 100MB.` };
      }
      const data = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' });
      const bytes = size ?? Math.floor(data.length * 0.75);
      if (bytes > MAX_INLINE_BYTES) {
        return { ok: false, detectedType, message: `Image too large (${humanMB(bytes)}) — max 100MB.` };
      }
      const mediaType = mime.startsWith('image/') ? mime : 'image/' + (ext === 'jpg' ? 'jpeg' : ext || 'jpeg');
      return {
        ok: true,
        detectedType,
        route: 'inline_data image',
        payload: {
          kind: 'image',
          data,
          mediaType,
          uri: file.uri,
          label,
          detectedType,
          route: 'inline_data image',
        },
      };
    }
  }
}
