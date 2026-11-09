# Build brief — Snap → Schedule (React Native, offline-first)

Hand this to Claude Code as the opening prompt in a fresh repo, then attach `snap-schedule-phone.html` (the working prototype — source of truth for all behavior and styling).

**This replaces the earlier Vite/web migration brief.** The product is a **React Native app**, not a web app. The component split, module layer, Gemini contract, record shape, and behaviors below are the same ideas as before, now targeted at RN.

---

## 0. Platform & build

**Android first. Do not set up iOS or EAS yet.** Get a working Android build running and the prototype finalized before any iOS work — iOS is a separate later phase (§12).

- **React Native via Expo** (managed workflow), TypeScript (consistent with `orderpad-rn`).
- **Android**: built and run **locally** on my laptop, same as my existing apps. This is the entire focus for now.
- **iOS: deferred.** No EAS Build, no iOS config, no Apple-specific modules until the Android build works and the prototype is locked. (When we get there: no Mac, so iOS will build via EAS and install on an iPad Pro M4 — but that's later.)
- Do **not** model structure on `orderpad-rn` or `shipstime` blindly — both are bare React Native; this is Expo. Mirror their *coding style/conventions* where sensible, but use Expo-native project structure.
- **Propose the structure and confirm before writing code.**
- Prefer libraries that work in **Expo Go** where possible, so the Android dev loop needs no custom native build early on; only move to a development build when a native module actually requires it.

---

## 1. Core principle: offline-first, online-enhanced

The app is **fully usable offline**. Online + a configured AI link is an **enhancement**, never a requirement. Every feature does a **capability check at call time** — "am I online?" and "is an AI link configured?" — and picks the best path it can. Nothing hard-fails for lack of signal.

| Feature | Offline | Online + AI linked |
|---|---|---|
| Capture (camera/file/text/voice) | ✅ works | ✅ works |
| **Parse** (photo/text → JSON) | ⏸ **queued** as pending, auto-runs on reconnect | ✅ runs via cloud AI |
| Store (records) | ✅ local | ✅ local |
| **Query** ("what's on Tuesday") | ✅ local JS filter | ✅ local filter, *optionally* cloud-interpreted for fuzzy phrasing, falls back to local |
| Voice in / spoken answers | ✅ local | ✅ local |

Key consequences:
- **Capture never errors offline.** If parse can't run (offline or no key), the capture is stored as **pending parse** and processed automatically when connectivity + AI link are available. Surface pending items (the capture log is a natural home).
- **Query always works** via the existing local filter; cloud is only an optional accuracy boost for loose phrasing, with local fallback on any failure.

---

## 2. The AI link (configurable, provider-agnostic)

- A single **Settings** screen holds the AI connection: provider + API key (+ model). Present → online features light up; absent → app runs pure-offline/local with no nagging.
- Default provider **Gemini** (the key I already use). Keep the call isolated in one module so the provider can be swapped later.
- Persist the key on-device. `// TODO: for any multi-user/public release, move the key behind a proxy — don't ship it in the client.`

---

## 3. Screens / components (RN)

Single main screen, three zones (already the prototype's layout):

- **`<Capture>`** — top. Four one-tap inputs (Photo / File / Text / Voice). Photo uses the device camera with a permission prompt (see §7). Holds the scope-instruction bar + saved presets, Parse action, and the editable review of pending records.
- **`<Assistant>`** — center. Ask bar (typed + voice), results directly beneath, voice-output picker (collapsed).
- **`<SavedFolder>`** — bottom, collapsed by default. The on-device store: list, type filter, export.
- **`<CaptureLog>`** — bottom, collapsed. Every parse attempt: thumbnail + produced JSON + auto-check verdict; also shows **pending (queued) captures**; exportable.
- **`<Settings>`** — AI link (provider/key/model).

---

## 4. Module / data layer (keep logic out of components)

- **`parse.ts`** — cloud AI call (Gemini contract, §6). Input `{kind,data,mediaType}` + instruction + optional type hint → normalized records.
- **`store.ts`** — CRUD over persisted records behind a small interface (`load/save/all/remove`) so the backing store can change (§8) without touching components.
- **`query.ts`** — the offline query engine. **Now: the existing JS filter** (date + keyword + who) with provenance. Online: optionally pre-interpret a fuzzy question via cloud, then run the same filter; fall back to pure filter on failure. **Keep this module isolated behind one interface — it's the marked seam for a future small on-device model (§9).**
- **`connectivity.ts`** — online/offline detection (`@react-native-community/netinfo`) + "is AI linked?" → exposes a `capability` the features check.
- **`queue.ts`** — pending-parse queue: enqueue captures that couldn't parse, persist them, drain automatically when capability returns.
- **`checks.ts`** — auto-verdict (valid JSON, count, missing title, missing/odd dates) → `ok | warn | fail` + notes.
- **`log.ts`** — capture-log persistence (capped, thumbnails) + export.
- **`corrections.ts`** — diff edited/deleted records vs the model's original output; persist; expose as few-shot hints for the next parse; export.
- **`speech.ts`** — TTS (`expo-speech`, voice selection) and STT for query/scope dictation (see §7). Keep both behind this module.

---

## 5. Behavior to preserve (from the prototype)

- Capture is minimal until a button is tapped; folds away after save or when focus moves to the ask bar; one-tap actions (no double-tap).
- Auto-check verdict shows as a status line after each parse **and** is recorded in the capture log.
- Corrections are the real accuracy signal; auto-checks only catch structural problems.
- Saved + Capture-log are closed folders by default.
- The one-directional model holds: **capture instruction → store → query.** Don't relax it.

---

## 6. Gemini parse contract & record shape (don't change the shape)

- `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}`
- Body: `systemInstruction.parts[].text` = scope-aware system prompt; `contents[0].parts` = `[{inline_data:{mime_type,data}}]` (image) or `[{text}]` (text); `generationConfig:{ temperature:0.2, responseMimeType:"application/json" }`.
- Read `data.candidates[0].content.parts[].text`.
- Default model `gemini-2.5-flash`, editable in Settings.
- Record shape: `{ type, title, date, time, location, people, notes }`. Normalize every record; attach `via` (scope used), `imageId`, `thumb`.

---

## 7. Native bits (Expo libraries)

- **Camera**: `expo-camera` for a live in-app camera + permission prompt; `expo-image-picker` for choosing an existing photo / file. Request permission at first use; if denied, show a clear message and offer the picker. (This mirrors the prototype's getUserMedia-with-fallback.)
- **TTS**: `expo-speech` (system voices, pick best available).
- **STT** (voice query / scope dictation): use a speech-to-text library via Expo config plugin (e.g. `@react-native-voice/voice`) or a cloud STT when online. If it complicates the first build, ship typed input first and mark STT as a fast-follow — don't block on it.

---

## 8. Storage (offline-first, local)

- Start with a simple persistent KV behind `store.ts` — `react-native-mmkv` (fast) or `AsyncStorage`. Persist: records, presets, corrections, capture log, pending-parse queue.
- Keep full source images for the session; persist thumbnails only.
- Mark a clear upgrade path to **`expo-sqlite`** for when record/image volume grows (real query indexing, larger history).

---

## 9. Explicitly OUT of scope for now (future seams, do not build)

- **No bundled on-device LLM yet.** The lightweight JS filter in `query.ts` is the on-device intelligence for now — it runs on every phone, no model, no download. Leave a clearly-marked interface seam where a small model (e.g. React Native ExecuTorch running Llama 3.2 1B / Qwen) *could* slot in later for offline fuzzy queries.
- **No OS-native models** (Gemini Nano / Apple Foundation Models). They're device-gated (Nano needs newest flagships; Apple FM needs Apple-Intelligence devices and is region-restricted), so they don't fit "works on all phones today." Note them as an optional native fast-path for a future pass; don't depend on them.

---

## 10. Guardrails

- Build offline-first: no feature may hard-fail for lack of network — degrade or queue.
- Don't add the on-device LLM, OS-native models, routing, or UI kits beyond what's here unless I ask.
- Don't change the record shape or the instruction → store → query model.
- Keep the AI key in Settings only (leave the proxy TODO).
- Report the structure and plan for review before scaffolding; don't push.

---

## 11. Suggested order — Android first

**Phase 1 — Android working build (focus now):**
1. Propose Expo project structure + the libraries above (Expo Go-friendly where possible); wait for OK.
2. Scaffold Expo + TypeScript; init Git; first commit. Confirm it **runs on Android locally** (Expo Go or local dev build).
3. Port the data layer: `store`, `parse`, `query` (JS filter first), `checks`, `log`, `corrections`, `connectivity`, `queue`, `speech`.
4. Build the four components + Settings against that layer.
5. Wire offline-first capability checks + the pending-parse queue + the three-zone layout and design tokens (Space Grotesk / Inter / Space Mono; teal `#0E7C66`, clay `#E8643C`).
6. Smoke-test on Android: airplane-mode capture → queued → reconnect → auto-parses; local query offline; save; capture-log; then a real Gemini parse online.
7. Add `CLAUDE.md` capturing these conventions and decisions.

**Phase 2 — finalize the prototype:** iterate on the running Android app until behavior matches `snap-schedule-phone.html` and feels right. Lock it.

**Phase 3 — iOS migration (later, separate):** only after Android is solid — set up EAS Build for iOS (no Mac), install on the iPad Pro M4, handle any iOS-specific module/permission differences, and add the optional Apple-native fast-paths if wanted. Do not start this until Phases 1–2 are done.

Source of truth for behavior and styling: the attached `snap-schedule-phone.html`.
