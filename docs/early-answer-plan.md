# Early answer: Gemma starts while the question is still being said

Status: PLAN ONLY. Nothing here is built. Agreed idea (2026-11-02): overlap Gemma's 4 s with the
~3 s the app waits after the user stops talking. Airem still finds the records. Gemma still only
writes the sentence from records Airem found. Gemma does NOT search the saved records.

## What happens today (measured on the OnePlus 12)

1. Google sends partial words while the user speaks. `handleText(t, final=false)` only updates the line.
2. The app waits for the words to stop changing (`WORDS_STILL_MS` = 3000 ms in `src/lib/speech.ts`) or
   Google's own end. Then `handleText(t, final=true)` -> `onSpoken` -> `ask()`.
3. `ask()` runs Airem (`actions.runQuery`, milliseconds), then `gemmaAnswer()`: ~4.2 s with the
   prepared conversation (was ~6.2 s).
4. The sentence is spoken. Total wait after the user stops: about 3 s + 4.2 s.

## The design

### Draft while speaking
- Run only when ALL are true: the partial words have been unchanged for `EARLY_STABLE_MS` (about 900 ms),
  at least 3 words, Gemma is loaded, the feature flag is on, and `classifyIntent(...)` says SURE ask.
- Route with the SAME decision `ask()` makes. Extract that decision (no side effects) from `ask()` into
  `planAsk(spoken)` -> `{ route: 'teach' | 'private-list' | 'private-expiry' | 'private-search' | 'private-save' | 'private-card' | 'normal', followed, ... }`.
  `ask()` uses it too, so the draft and the real ask can never disagree about routing.
- A draft starts only for route `normal` and not a follow-up (`isFollowUp`). Anything private never
  starts a draft, so nothing about it reaches Gemma early. If the FINAL words route to private, any
  draft is cancelled and thrown away.
- The draft is exactly what `gemmaAnswer` does today: `pickRecords(...)` from Airem's own results, the
  same prompt, the same `checkReply`. Result stored as `{ question (normalized), recordIds (sorted), sentence }`.

### Use or discard on the final words
- In `ask()`, in the `waitForGemma` branch, ask `earlyAnswer.take(followed, shownResult)` first.
- USE the draft only if the normalized question text is identical AND the sorted record ids Airem found now
  equal the ids the draft was written from. Then the sentence is spoken at once (or as soon as an
  in-flight draft finishes, which is still earlier than starting fresh).
- Otherwise cancel the draft and run `gemmaAnswer` as today. Result: never worse than today except
  for the cost of the cancel.
- If the words change after a draft started, cancel it and allow ONE restart. No thrashing.

### Native (Gemma)
- Add `cancel()` to `LlmCore` / the module: stop the running answer (`cancelProcess` exists on the
  engine's conversation). A cancelled `ask` returns a "cancelled" error the JS side treats as "no sentence".
- Keep one conversation at a time (`convLock`, already in place). The prepared conversation is used by the draft.

## Safety rules (must hold)
- Private folder: no draft for any private route; final-words check cancels; sims prove it.
- No spoken text from a draft unless it passes `checkReply` against the FINAL record ids.
- Flag `early_answer` (persisted). Off = exactly today's behavior. Ship default OFF until the phone test passes.
- Logs: sizes and timings only ("early draft started / used / discarded: reason"). Never words or records.
- Record shape, Airem rules, Gemma prompt: unchanged.

## Steps (no compile before approval)
0. Spike, one small native build: add `cancel()`, prove a cancelled answer frees the engine quickly and
   the next ask works. Measure cancel time. STOP if cancel is slow or unstable (then use "wait for the
   draft" only, no cancel).
1. JS only: extract `planAsk` from `ask()`. No behavior change. Check with all existing sims (they must
   stay identical) plus a new routing sim.
2. JS only: `src/lib/earlyAnswer.ts` (stability timer, eligibility, draft store, match rule) and
   `scripts/early-answer-sim.ts`: private phrases never eligible; same question + same ids = use;
   one extra word = discard; different records = discard; follow-ups skipped; one restart max.
3. Wire into `Assistant.tsx` (`handleText` partial -> `earlyAnswer.watch`, `ask()` -> `earlyAnswer.take`).
4. Phone test (one native/JS debug build): 15 questions, compare to today.
5. Decide the default, then rebuild the Play bundle.

## Phone test, what "good" means
- Used drafts: wait from the end of speech to the start of the spoken answer about 1-2 s (today ~7 s).
- Wrong or different spoken sentence than today for the same question: zero.
- Drafts for private phrases: zero.
- Discard rate and cancel time reported. If more than about 40 % of drafts are discarded, raise the stability time.
- Watch heat and battery over a 10-minute session; the GPU does extra work on discarded drafts.

## Not in this plan
- Gemma searching the saved records (slower and less reliable; Airem finds in milliseconds).
- Shortening the Gemma prompt or sending fewer records (separate, smaller idea; changes the wording of answers).
- Lowering `WORDS_STILL_MS` (can be tried after drafts work; it shortens the silence wait itself).
