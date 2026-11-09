# Changelog

All notable changes to **MemoAirem**. Format: [Keep a Changelog](https://keepachangelog.com/),
[Semantic Versioning](https://semver.org/). Newest first.

> **Discipline (see `MEMOAIREM_MANIFEST.md` §2):** every version bump ships its entry here in the
> SAME commit, and updates the tracked version sources — `app.config.ts` (`version` +
> `android.versionCode`), `package.json`, and `src/lib/version.ts`.
>
> **What's new reset (2026-11-01):** the About screen no longer lists every build. Those lines are
> archived in `docs/whats-new-archive.md`. The in-app list now starts with Airem 2. Add the next
> release there, above that entry. This file keeps the full build history.

## [2.0.1 build 149] — 2026-11-02

### Fixed
- First-time setup: the Next button under the e-mail box could not be pressed. The page became taller with the download card and the bottom bar (Saved, Log, Private) drew over the button. The setup screen now sits above the bar.

## [2.0.1 build 148] — 2026-11-02

### Fixed
- The app closed during first-time setup, the moment the first download started. The progress bar on the download card had two kinds of animation on one view, and a release build stops on that. The bar is now two views, one for the width and one for the pulse.

## [2.0.1 build 147] — 2026-11-02

Play already had version code 146, so this is the same app with these changes on top.

### Changed
- Gemma answers about 2 seconds sooner. Its set-up (the rules and the reply shape) is built ahead, while you are still speaking, and used once. A question never sees the last one’s words. The answers themselves are unchanged.

### Fixed
- After an answer, the card could go back to its M logo with no microphone anywhere, so you could not ask again. A small mic now sits on the M whenever an answer is showing.
- A spoken question stops by itself when no words are heard for 9 seconds, or after 25 seconds. Google could stay open for a minute hearing nothing and the app waited for it.
- Fixed a rare freeze: unloading Gemma while the next set-up was being built could make the two wait on each other.

### Added
- A log-only probe for a possible early Gemma draft (docs/early-answer-plan.md). It writes timings to the phone log, never words, and changes nothing you see or hear.

## [2.0.1 build 146] — 2026-11-02

### Changed
- The version line is 2.0.1 from this build on. Build 145 stays 2.0.0.
- The Kokoro, Parakeet, and Gemma downloads show as a live card, in setup and on the home screen: one bar per download that fills as it arrives with the percent and MB, a pulse while it works, the percent while it unpacks (never an endless circle), a check when it is on the phone, and a line saying how many are ready and which one is downloading. It replaces the plain text.

### Added
- While Gemma starts, the home screen shows a bar with the time running and how long it usually takes on this phone (a 30-second guess until one is timed on the phone). It stops at 95% until Gemma is really ready, and goes away when it is.
- During first-time setup, Kokoro, then Parakeet, then Gemma download one at a time. Setup does not wait. If one stops, the app says they are optional and that the best of MemoAirem needs all three. Try again is on the home screen. No signal: they start when there is one. Gemma still needs about 3 GB free.

### Fixed
- Opening a photo in the Private folder shows the small picture at once, then the full one. Sharing waits for the full photo, so the thumbnail is never sent. Each share uses its own file name, so a share can no longer pick up the last photo’s file.
- The first time you take a photo in the Private folder, Android’s “allow camera?” box no longer locks the folder. The phone counted that box as leaving the app, so the folder closed and the photo was lost. It only happened on the first try.
- A document in the Private folder is easier to read. The title has the full width, with its tags under it, so a long name is no longer squeezed into a narrow column. The number is labeled No., and Issued and Expires sit side by side, each with its label.
- A spoken year is said as a year. “June 12, 1898” is “June 12, eighteen ninety-eight”, not “one thousand eight hundred ninety-eight”. This covers every spoken answer, Gemma’s and Airem’s. Only a number clearly used as a year changes: after a month, or after a word like in or since. “1500 dollars” and codes like 1898 are left alone.
- Gemma starts faster after the first time. The GPU prepare is saved in the app's own folder, not the cache that Android empties when space is low or that Clear cache wipes. The very first prepare still takes minutes.
- An app that was set up before the setup downloads existed (build 143 and older) no longer starts them when it opens. Only a phone that went through first-time setup picks the line up again on launch.
- After Gemma is downloaded, getting it ready shows how long the GPU prepare has been running. The first time takes several minutes. If the GPU cannot start, the CPU is used. A GPU start also needs about 1 GB free for its cache.

## [2.0.0 build 145] — 2026-11-02

### Added
- Gemma downloads on the phone. Settings → Gemma on this phone → Download Gemma. About 2.6 GB, once. No computer.
- A private backup also keeps the Gemini key and the Harbor link. Restoring that file puts them back.

## [2.0.0 build 144] — 2026-11-02

### Fixed
- A spoken answer stays on the screen while it is being said. Refreshing the saved list no longer clears it and brings the microphone back.

## [2.0.0 build 143] — 2026-11-02

### Fixed
- A spoken answer no longer includes the record id. `ids=R1` stays on the phone so Gemma can be checked, and it is not said.

## [2.0.0 build 142] — 2026-11-02

### Fixed
- Asking no longer closes the app after the answer is found. Release shrinking had removed the methods Gemma uses to speak that answer.

## [2.0.0 build 141] — 2026-11-02

### Fixed
- The microphone can start again. Release shrinking had renamed the speech options type, so Tap and speak failed before it listened.

## [2.0.0 build 140] — 2026-11-02

### Fixed
- Saving a pasted list writes the new entries in one step and shows a single “Saved” line. The spinner stops when the save is done.

## [2.0.0 build 139] — 2026-11-02

### Changed
- Photo, File, and Text no longer show the microphone. That space belongs to the capture. Back to voice brings the microphone back.

## [2.0.0 build 138] — 2026-11-01

### Changed
- File screen: Paste a file or Type. The text can be edited. Save file stores each question and its answer. Parse sends a continuous paragraph to Gemini and returns one entry per fact.

## [2.0.0 build 137] — 2026-11-01

### Added
- File screen: Paste a text. A numbered list with an answer under each question is saved as one searchable record per question.

## [2.0.0 build 136] — 2026-11-01

### Changed
- Pin it keeps the screen on while the app is in front. A dimmed screen or a return to the app comes back to that same item.

## [2.0.0 build 135] — 2026-11-01

### Changed
- Pin it replaces Hold. A pinned private item shows an orange lock.

## [2.0.0 build 134] — 2026-11-01

### Fixed
- Opening the Private folder no longer closes the app. Release protection had removed a listener class that native code still looks up by name.

## [2.0.0 build 133] — 2026-11-01

### Fixed
- A private photo can be pinched or double-tapped to look closer. The viewer is on the screen itself, so a second finger reaches it.

### Added
- Hold keeps the current private item on screen and does not lock the folder for being idle. Opening another item, or leaving that one, asks for a fingerprint or PIN.

## [2.0.0 build 132] — 2026-11-01

### Changed
- The Play release runs R8, so the app code is obfuscated above Play’s bar. The portrait lock is gone, including the one ML Kit adds, so a large screen can rotate. Status and navigation bar colors are no longer set; Android 15 retired those calls.

## [2.0.0 build 131] — 2026-11-01

### Changed
- Edit in the Private folder lands on the form. A photo saved from now on keeps its original size. Open it to pinch and zoom, and tap Share to send that photo. Photos already saved stay at the size they were stored.

## [2.0.0 build 130] — 2026-11-01

### Changed
- A Private-folder expiry question for a certificate, visa, ID, or passport uses the tag. BST tagged Cert answers “when do my certificates expire?” with the other certificates. “When does my BST expire?” and “Canadian visa” still open that one document. “Which documents expire?” still includes a seaman’s book and anything left untagged.

## [2.0.0 build 129] — 2026-11-01

### Added
- A document can be tagged ID, Cert, Visa, or Passport on the save form. Tap the tag again to clear it. A document with no tag stays by itself and is not pulled into another list. Documents saved before this still follow their title until you set a tag.

## [2.0.0 build 128] — 2026-11-01

### Changed
- “What is my ID?” lists IDs only: SSS, TIN, SID, driver’s license, PhilHealth, and the other government IDs. A passport, a visa, and a training certificate each have their own list. A seaman’s book stays a seaman’s book. “List all documents” still shows every document.

## [2.0.0 build 127] — 2026-11-01

### Fixed
- A question with nothing exact left to search for, such as “what is my ID?”, no longer returns every saved record. “What is my ID?” opens the IDs and documents. A schedule or a named day still lists what it asked for.

## [2.0.0 build 126] — 2026-11-01

### Changed
- “When is my visa expiring?” with more than one visa names them and shows a list. Tap one, and that visa’s expiry is said. The number is not said.

## [2.0.0 build 125] — 2026-11-01

### Fixed
- A visa question keeps the identifier said with it: a country, or a short name such as MCV. “Maritime crew visa” finds the MCV visa. A different visa does not stand in. Asking “when does my visa expire?” still looks at every visa.

## [2.0.0 build 124] — 2026-11-01

### Changed
- A question with no match keeps “Nothing matched” below “Answered below”. The records you can tap sit closer together and the whole list scrolls.

## [2.0.0 build 123] — 2026-11-01

### Fixed
- “When is the meeting?” with no meeting saved says so. It no longer answers with the next item on the schedule, such as work.

## [2.0.0 build 122] — 2026-11-01

### Changed — tighter second pass
- A word left out by the exact pass may match that same record once typos and endings are allowed. It cannot replace that record with a different one.
- An ending matches the stem, or the stem plus s, es, ed, or ing. “Cooking” finds “cook” and “cooks”, and does not find “cookie”.
- A three-letter stem matches only that word, so “running” finds “run”.

## [2.0.0 build 120] — 2026-10-31

### Added
- About → Open-source notices. A scrolling list of the models, fonts, and libraries, each with its licence and copyright line. Parakeet credits NVIDIA (CC-BY-4.0). FFmpeg is the LGPL copy bundled through sherpa-onnx.

## [2.0.0 build 119] — 2026-10-31

### Changed — Play upload
- Version code 119, because Play already has 118. The gallery permission (`READ_MEDIA_IMAGES`) is removed from the package. Choosing a photo still uses the system picker. Do not install this file over the debug-signed app on the phone.

The next phone test build must be ≥ 120 if this upload is installed.

## [2.0.0 build 118] — 2026-10-30

### Changed — Airem version 2
- The core logic is Airem, and this generation is version 2 (2.0.0). Play already has versionCode 117, so this upload is 118. Same app as build 117, signed with the upload key. Do not install this file over the debug-signed app on the phone.

The next phone test build must be ≥ 119 if this upload is installed.

## [2.0.0-gemma.18 build 117] — 2026-10-30

### Changed — Play upload
- Same app as build 116, signed with the upload key for Play Console. versionCode 117 is newer than the phone test build. Do not install this file over the debug-signed app on the phone. The signatures differ, and uninstalling erases the Private folder.

The next phone test build must be ≥ 118 if this upload is installed. The phone’s current test install stays on the debug key.

## [2.0.0-gemma.17 build 116] — 2026-10-30

### Added — closer questions
- A question that misses because of one extra word offers the closest record and says which
  word it left out. It does not fall through to every saved record.
- The last question’s subject is kept for one follow-up (“who is coming?”, “and Saturday?”).
  A new question replaces it. A private question does not use it.
- When nothing matches, tap the record you meant. The next question with that shape opens it.
  The list is Settings → Learning → Records you pointed at.
- “How much did these cost?” adds amounts already written in the matched records.
- Two matches: the spoken line names the other one. “sat today” is read as Saturday.

The Play release stays on build 99’s code. The next upload versionCode must be ≥ 117 so it
installs over this one.

## [2.0.0-gemma.16 build 115] — 2026-10-30

### Fixed — Settings ignored the first swipe
- The settings list sat inside a tap target, so Android treated the first flick as a tap and the
  list only moved after several tries. The list now takes the swipe itself. Tap outside the card
  to close it.

### Added — a list of words fixed on the mic
- Fix a word now files that pair under Settings → Learning → Fixed on the mic. Each line is the
  word the mic wrote and the word you meant. ✕ removes one. My words stays the list you teach
  yourself.

### Changed — fix every wrong word, then save once
- Fix words stays on the sentence. Done keeps that word and lets you tap the next one.
  Save runs the corrected line once and removes the note, schedule, or event saved from the
  wrong words.

### Changed — the listener prefers words you use
- While Google listens, it is given names, places, short titles, and words you corrected.
  If it returns more than one guess, the one that matches those words is kept. A word one
  letter off a saved word is corrected. Private titles are not sent to the listener.

### Fixed — a corrected word was still guessed as heard
- A question checks the words fixed on the mic before it decides what was said. “wen is the
  meaty” is read as “when is the meeting” before the search.

### Changed — Gemma’s sentence looks different from a saved record
- When Gemma rewrites an answer, that sentence is italic and violet. The saved note,
  schedule, or event under it stays in the normal type.

### Fixed — a corrected word left the wrong note behind
- Fixing a misheard word removes the note, schedule, or event saved with the wrong words,
  including repeats, and keeps one record of the corrected line. "It was a question" removes
  that saved record too, so a later question does not still find it.

The Play release stays on build 99's code (feat/autofill); its next build must be ≥ 116 so it
installs over this one.

## [2.0.0-gemma.15 build 114] — 2026-10-30

### Added — fix one wrong word on the big mic
- The listener sometimes writes a different word. Tap Fix a word, tap that word, type the right
  one, and save. This line is used as corrected, and the pair is remembered. The next time that
  word is heard, it already means what you typed. A private line is not remembered.

The Play release stays on build 99's code (feat/autofill); its next build must be ≥ 115 so it
installs over this one.

## [2.0.0-gemma.14 build 113] — 2026-10-30

### Added — autofill captures other browsers
- Chrome already told MemoAirem which website was open. Edge, Samsung Internet, Opera, Firefox,
  Brave, Vivaldi, DuckDuckGo, and the phone’s own browser often did not, so a sign-up there was
  never saved. Those browsers are now on Android’s autofill compatibility list. When the page name
  is missing, the address bar is read instead, and it is not stored as a username. Restart the
  browser once after installing. A password you save is listed under the website name.

The Play release stays on build 99's code (feat/autofill); its next build must be ≥ 114 so it
installs over this one.

## [2.0.0-gemma.13 build 112] — 2026-10-30

### Fixed — a strong password still never appeared in Private
- Search found nothing because the password was never stored. The website does not send
  MemoAirem’s own suggestion back, and Android often never asks to save it. Tapping
  “Use a strong password” now asks for a fingerprint or PIN and writes it into Private
  immediately, for a website or an app. It is listed under that website or app name.
  Leave Private and open the lock again, then search that name. Tap the dots to see it.
  A password you type yourself is unchanged.

The Play release stays on build 99's code (feat/autofill); its next build must be ≥ 113 so it
installs over this one.

## [2.0.0-gemma.12 build 111] — 2026-10-30

### Fixed — a strong password filled in at sign-up never reached Private
- A password you type is sent back by the page and saved. The 16-character password MemoAirem
  fills in is not: the browser does not repeat a value the app itself wrote, so the save saw an
  empty box and kept nothing. That generated password is now remembered for a few minutes and
  saved when the page sends none. A password you type still wins. It still asks for your
  fingerprint or PIN, and it still shows under the website in the Private folder. Tap the dots
  to see it.

The Play release stays on build 99's code (feat/autofill); its next build must be ≥ 112 so it
installs over this one.

## [2.0.0-gemma.11 build 110] — 2026-10-29

### Added — a wider vocabulary for the same instruction
- Asking and saving accept more words for the same thing, on the phone:
  bday / birthday, appt / appointment, meetup / meeting, booking / reservation,
  doc / doctor or document, dr / doctor, duty / shift, capt / captain,
  task / to-do / errand / chore. “Add a booking” saves a schedule. “Set a task” saves a reminder.
  “What’s on my calendar” is the schedule. Training and a drill stay different words.
  Month names are unchanged, so “deck” is not December.
- A word of your own is still “when I say … I mean …”.

The Play release stays on build 99's code (feat/autofill); its next build must be ≥ 111 so it
installs over this one.

## [2.0.0-gemma.10 build 109] — 2026-10-29

### Fixed — the mic was ending an instruction early
- A pause of about 1.5 seconds closed the mic while you were still speaking, so the last words
  were missed. It now waits 3 seconds after you pause, online and on the built-in listener.
  Tap the mic when you are done sooner. A hum still cannot hold it open.

The Play release stays on build 99's code (feat/autofill); its next build must be ≥ 110 so it
installs over this one.

## [2.0.0-gemma.9 build 108] — 2026-10-29

### Added — expiry alert on the Private lock
- The Private tile on the main screen keeps its size. The line under the lock says “2 due”
  when a document is expired or within 6 months. Names and numbers stay inside the folder.
  Open the folder once so the count can be remembered.

The Play release stays on build 99's code (feat/autofill); its next build must be ≥ 109 so it
installs over this one.

## [2.0.0-gemma.8 build 107] — 2026-10-29

### Changed — one mic, the big one
- A second small mic and the center logo were both sitting in the answer area. That area is the
  big mic until an answer is there. The small mic shows only beside the question once an answer
  is on screen.

The Play release stays on build 99's code (feat/autofill); its next build must be ≥ 108 so it
installs over this one.

## [2.0.0-gemma.7 build 106] — 2026-10-29

### Fixed — Gemma read “Dec” and “Nov” instead of the month
- A saved date was written for Gemma as “6 Dec” and “12 Nov”. Spoken aloud, those are not
  December and November. She is now given the whole month, and a short month in her sentence
  is expanded before it is said. “deck” is still a place.

The Play release stays on build 99's code (feat/autofill); its next build must be ≥ 107 so it
installs over this one.

## [2.0.0-gemma.6 build 105] — 2026-10-29

### Fixed — “what event on December 6th” missed a day “schedule on Dec 6” found
- The day was understood, then the word “6th”, “sixth”, or “six” was also required in the title.
  “Dec 6” never added that word, so only that wording showed George’s birthday. Those words are
  the date now, not a search. “deck four” is still not December 4.

### Fixed — the mic left the screen with no signal
- The answer area, where the big mic sits, could be pushed off the bottom when airplane mode
  made the status bar taller. That area no longer shrinks. After an answer, a mic stays above it.

The Play release stays on build 99's code (feat/autofill); its next build must be ≥ 106 so it
installs over this one.

## [2.0.0-gemma.5 build 104] — 2026-10-29

### Fixed — airplane mode treated speech as unavailable
- Speech recognition on this phone works with no signal. With Wi-Fi off, the mic was still handed
  to the online listener, which then failed. Offline, it now listens on the phone (the built-in
  listener when that is installed, otherwise Android’s on-device recognizer). The mic stays on screen.

The Play release stays on build 99's code (feat/autofill); its next build must be ≥ 105 so it
installs over this one.

## [2.0.0-gemma.4 build 103] — 2026-10-29

### Fixed — mic vanished in airplane mode; a December birthday was not found
- The mic button hid itself when Android said speech recognition was unavailable. Turning off
  Wi-Fi and on airplane mode does that. The button stays; a tap still explains if voice cannot start.
- “December the 6th” was not read as a date, so “George birthday on December the 6th” was saved
  with no day. It is a date now. A day that was only kept in the words still answers
  “what do I have on December 6”. “deck 4” is still not December 4.

The Play release stays on build 99's code (feat/autofill); its next build must be ≥ 104 so it
installs over this one.

## [2.0.0-gemma.3 build 102] — 2026-10-29

### Fixed — Settings still looked like Gemma was not loaded
- Opening the app already loads the model. Settings only remembered a load you started yourself,
  so it kept offering “Load Gemma” and the 20-question test. It now follows the real load
  (“Loading…”, then “Ready”). The test stays under Check and does not run on its own.

The Play release stays on build 99's code (feat/autofill); its next build must be ≥ 103 so it
installs over this one.

## [2.0.0-gemma.2 build 101] — 2026-10-29

### Changed — Gemma answers real questions (user: "move trial phase and go forward with gemma")
- A question still shows today’s answer at once. When a model is already loaded, speech waits, then
  says Gemma’s sentence only if `checkReply` accepts it. Otherwise you hear today’s sentence.
  One sentence, never two. A newer question drops a late reply.
- Gemma sees only the records the rules already matched. List-all questions stay on the rules.
  The Private folder is never read.
- The model loads once at startup when a `.litertlm` file is on the phone and memory is enough
  (GPU, then CPU). Settings → “Gemma on this phone” keeps the 20-question check.
- About → What it does mentions this. What’s new is this build.

The Play release stays on build 99's code (feat/autofill); its next build must be ≥ 102 so it
installs over this one.

## [2.0.0-gemma.1 build 100] — 2026-10-29 — TEST BUILD (branch feat/gemma)

Merged only if Ede finds it good. The Play release stays on build 99's code (feat/autofill); its next
build must be ≥ 101 so it installs over this one.

### Added — Gemma on the phone, trial only (user: "dive into this, we've got nothing to lose")
- `modules/memoairem-llm` (Kotlin, local Expo module v1): Google LiteRT-LM 0.18.0 (Apache-2.0),
  GPU first then CPU, one engine at a time, a FRESH conversation per question, temperature 0, reply
  forced into JSON ({found, answer, ids}). Model file NOT in the app — copied by USB to
  Android/data/com.valle.memoairem/files/models/ for the trial. Below Android 8 / 32-bit: never loaded.
  Logs timings and sizes only (tag MemoAiremLLM).
- `src/lib/gemma.ts` (pure, `scripts/gemma-sim.ts`): what Gemma reads (the rules' matches first, at
  most 8 records, never the Private folder), the prompts, and `checkReply` — an answer is used only
  when it names records it was really given and every number in it is in those records. 20 trial
  questions on MADE-UP records (3 must be "not found").
- Settings → "Gemma trial (test)" (`GemmaTrial.tsx`): phone check, load, run the 20 questions
  (score + speed, `[gemma]` log lines), "Try on my records" — today's answer next to Gemma's, on screen
  only, never logged.
- Nothing in how MemoAirem answers or saves changed.

## [2.0.0 build 99] — 2026-10-29

### Fixed — "when is the meeting" couldn't find the meeting (user report)
- `lib/query.ts`: meeting / appointment / activity / task / errand / booking / engagement /
  commitment / occasion are stop words (so "any meetings this week" lists every schedule item), so
  "when is the meeting" searched for NOTHING and answered with the first record (e.g. the dentist).
  They are now kept as the question's SUBJECT: when nothing else is searched for, records that
  actually say the word are the answer; if none says it, the full list stays (no change).
- `lib/command.ts`: a "note …" voice command never read its day / time — "note meeting on Saturday
  1 pm" was saved with no date, so no "when" question could answer it. A note now keeps every word
  in its title AND gets the day / time said (a bare "today" still gives no date, as before).
- Command words stayed in what was saved (user: "take note … is the instruction, not the content"):
  "take notes …" (plural) was not a command and was saved as "Take"; "write down / jot down / note
  down …", "save / write / jot a note …", "put (it) on my schedule / calendar …" were not commands;
  "book an appointment haircut" was saved as "Appointment haircut". All are commands now — only the
  content is saved.
- "set a meeting Friday 2 pm" / "create a meeting …" / "make an appointment with the doctor …" gave an
  EMPTY title, so the save was refused — the command's own word (Meeting / Appointment) is the title now.
- "take note. the WIFI password is printed on the bulletin board" opened the Private folder: the safety
  net (`holdsSecret`) fired on any "password is …". Now `NOT_A_VALUE` — when the words straight after
  is / was / : say WHERE the password is or what happened to it (printed, on, in, at, the same,
  changed, expired …) it's a normal note. Real values ("crew2026", "4471", "Ocean", "new2026") and
  "the security code on the card is 321" stay private.
- Notes weren't answering (user: "where is the chicken" found nothing; "seem notes are not being
  indexed"). Notes ARE searched (every word, every field) — the misses were question shapes:
  - where / who questions required a filled place / people field; a note keeps its place in its own
    words ("two chicken on the fridge"). Now, with a thing named (a keyword or the question's subject),
    any record naming it counts.
  - new answer intent `say`: a note (not a schedule item) without the asked field is read back AS IT IS
    — where / who / when / how much / how many ("Sam owes me 20 dollars.", "The gym opens at 6 am.").
    Also when the amount or the time is already in the title.
  - "what is on the fridge" was read as "what's on (my schedule)" → only when not followed by the / my / a …
  - "what time …" counts as a when-question; "notes / memo / about" are no longer search words ("what notes
    do I have about Sam" returned every note because "note" matched every note's type).
  - plural keywords match the singular ("chickens" → "chicken").
  - spoken lists no longer say "no date set" after a note (only after a schedule item).
- Today's own note-date fix gave "note the gym opens at 6 am" TOMORROW's date (the schedule rule adds
  today / tomorrow to a bare time) — a note with a time and no day keeps just the time.
- New check: `scripts/meeting-answer.ts` (62). All vault sims, voice-corpus, private-asr-corpus pass;
  intent-measure identical. All other script suites unchanged; intent-measure
  identical.

## [2.0.0 build 98] — 2026-10-29

### Added — MemoAirem's own tiny AI (user: "explore 3", then "A B")
- `src/lib/intentModel.ts` + `intentModel.weights.json` (18 KB): logistic regression over hashed
  words / pairs / first-last words / letter trigrams, trained FROM SCRATCH on MemoAirem's own labelled
  sentences (`scripts/intent-data.ts`, 400) by `scripts/intent-model/train.ts` (10-fold
  cross-validation). Unseen sentences: 91.8% alone; when the rules are unsure it fills the right pill
  55/66 vs the rules' 50/66. It NEVER acts alone (at 95% it would still be wrong 3 in 22) — only the
  pre-filled pill. Retrain with `--write` after adding sentences (e.g. from "What MemoAirem missed").

### Fixed — rules were SURE and wrong on new everyday sentences (found by the new data)
- "cost of the tour", "date of my flight", "time of the briefing", "location of the party", "the price of
  Barolo", "notes about the gala", "remind me what I have today" → questions (`askPhrase`); a sentence
  that STATES something ("the price of Moet is 120 dollars") stays a save.
- intent-measure now 428 sentences (+178 written): 0 wrong sure guesses.

## [2.0.0 build 97] — 2026-10-29

### Added — MemoAirem learns from you (user: "learning from it as we talk to it more"; chose 1 + 2 + 3)
- `src/lib/learning.ts`, all on the phone (MMKV), never anything private (`keepable`: no private-folder
  words, no 4+ digit numbers):
  1. **Lessons** — "It was a question" / "Save it instead" store the sentence's SHAPE (days / times /
     numbers → placeholders, small words out), so one correction covers "… tomorrow" and "… on Friday".
     `intent.ts`: a lesson is a SURE guess and beats the word rules — never the private-folder rules.
  2. **My words** — "when I say PH I mean PhilHealth" / "remember that X means Y" (said, or Settings).
     Used to understand (ask / save guess, searches, private folder voice search); saved notes keep
     your own words. Undo right after teaching.
  3. **Misses** — questions with no answer + every correction; Settings → Learning → What MemoAirem
     missed: list, Export (a readable .txt via the share sheet), Clear. "Forget everything learned".
- `VoiceLearning.tsx` in Settings → Learning; About: "Teach MemoAirem".
- Tests: `scripts/learning-sim.ts` 34; about-examples 52; intent-measure 250 (0 wrong sure).

## [2.0.0 build 96] — 2026-10-29

### Added — "list all …" voice commands (user: "list all passwords, list all IDs … show it only for user to view")
- `src/lib/listCommands.ts` `parseListAll`: list / show (me) / view / display / see / find / search / get /
  check / open / pull up / what are / all + (my) + a category — every verb means the same →
  Private: passwords · logins · accounts | IDs (IDs, ID's, I.D.s, I'd …) · cards · documents | private
  notes | everything private. Records: reminders · to-dos | schedules · events · appointments (past too)
  | notes | everything / records. Always a SURE ask (intent.ts) — never a save, never a keyword search
  ("list all passwords" used to search the words "list all" and find nothing).
- Private: the folder opens (fingerprint / PIN as always) showing ONLY that kind, a "Showing: … ✕ Hide"
  bar, and speaks the count + titles (never a password or number). Works on the folder's own 🎙 too.
- Records: `runQuery` lists by TYPE (`listRecords`), date order; "No reminders saved yet." when empty.
### Fixed — "What activities I have today" (user: "didn't yield the right response")
- query.ts: "activities / tasks / errands / to-dos / doing / commitments / bookings" were SEARCHED as words, so
  nothing matched unless a record said "activities". Now they're question words: with a day ("today")
  the day's items show; alone ("what are my activities") = the upcoming schedule. "kids activities"
  still searches "kids".
- intent.ts: "what activities …", "activities today", "my agenda this week", "any plans tomorrow" are
  always questions (before: Ask / Save pills, or a Save guess). intent-measure: 250, still 0 wrong sure.
- About: new "Lists — just to look". Tests: `scripts/list-commands.ts` 52 phrases + records;
  about-examples 50; intent-measure still 0 wrong sure guesses.

## [2.0.0] — 2026-10-28 — RELEASE CANDIDATE (branch `feat/autofill`, build 95)

### Fixed — the native version was stale (found on the phone: versionCode 73, versionName 1.12.0-voice.26)
- `android/` (generated, gitignored) was last prebuilt at build 73, so every build since carried 73 /
  1.12.0-voice.26 natively while About showed the real one. Now 2.0.0 / 95 everywhere.
  `scripts/android/app-build.gradle` = the full app/build.gradle to copy over the generated one.

### Added — Play upload signing (release builds were signed with the DEBUG key)
- `plugins/withUploadSigning.js` (+ the same in scripts/android/app-build.gradle): `bundleRelease -Pupload`
  signs with the upload key from `%USERPROFILE%\.gradle\gradle.properties` (MEMOAIREM_UPLOAD_*), never
  the project; phone test builds keep the debug key so they still install over the phone's app without
  an uninstall (an uninstall erases the private folder). Release: `debuggable false` explicit.
- iOS permission texts said "Snap → Schedule" — now MemoAirem.

## [2.0.0-autofill.9] — 2026-10-28 — TEST BUILD (branch `feat/autofill`, build 94)

### Fixed — autofill "keeps bothering me … drops the keyboard every letter" (user, build 93)
- Log check first: no repeated fill requests while typing (one request per box) — so the cause was the
  suggestion line being redrawn per key, on sites with nothing saved.
- **Coded site list** (`SiteIndex` in AutofillLogic.kt, `AutofillIndex`; module v6 `autofillIndexSync`):
  one-way HMAC tags (key in the security chip, VaultKeys "siteidx") of every saved login's place; the
  locked service offers "Unlock to fill" only where one hits. Never hides a login SiteMatch would fill
  (IndexTest.kt grid). Rebuilt by the app at every unlock / change; a save from autofill adds its place.
- Suggestions are **not filtered by typing** (`setValue(…, filter = null)`, Android 9+): gone at the
  first letter, and a password's first letters are never used to match.
- **Sign-up detection widened**: two password boxes, or one next to name / birthday boxes, and none
  marked current-password → new password (phone boxes don't count — many log-ins use a mobile number).
- Passwords under 4 characters are never saved (a test / typo).

### Added — safe delete (user: "what safeguard do we have for accidentally clicking it")
- `EraseConfirm.tsx`: open folder → fresh fingerprint / PIN → type DELETE; shows the last backup date or
  "never made a backup". Locked screen → type DELETE starts a 24-hour wait (`eraseRequest`), a normal
  unlock cancels it, then DELETE again. Replaces the two quick taps.
- Tests: Kotlin site-index 28; `safety-sim` 14; all earlier suites unchanged.

## [2.0.0-autofill.8] — 2026-10-28 — TEST BUILD (branch `feat/autofill`, build 93)

### Added — the rest of phase 3 (user: "complete the rest of the phase 3 now")
- **PIN inside autofill** (`AutofillUnlock.kt`): fingerprint prompt with "Use PIN"; straight to the PIN
  when fingerprint unlock is off / reset / locked out. Same check as the app (VaultCrypto.pinKey + the
  PIN's locked copy, synced by the app as ciphertext — `autofillPinSync`). ONE wrong-PIN count for app
  and autofill (`PinFails`, module `failsGet` / `failsSet`; JS `readFails` takes the stricter of the two).
- **Save new logins / update changed passwords**: the service asks Android for "Save to MemoAirem?"
  (SaveInfo on password / new-password boxes). `onSaveRequest` keeps the login in memory only
  (`PendingSaves`, 5 min) → `AutofillSaveActivity`: fingerprint or PIN → canary check →
  `SaveLogic.upsert` (same site + username → password updated; same password → nothing) → items +
  items_mac written as the app writes them. Never from a plain-http page or from MemoAirem itself.
- **Strong password on sign-up**: new-password boxes (autocomplete=new-password, "confirm", "sign up" …)
  get "MemoAirem · Use a strong password" — 16 characters from SecureRandom, filled into every
  new-password box.
- **Password health** (`lib/passwordHealth.ts`, `vault/PasswordHealth.tsx`): weak (short, common, only
  digits, = username, patterns) and reused passwords, folded banner, Fix → the edit form. Names only.
- **Hidden by default** (user: "screen cluttered … hidden when not requested"): the open folder shows
  only a count ("5 passwords · 2 notes · 3 documents — hidden") until a search (typed or voice — no
  extra check) or "Show all" (one press + fingerprint / PIN; "Hide all"; hidden again on lock).
  Voice search: a "background" blip as the recognizer closes no longer locks the folder (checked
  again after 1.5 s).
- New folders tell autofill about themselves at setup (before: only from the next unlock).
- Module core v5. AutofillPanel: "Fingerprint or PIN opens it".
- Tests: Kotlin save 19; `pin-sim` 19, `health-sim` 15, `save-sim` 9; all earlier suites unchanged.

## [2.0.0-autofill.7] — 2026-10-28 — TEST BUILD (branch `feat/autofill`, build 92)

### Added — phase 3 step 1: import from Google Password Manager (user: "import all my passwords from gmail")
- `src/lib/importCsv.ts`: RFC 4180 CSV (quotes, doubled quotes, commas / line breaks inside quotes,
  CRLF, BOM); Google's columns name,url,username,password,note + common other managers' names; the
  password taken EXACTLY. Site = host of the url; Google's app logins `android://…@com.bdo.app/` →
  `android:com.bdo.app` (found while testing: a bare package like com.bdo.app reads as the website
  bdo.app — the prefix stops it ever matching a web page; SiteMatch matches it to that exact app).
- `vault.importLogins`: ONE write for the whole file; same site + username already in the folder →
  skipped (the folder's copy kept); notes counted (a password item has no notes field — record shape
  fixed).
- Security & backup → "Import from Google Password Manager": fresh fingerprint / PIN → pick the file →
  "Found N logins" → Import → "NOW DELETE the exported file". Export steps shown under the button.
- Tests: `scripts/vault-sim/import-sim.ts` 16 checks; Kotlin autofill 32 (+3 for android: logins).

## [2.0.0-autofill.6] — 2026-10-28 — TEST BUILD (branch `feat/autofill`, build 91)

### Added — autofill plan phase 2: filling logins (user: "go phase 2")
- Android autofill service in the Kotlin core (`MemoAiremAutofillService`, manifest in the module,
  BIND_AUTOFILL_SERVICE). The folder is locked when Android asks, so the answer is ONE line,
  "MemoAirem · Unlock to fill", naming no login. Offers nothing unless the folder is fully in the
  Kotlin store (synced by the app: `autofillSync`) and fingerprint unlock is kept by the Kotlin core;
  never into MemoAirem itself; never into a new-password box (sign-up = phase 3).
- `AutofillAuthActivity` (see-through, AppCompat): STRONG fingerprint → the Kotlin bio copy of K →
  VaultStore (canary checked) → `Logins.select`. Matched: one fills at once, several = a list.
  None matched: ALL logins as a list with a "Not saved for <site/app> · Pick only if you trust it"
  header (Android 9+) and "saved for …" on each line. K and the items stay in that screen only.
- `AutofillForm`: username / password boxes from autofill hints, HTML type / autocomplete, input
  type, then name / id / hint words; hidden / search / button boxes and new-password ignored;
  webDomain + webScheme (Android 9+) or the app's package.
- Rules (`AutofillLogic.kt`, pure, 29 JVM checks, mutation-checked): same registrable domain
  (country second levels like com.ph handled), https only, shared hosting (github.io, myshopify.com …)
  = exact owner only, apps = exact package only; look-alikes (google.com.evil.ph, evilgoogle.com,
  punycode, evil.com.ph …) never matched. MiniJson reads the item list (no extra library).
- App: Private folder → Security & backup → "Fill passwords in other apps": three ticks (folder
  ready, fingerprint on, chosen in Android) + "Choose MemoAirem for autofill"; Chrome's "Autofill using
  another service" step. Module v4: autofillSync / autofillStatus / autofillOpenSettings.
- Phase 2 limits: fingerprint only (PIN inside autofill = phase 3), no saving, Chrome / Firefox /
  apps (Edge, Samsung Internet, Opera compatibility = phase 4). store-sim +6 checks (33).

## [2.0.0-autofill.5] — 2026-10-28 — TEST BUILD (branch `feat/autofill`, build 90)

### Added — diagnostics
- Build 89 on the phone: "vault core: Kotlin v3" and an unlock, but NO storage line — which fits both
  "already fully moved" and "not moving". Now every unlock logs `[private] storage: Kotlin core` /
  `moving (Kotlin + old copy)` / `old store (MMKV)` (+ "this build has no Kotlin storage"). No behaviour change.

## [2.0.0-autofill.4] — 2026-10-28 — TEST BUILD (branch `feat/autofill`, build 89)

### Changed — Kotlin vault core phase 1d: the folder's storage (user: "go baby go")
- `VaultStore.kt` (new, pure JVM): one file per entry under `filesDir/memoairem_vault/<id>/`,
  `v4:` + iv + AES-256-GCM(HKDF(K, "store v4")), AAD = "memoairem v4 " + entry name (a swapped file
  fails), temp file + fsync + rename (a crash leaves old or new, never half), wrong key / damage THROWS.
  17 JVM checks in scripts/kotlin-vault (StoreTest.kt), mutation-checked.
- Module v3: storeOpen / storeGet / storeSet / storeRemove / storeKeys / storeClose (synchronous),
  storeExists / storeDelete.
- `src/lib/vaultStore.ts` (new): the `Db` interface the folder code uses; `kotlinDb`, `dualDb` (read
  Kotlin, write both), `copyAll` (every entry copied, EACH read back; extras refused).
- `openWith` (lib/vault.ts, now async), `Meta.store`: absent = MMKV; MMKV + Kotlin core v3 → clean
  Kotlin store, copy + read-back → "kotlin-new", dual-write for that session; the NEXT start, when the
  Kotlin store opens the folder → "kotlin", MMKV file deleted. Kotlin unreadable while "kotlin-new" →
  the (current) MMKV copy is used and the move is retried; while "kotlin" → refused, nothing deleted.
  New folders and backup restores start in Kotlin. An older build meeting a moved folder (keys or
  storage) now says "install the latest MemoAirem — nothing is lost" instead of "keys were reset".
- `scripts/vault-sim/store-sim.ts`: 27 checks (whole move incl. photo + MAC + canary + backup key,
  dual write, promotion, tamper check on Kotlin, liar / v2 core, failure mid-move, interrupted move
  redone clean, damage after the move, older build, delete, new folder + restore in Kotlin).

## [2.0.0-autofill.3] — 2026-10-28 — TEST BUILD (branch `feat/autofill`, build 88)

### Changed — Kotlin vault core phase 1c: the keys (user: "go")
- `VaultKeys.kt` (new): the PIN pepper encrypted under a Keystore AES-256-GCM key
  (`memoairem_core_wrap_v1`, own SharedPreferences `memoairem_vault_core`); the fingerprint copy of K
  under a per-use, STRONG-biometric, enrollment-invalidated Keystore key (`memoairem_core_bio_v1`).
  Module v2 adds secretPut/Get/Delete ("pepper" only), bioAvailable/bioSaved/bioSave/bioOpen/bioDelete
  with androidx.biometric's prompt ("Use PIN" button) on the main thread.
- `src/lib/vaultKeys.ts` (new) decides where each lives (`vault_keys` in plain storage, no secrets):
  pepper moves when next needed — same value, READ BACK, only an exact match moves it and deletes the
  expo copy; fingerprint moves after a fingerprint unlock from the old store has OPENED the folder
  (one more touch → "kotlin-new"); the old copy is deleted only after the Kotlin copy has opened the
  folder once. No module / v1 module / failed self-check / mismatch / error → old store, as before.
- SAFETY (found while testing): `meta.kc` = HMAC check of K; a key that doesn't match is refused
  BEFORE MMKV is opened with it (MMKV may treat a wrong-key file as damaged). Old folders get `kc` on
  their next open.
- Tests: `scripts/vault-sim/keys-sim.ts` 31 checks (move, read-back lie, v1 core, Kotlin bio failing →
  old store, wrong-key copy never promoted and refused before opening, new folders Kotlin-first,
  Keystore wipe → recovery key, delete clears both stores); mutation-checked. vault-sim 102.
- Downgrading to a build before this one after the move: the PIN secret / fingerprint copy are then
  in a store that build can't read → the recovery key opens the folder (then set a new PIN).

## [2.0.0-autofill.2] — 2026-10-28 — TEST BUILD (branch `feat/autofill`, build 87)

### Added — Kotlin vault core, phase 1a + 1b (user chose "Kotlin vault core first")
- FIRST NATIVE CODE: local Expo module `modules/memoairem-vault` (autolinked from `modules/`).
  `VaultCrypto.kt` = byte-for-byte twin of `src/lib/vaultCrypto.ts`: scrypt (RFC 7914), PBKDF2,
  HKDF, HMAC, AES-256-GCM, base64, answer / recovery-key rules, pin / question / recovery / backup /
  tamper keys. Pure java/javax — no Android imports — so it is tested on a plain JVM here.
- `scripts/kotlin-vault/`: `vectors.ts` (made by the JS code) + `VaultCryptoTest.kt` → 75 checks incl.
  JS-made PIN / question / recovery copies and a backup file opening in Kotlin, Kotlin copies equal to
  JS byte for byte, scrypt = BouncyCastle on random input. `run.sh` compiles with Gradle's own Kotlin
  2.0.21 (no Android SDK). Mutation-checked: a broken Salsa round or key label fails.
- `MemoairemVaultModule.kt`: `scryptHex` (AsyncFunction, off the UI thread). `src/lib/vaultNative.ts`:
  at start, Kotlin vs JS on fresh random input; ONLY an exact match switches PIN / question checks to
  Kotlin (`useScrypt` hook in vaultCrypto.ts). No module / error / difference → JS as before; a crash
  later → back to JS mid-check. Logs `[private] vault core: …` and `PIN check N ms (kotlin|js)`.
- `scripts/vault-sim/core-sim.ts`: 13 checks running the JS vault against the REAL Kotlin core (via the
  JVM): JS-made folder opens with Kotlin, Kotlin-set PIN / question open with JS, lying and crashing
  cores never lock you out. Vault sims need `--alias:expo=./scripts/vault-sim/mocks/expo.ts` now.

## [2.0.0-autofill.1] — 2026-10-28 — TEST BUILD (branch `feat/autofill`, build 86)

### Added — version 2 starts: the autofill plan, phase 0 (user: "I think we are ready for ver 2" → the autofill plan)
- Branch `feat/autofill` from `feat/built-in-voice` (vault v3 proven on the phone and on a Cat S41:
  restore from backup + recovery key works, offline works).
- Password items get a "Website or app" box → stored in `location` (unused for passwords; record
  shape unchanged). `src/lib/sites.ts normalizeSite`: a web address is kept as its bare host
  ("https://www.Gmail.com/login" → "gmail.com"); an app name as typed. Shown on the card ("site"),
  matched by TYPED search (not by spoken label search). Backups carry it automatically.
- items-sim +10 checks (18).

## [1.13.0-voice.38] — 2026-10-28 — TEST BUILD (branch `feat/built-in-voice`, build 85)

### Added — secret question (user: "create a secret question … to unlock still need name, e-mail +
### the answer"; chose ONE question)
- Fourth locked copy of K in the v3 meta (`sq`): key = HKDF(scrypt(name ‖ e-mail ‖ answer, N=2^15) ‖
  Keystore pepper). The pepper keeps it THIS-PHONE-ONLY: copied files can't be guessed offline, and
  every try goes through the app's shared wrong-try pauses (with the PIN). It never opens a backup
  file — a new phone still needs the backup + recovery key. Answers normalised (case, spaces,
  punctuation, accents). Refused: answer = name / e-mail / words of the question / common answers.
- `setPin` now KEEPS the Keystore pepper (the question needs it); only a wiped Keystore makes a new
  one, and then the question is dropped.
- UI: locked screen "Forgot PIN?" → secret question or recovery key → new PIN; Security & backup →
  Set / Change / Remove (fresh check first); Settings → You notes the question uses the name and
  e-mail as they were when it was set.
- vault-sim: +21 checks (101).

## [1.13.0-voice.37] — 2026-10-28 — TEST BUILD (branch `feat/built-in-voice`, build 84)

### Changed
- User: "triggering the private folder without ID no. or pin or password, it does not need to warn
  me". The Google-heard-it note now needs a secret in the spoken draft: `draftHasSecret` (lib/
  privateSearch.ts) = a password / PIN or a number / note text. "save my passport", "save my PC pin"
  → no note; "save my PC pin 4821", "my SSS number is 34-…" → note. 10 phrases added to
  scripts/private-asr-corpus.ts (113 checks).

## [1.13.0-voice.36] — 2026-10-28 — TEST BUILD (branch `feat/built-in-voice`, build 83)

### Security — private folder "vault v3" (user: "certain about the security of our private folder …
### protect users from being locked out — recovery key, double authentication or PIN code")
- Review findings fixed: (1) the fingerprint was only a screen in front of a PLAIN Keystore key — now
  the key copy is a Keystore entry with `requireAuthentication` (Android releases it only after a
  STRONG biometric); (2) anyone knowing the PHONE's PIN could open the folder — now only the
  fingerprint OR the MemoAirem PIN (user's choice); (3) no recovery at all — now a recovery key +
  encrypted backup file; (5) MMKV's AES-CFB can't detect changes — HMAC over items and photos.
- `src/lib/vaultCrypto.ts` (new, pure, @noble/ciphers 1.3.0 + @noble/hashes 1.8.0, no native code):
  AES-256-GCM wraps of the folder key K; PIN key = HKDF(scrypt(PIN, N=2^14) ‖ 32-byte Keystore
  pepper); 25-char Crockford recovery key (125 bits); backup key from the recovery key; wrong-PIN
  pauses 30 s → 1 h, never a wipe; weak PINs refused.
- `src/lib/vault.ts`: v3 unlock (biometric / PIN / recovery), two-step setup (nothing written until
  confirmed), 1.10–1.12 folders move over after one phone-lock unlock (same key, no re-encryption,
  plain key deleted), change PIN, fingerprint on/off (re-made after Android resets it), new recovery
  key, export / read / merge backup, delete removes every key and copy.
- UI: `components/vault/` — PinPad (own keypad), VaultSetup, VaultGate (locked screen, Forgot PIN,
  restore on a new phone), PinPrompt (re-check before show / copy), VaultSecurity ("Security &
  backup"). Show / copy a password: strong fingerprint or the MemoAirem PIN.
- Main-mic secrets (user's choice: keep Google, warn): the folder says so when a voice draft was heard
  by Google's online recogniser (`heardByCloudRecently`, lib/speech.ts).
- Tests: `scripts/vault-sim/vault-sim.ts` rewritten — 80 checks (fingerprint reset, wrong-PIN pauses,
  forgotten PIN, Keystore wiped, tamper, backup to a new phone, new recovery key, legacy move).

### Added — onboarding (user: "name + email tied to a 6-digit PIN"; email = profile only; PIN = private folder only)
- `src/components/Onboarding.tsx` + `src/lib/profile.ts`: name, e-mail (on this phone only), private
  folder setup or restore, optional Gemini key. Shown once (also once after updating). Replaces "open
  Settings when there's no key". Settings → "You" edits the profile; "Hi, <name>" above the big mic.

## [1.12.0-voice.35] — 2026-10-28 — TEST BUILD (branch `feat/built-in-voice`, build 82)

### Changed — About brought up to date (user: "don't forget to update the about us info")
- Intro: "your voice, photos, files and quick notes". "What it does": the six original lines kept
  verbatim + One mic for everything · Understands you without signal (Parakeet + noise cleaner,
  Phone only) · A voice of its own (Kokoro) · Plans years ahead · 🔒 Private folder (passwords,
  notes, documents, expiry flags, "when does my passport expire?").
- Voice commands rewritten: one big mic; saving; NEW "Dates, even years ahead"; private asks (any
  saved card, expiry questions, "say HDMF" tip; title + expiry date are the only things spoken);
  private saves (every ID → document; passwords; notes); inside the folder (+ Document, expiry
  colours, Make it a document); NEW "Without signal"; "stay normal" fixed — it still listed
  "what's my passport expiry", which now goes to the Private folder.
- `scripts/about-examples.ts`: all 41 example phrases checked against the real rules (exits 1 if any
  drift).

## [1.12.0-voice.34] — 2026-10-28 — TEST BUILD (branch `feat/built-in-voice`, build 81)

### Changed
- User: "make it like a watermark style". voice.33 only faded the app icon (a dark square). Now the
  card shows the bare M: new `assets/memoairem-watermark.png` (cropped from
  memoairem-monogram-navy.png, 512×500, the M in the alpha only), `tintColor` ink, 9 % opacity,
  96 pt — chosen from a 6 / 9 / 14 % preview. Header logo unchanged.

## [1.12.0-voice.33] — 2026-10-28 — TEST BUILD (branch `feat/built-in-voice`, build 80)

### Changed
- User: "tone the M logo down to a watermark instead of a solid logo". The card's idle logo
  (Assistant `styles.logo`) is drawn at 10 % opacity. The header logo is unchanged.

## [1.12.0-voice.32] — 2026-10-28 — TEST BUILD (branch `feat/built-in-voice`, build 79)

### Changed
- User (screenshot of the old Voice tab tip): the tip "Start with “set schedule…”, “remind me to…” or
  “note…”" is back on the main screen, under "Ask something or Save it" and above "⌨ Type instead"
  (BigMic), in the old Voice tab's style (Space Mono 11, muted, centred).

## [1.12.0-voice.31] — 2026-10-28 — TEST BUILD (branch `feat/built-in-voice`, build 78)

### Changed — every ID is a document (user: "yes, let's make it tidy")
- `DOC_TITLES` = every ID label (SSS, TIN, PhilHealth, Pag-IBIG added); "save my <card> number / no.
  / ID" (`cardNoteDraft`) → the DOCUMENT form; a said number goes to No. "private note …" and other
  "save my <label>" stay notes. Document quick buttons + UMID, SSS, TIN, PhilHealth, Pag-IBIG.
- "Note / ID" → "Note" (button, form heading, card tag); the note form lost its ID buttons.
- "Make it a document" on note cards: the document form pre-filled (title; first line → No.; rest →
  Notes); Save converts the SAME item (same id, photo kept, no duplicate). Card links wrap.
- Asking is unchanged — search covers notes AND documents, so all voice keywords keep working.
- Tests: docs-sim 34 (conversion in place), voice-corpus (cards → document), private-asr 103,
  intent-measure, date-corpus green.

## [1.12.0-voice.30] — 2026-10-28 — TEST BUILD (branch `feat/built-in-voice`, build 77)

### Fixed — "will it get ID expiration too"
- Known IDs (UMID, Driver's license, National ID, PRC license) and any ID saved as a DOCUMENT ("Crew
  ID") already answered. Two gaps found testing: "crew ID" also matched "Company ID" (both have "ID")
  → `matchPrivateBest` keeps only titles containing every word asked, when there are any. And an ID
  saved as a NOTE (SSS, an older "Passport" note) said "I couldn't find …" → now "Your SSS is saved as
  a note, with no expiry date. Add it as a document to keep one."
- docs-sim: 31 checks.

## [1.12.0-voice.29] — 2026-10-28 — TEST BUILD (branch `feat/built-in-voice`, build 76)

### Added — expiry questions (user: "if user asks when my passport expires, can it query that" → "yes,
expiry date — titles are fine" to say aloud)
- `parseExpiryAsk` (privateSearch.ts): "when does my passport expire", "when my passport expire",
  "what's my passport expiry", "is my passport expired", "has my visa expired", "what's the expiry
  date of my passport", "my passport expiring?", and "which documents expire / are expiring / any
  expired". A question word (or "?") is required — "my passport expires in March" stays a statement.
  Known documents → the Private folder at once; other names ("contract") only when normal records
  have nothing for them.
- `spokenExpiry` (privateDocs.ts): "Your passport expires on 4 March 2032, in 5 years." / "… expired
  on …, 57 days ago." / "I couldn't find Visa in your documents." / for "which documents": the ones
  expired or due within 6 months, else "The next to expire is your US visa, on 1 June 2029, in 2
  years." TITLE + DATE only — never the number (tested). Shown on screen too.
- Assistant: expiry check first; MainScreen passes `initialExpiry`; PrivateScreen answers after the
  unlock from documents only. intent.ts: expiry questions are sure asks.
- voice-corpus: "what's my passport expiry" moved out of ASK_NORMAL. Tests: docs-sim 28,
  private-asr 99, voice-corpus, intent-measure (0 wrong sure), date-corpus green.

## [1.12.0-voice.28] — 2026-10-28 — TEST BUILD (branch `feat/built-in-voice`, build 75)

### Added — Private DOCUMENTS (user: "documents folder on the private folder … Documents name, No., Date
issued, Date expired" + chose: place of issue, notes; own section; warning in-app only; voice opens it)
- `lib/privateDocs.ts`: mapping onto the FIXED record shape — type `private-doc`, title = name,
  people = No., date = date EXPIRED, location = place of issue, notes = "Issued: YYYY-MM-DD" line +
  free notes (`packDocNotes` / `unpackDocNotes`). `readDocDate` (app date reader, DAY FIRST, year
  required, whole box must be the date), `expiryStatus` (expired / within 183 days / ok), `sortDocs`.
- `lib/vault.ts`: kind `'doc'`, `PrivateInput.doc`, `isPrivateDoc`; editing keeps the kind.
- PrivateScreen: "+ Document" (add row: Password · Note / ID · Document); document form with quick
  buttons (Passport, Seaman's book, SRB, Visa, Driver's license, Other), No., Date issued / Date
  expired with a live "→ 5 Mar 2027" read-back, Place of issue, Notes, photo; Save refuses an
  unreadable date. List: "Documents" section first (soonest expiry first, "N need attention"), red
  border + tag when expired, amber within 6 months; Copy No. (clipboard wiped in 30 s); then
  "Passwords & notes". Nothing leaves the folder.
- Voice: Passport, Seaman's book, SRB, Driver's license, UMID, National ID, PRC license, Visa (new
  label) → the DOCUMENT form (number in No.); SSS / TIN / PhilHealth / Pag-IBIG stay notes. Existing
  notes titled "Passport" etc. stay notes (no migration).
- Tests: `scripts/vault-sim/docs-sim.ts` (21), private-asr 82, voice-corpus (doc/note by title),
  vault-sim, items-sim, intent-measure, date-corpus green.

## [1.12.0-voice.27] — 2026-10-28 — TEST BUILD (branch `feat/built-in-voice`, build 74)

### Fixed — dates a year or more ahead (user: "how is date reminder for next year and two years from now")
- Found by running the real parser (2026-10-28): the spoken YEAR was ignored — "March 5, 2028" saved
  as 2027-03-05, "3rd November 2027" as 2026-11-03 — and "next year", "in 2 years", "March 2028",
  "in March next year", "5/3/2027" gave no date. Questions "next year", "in 2027", "March 2028" had no range.
- `matchDatePhrase` (lib/query.ts) — ONE reader for saving and asking: ISO; numeric DAY FIRST
  (5/3/2027 = 5 March — the user's choice); month-day + year / "next year"; month + year; "next year
  in June"; "in N days/weeks/months/years", "N … from now" (words one–twelve, "a couple of");
  "next / this / last year"; "in / for / during / by 2028". Returns a window (questions) and a point
  (reminders): "March 2028" = the month / March 1; "next year" = all of it / today's date next year.
  A year alone with no cue ("room 2027", "the 2027 Barolo") is not a date.
- `interpret` uses it before weekdays (bare month/day keeps its old place); `Interpretation.point`;
  `parseWhen` prefers point. `command.ts` takes the whole phrase into "when" (year kept).
- Also fixed: "sign on" / "log on" lost their "on" in titles ("Sign on in Miami" → "Sign").
- `scripts/date-corpus.ts` — 29 checks, expectations computed from the run date. voice-corpus,
  private-asr, intent-measure green.
- Still a gap: a month with no year as a QUESTION ("events in June") has no range.

## [1.12.0-voice.26] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, build 73)

### Added — the user's rule: "save my + label should trigger private folder note creation with the label
already filled"
- `SAVE_MY_LABEL` / `myLabelDraft` (last of the save rules, after IDs, cards, named secrets): "save /
  store / keep my <1–5 word label>" (+ optional value with a digit) → Private NOTE, title = label
  ("save my SRB", "save my locker code 1234", "Save my wifi." → "Wifi"). Without "my" it stays normal
  ("save dinner with Sam on Friday", "save the SSS contribution receipt").
- PINs / passwords keep the PASSWORD prompt (voice.25), label filled, secret behind the fingerprint.
- private-asr-corpus: 73 checks; voice-corpus, intent-measure green.

## [1.12.0-voice.25] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, build 72)

### Fixed — device: "saying 'save my pc pin no.' triggers a private folder look-up instead of saving a
new private note"
- `askForPassword` read "save my <X> password / pin" as a QUESTION (subject "save X"). A sentence
  starting with a save verb is never a password question now.
- New `SAVE_NAMED_SECRET` (first in `parsePrivateSave`): "save my <name> pin / password / passcode /
  login (no. / number / now) (value)" → the PASSWORD prompt (hidden behind the fingerprint), titled
  with the name ("PC", "Laptop", "ATM"; 2–3 lower-case letters upper-cased). "Save my PC pin." (no
  number word) used to match nothing — it would have been saved as a NORMAL note.
- "PIN now" no longer captures "w" as the PIN (now|number|num|no with a word boundary).
- private-asr-corpus: 63 checks; voice-corpus, intent-measure (0 wrong sure guesses), vault sims green.

## [1.12.0-voice.24] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, build 71)

### Added
- InfoWindow: a "more ⌄" marker at the bottom of the result list ONLY when the cards overflow the
  space (content height > view height) and you haven't scrolled to the end (user: "only if it's a
  long list and the view can't fit"). Resets per answer; never shown for a short list.

## [1.12.0-voice.23] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, build 70)

### Changed
- User: "when photo, file or text is pressed the mic stays — it's at the bottom now and not in the
  way". MainScreen keeps the Assistant mounted with a panel open (it hides only its idle logo,
  `panelOpen`) and shows BigMic whenever idle with no answer, panel or not. Speaking closes the
  panel (`onFocusAsk`). "← Back to voice" stays as a plain close.

## [1.12.0-voice.22] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, build 69)

### Changed
- User: "when unsure the Ask and Save buttons appear — make sure to buffer so they show". When the
  pills appear, MainScreen scrolls zone 1 to the end (`onPillsShown` → `scrollToEnd`, 80 ms after
  layout; a stable callback, so once per appearance). With no answer yet the answer area is at its
  150 pt minimum, so the card normally fits anyway; this covers a tall card (long words, status
  line, the Private hint).

## [1.12.0-voice.21] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, build 68)

### Changed
- User: "under the mic 'Tap and speak', below 'Ask something or Save it', under it 'Type instead'".
  BigMic shows "⌨ Type instead" under the two lines (`micRef.startTyping` opens the typing box in the
  card); the card keeps only "Close typing" while typing.

## [1.12.0-voice.20] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, build 67)

### Changed — main screen reorganised (user, on a screenshot: "the mic position replace places with
the M logo"; "today, this week, this weekend just above the folders, but separately")
- Idle: the card shows tabs + the M logo (64 pt) + "⌨ Type instead"; the answer area shows `BigMic`
  — the mic (scaled 1.35×) + "Tap and speak / Ask something or Save it" — where the logo and "Your
  answers appear here" were. `BigMic` speaks into the Assistant via `micRef` (MicHandlers).
- Once words arrive the Assistant goes compact (small mic · words · ⓧ, pills when unsure) and the
  answer area shows the InfoWindow. ⓧ also clears the answer (`onReset`) → back to the big mic.
  `onIdleChange` tells MainScreen when to show the big mic (idle, no answer, no panel open).
- Time chips: a separate row in MainScreen just above the BottomDock (hidden while a panel or a
  folder is open), asking through `micRef.askChip`; no "Save it instead" after a chip.
- Not seen on a device yet.

## [1.12.0-voice.19] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, build 66)

### Fixed
- Device: "when I press photo, file or text I have no way to go back to voice". Capture: tapping the
  open tab again closes it; every open panel ends with "← Back to voice" (`setOpen(false)`, a back arrow — the user: "on text I don't need the mic button there").
  MainScreen: the mic area (Assistant) is hidden while a panel is open.
- Found while there: the status line lived only inside the open panel, so mic errors set from the
  voice screen ("Didn't catch that…", "needs network…") never showed. Assistant now renders
  `StatusLine` under the mic; it clears when new words arrive.

## [1.12.0-voice.18] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, build 65)

### Fixed — device: "background noise like someone talking from afar or a hum — it thinks I'm still
talking and waits a while before it executes"
- Google (online, one-shot): Google ends a session by its own rules. Now when the words haven't
  CHANGED for 1.5 s (`WORDS_STILL_MS`), MemoAirem calls stop() — Google sends the final words and
  ends. A hum produces no words. Not for continuous sessions. `[listen] google: words unchanged …`.
- Built-in (offline / Phone only): the noise cleaner removes hum but not a distant VOICE. Endpoint
  now learns YOUR level (`voice`, running average of your speech) and, once you've spoken, only
  sound ≥ 35 % of it (`OWN_VOICE_SHARE`) keeps the mic open — a talker across the room is typically
  10–15 dB quieter. Soft voices are still heard from the start (nothing to compare with yet).
- listen-sim: 58 checks; the distant-voice check fails with the rule off and passes with it.

## [1.12.0-voice.17] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, build 64)

### Fixed — device: "the answer or result is not showing, only the voice result — need the same
result like previously"
- Cause (MainScreen layout): zone 1 grows with its content and the answer window takes the rest,
  min 150 pt. The voice.15 card (tabs + big mic + hints + words + pills + chips) is much taller than
  the old ask bar, so the answer window sat at its minimum, mostly out of view.
- Assistant: once you've spoken (or after an answer / save) the card is ONE row — small mic · your
  words · ⓧ; the big mic + "Tap and speak / Ask something or Save it" only when idle. Pills (Ask ·
  ⓧ · Save, the user's spec) only when unsure; the row's ⓧ hides while they show.
- MainScreen: with a result, the answer window's minimum is 320 pt (`infoOpen`); zone 1 scrolls.
- Not seen on a device yet.

## [1.12.0-voice.16] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, build 63)

### Changed — act at once on a clear instruction (user: "let it execute the command if it's a clear
instruction — ask and save is just the fallback to be pressed")
- `classifyIntent` (lib/intent.ts) → `{ intent, sure }`. Sure: Private rules; save triggers ("set
  schedule", "remind me", "note", "save" …); full statements (4+ words) that don't look like a
  question; questions with a clear opener ("what's / what is / when is / how much / do I / is there /
  any / show my …"), a bare time window ("today"), or a "?".
- Measured (scripts/intent-measure.ts, 240 sentences): SURE 205 (85.4%), **0 wrong**; the other 35
  (14.6%) show the pills — they include all 6 the classifier gets wrong. The script now exits 1 if
  any sure guess is wrong.
- Assistant: on the final words a sure guess runs (ask / save); unsure → pills (guess filled).
  After an answer (by itself or via the pill): "Answered below · Save it instead · ⓧ". After a save:
  "✓ Saved as … · It was a question". `ask()` returns whether the answer shows below (not when it
  went to the Private folder).

## [1.12.0-voice.15] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, build 62)

### Changed — layout per the user's spec ("voice is now the default interface; photo, file, text on
top, equal; under it the mic; wording under it 'Tap and speak — Ask something or Save it'; after
talking and pause the pill button Ask left, Save right, a small icon to clear between them; today /
this week / this weekend remain")
- MainScreen: ONE card (`oneCard`) holding Capture (`flat` — no card of its own; three tabs share
  the width equally, taller, 16 px icons, 13 px labels) and the Assistant mic area.
- Assistant: under the mic "Tap and speak" / "Ask something or Save it" ("Listening…" /
  "Getting your words…" while busy). Your words, then pills: **Ask** (left) · ⓧ 34 px clear
  (middle) · **Save** (right). The guess is the filled pill, the other outlined; both always act;
  nothing runs until tapped. "🔒 Goes to your Private folder" shows for passwords / IDs.
  "✓ Saved as … · It was a question" after a save. Chips kept; "⌨ Type instead" moved under them.
- Removed the "Sounds like …" line and the "Ask instead / Save instead / Clear" links (the pills
  and ⓧ replace them). Not seen on a device yet.

## [1.12.0-voice.14] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, build 61)

### Changed — clean main screen (user, on a screenshot: "remove the ask about, mic, speaker …
speaker should always be on … clean interface, just one big microphone to tap")
- `Assistant.tsx` is now a card with ONE big mic (MicButton `big`, one-shot). Under it: your words,
  the guess, a full-width **Ask** / **Save** button (nothing runs until tapped), "Ask instead" /
  "Save instead", "Clear"; after a save "✓ Saved as … · It was a question". Time chips stay.
- Removed: the "Ask about…" text box, the small mic, the 🔊 speaker toggle (answers always spoken —
  `speakOn` keeps its default, on; nothing else turns it off), and the **Voice tab** (Capture TABS
  entry commented out; its code is kept, unreachable, to restore by one line). Tabs: Photo / File / Text.
- Kept on purpose: "⌨ Type instead" opens a small text box + Ask — typed input is the path that
  always works when voice can't (CLAUDE.md core principle).
- Not verified on a device yet (layout). Long dictation: the mic is one-shot — Google / the built-in
  listener end after a pause (built-in: 1.5 s); tell me if long notes get cut.

## [1.12.0-voice.13] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, build 60)

### Added — one mic for asking and saving (user: "unify the mic … with the final button to tap is
either save or ask as a safety net")
- `lib/intent.ts` (`intentOf`): word rules, Private rules first. Measured with
  `scripts/intent-measure.ts`: 216/222 = 97.3% (all saves and questions already in the tests right;
  misses = short fragments with no "?" and odd statements starting like questions); + 16 sentences
  in the listener's punctuation ("Today." needed `[?.!]` endings — fixed).
- Ask bar (`Assistant.tsx`): the mic no longer auto-asks. On the final words the big button becomes
  **Ask** or **Save**; nothing runs until it's tapped. A line under the bar shows the guess with
  "Save instead" / "Ask instead"; a private save shows "🔒 Save opens your Private folder". Save
  uses the Voice tab's path (`saveVoiceNote`: labels, read-back; passwords / IDs → Private prompt).
  After a save: "✓ Saved as <type>: <title> · It was a question" → `removeSaved` + ask. Typing keeps
  Ask. Mic errors now show on the status line. Empty end-of-session results never wipe the text.
- Voice tab unchanged (kept for long dictation — the ask-bar mic is one-shot).
- About → Voice commands: "One mic — ask or save".

## [1.12.0-voice.12] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, build 59)

### Added
- Device finding: saying "… ID" ("PhilHealth ID") makes the built-in listener hear the name better.
  Every "… ID" ask / save already worked for known IDs; the gap was "save my <unknown card> ID"
  with no "number" — now `CARD_SAVE_ID` → title "<name> ID" ("Save my crew ID." → Crew ID;
  "Save my company ID 4521"). "Remind me to bring my ID" stays normal.
- About → Voice commands: the "add ID" tip. private-asr-corpus: 55 checks.

## [1.12.0-voice.11] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, build 58)

### Fixed
- Device (offline): the built-in listener writes PhilHealth as "pill health" (P/F). The PhilHealth
  label now also accepts pill / pil / fill / feel + health, for asking and saving. "Remind me to
  take my pill for my health" stays a normal note. private-asr-corpus: 47 checks.

## [1.12.0-voice.10] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, build 57)

### Fixed — device (offline): "asking S R B tells me my whole schedule"
- Reproduced with the app's routing: when the listener writes the letters as "S-R-B", "S, R, B",
  "S R V" (B/V) or "SRV", nothing caught them, and the normal search — single letters aren't
  search words — had no keywords left, so it listed everything.
- SRB pattern + `compactLetters` accept hyphens and commas between letters.
- `askForLetters`: a question whose subject is only spelled letters, or one short ALL-CAPS word,
  goes to the Private folder (after the normal records are checked for that name — same rule as
  any-card). "What is my schedule?" is unaffected.
- `matchPrivate`: when nothing matches a single 3–5 letter term, titles of the same length one
  letter off are shown (SRV / SRP → SRB). Exact matches always win.
- private-asr-corpus: 40 checks. voice-corpus, vault-sim, items-sim green.

## [1.12.0-voice.9] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, build 56)

### Fixed
- Device (build 54): "what is my S R B" showed the whole week — single letters aren't search words,
  so the question had no keywords and the normal search returned everything. voice.8 already
  catches "S R B" as SRB first; reproduced and confirmed.
- voice.8's any-card ask only went private when the WHOLE question found nothing — "what is my crew
  ID number" matched a normal "Room number 8012" note on "number". Now only the card's NAME is
  checked against normal records ("crew" → nothing → Private; "room" → the note → normal).
- private-asr-corpus: + 7 routing checks in the Assistant's exact order (31 total).

## [1.12.0-voice.8] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, build 55)

### Fixed — Private folder by voice with the built-in listener (device: "save a srb no. in voice …
it's on the private folder … but why it can't find it"; "pag ibig … always comes out wrong";
"seaman's book … fails")
- **Asking for a card MemoAirem doesn't know** ("what is my SRB number") wasn't a private question —
  only the built-in ID names were — so it searched normal records and never the Private folder.
  New `askForAnyCard`: "what is/show/find my <name> number / no. / ID"; the Assistant uses it only
  when the normal query has NO results, then redirects to the Private folder (fingerprint first).
  "What is my room number" with a normal note still answers normally.
- `SRB` added to the ID list (own title, so existing "SRB" notes match).
- Parakeet (English-only) spellings, found by synthesising the phrases (Kokoro) and running the
  real Parakeet TDT v2 int8 in sherpa-onnx 2.0.1: "seaman's book" → "semen book" / "Siemen book";
  "pag ibig" → "pug e-big" / "pog e big" / "porg e-big"; "no." → "now"; "SRB" → "SRB" / "sRB".
  All now understood in saving AND asking. Hotwords were re-tested on valid audio: no effect
  (0/8) → not used.
- `compactLetters`: "S R B" / "S.R.B." / "sRB" → "SRB" in card titles and in all Private matching
  (capital letters only when spaced, so "a b" in a sentence is left alone).
- (An earlier test of mine was invalid: Kokoro silently skips words missing from its dictionary —
  "seaman's", "pahg", "ee" — so those clips never contained the words. Re-done with spellings it has.)
- `scripts/private-asr-corpus.ts` — 24 checks. voice-corpus, vault-sim, items-sim, listen-sim: green.

## [1.12.0-voice.7] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, build 54)

### Added — Parakeet as a second built-in listener (device: "whisper had difficulty with my accent")
- `sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8` (NVIDIA Parakeet TDT 0.6B v2, **CC-BY-4.0** —
  attribution needed in licence notices): 482,468,385-byte download, ~660 MB unpacked (encoder
  652 MB, decoder, joiner, tokens, test_wavs/0.wav — no transcript file). `modelType:
  'nemo_transducer'`, int8, 4 threads.
- Verified here with sherpa-onnx 2.0.1: the pack's 7.4 s clip word-perfect, 0.62 s decode (warm,
  2 threads). The self-test's expected text is that verified output.
- Hotwords (own vocabulary): only accepted when pre-split into the model's word pieces (no bpe.vocab
  in the pack); no measurable effect on the test clip, and modified beam search worsened
  punctuation → NOT enabled. Revisit with a real recording.
- `lib/whisper.ts` now holds a model table (Whisper small, Parakeet); each downloads / removes on its
  own into `listen/<pack>/`; one is active (`listen_model`, default Whisper); only the active one
  is loaded. The `whisper*` functions mean "the active model". Startup: chosen model missing → the
  installed one is used. Removing the active one → the other takes over; removing the last also
  removes the noise cleaner.
- Settings → Listening: a card per model (download / progress / cancel / test / remove), chips to
  pick when both are installed. A new install becomes the active one and self-tests.
- `[listen]` lines name the model. listen-sim: 52 checks.

## [1.12.0-voice.6] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, build 53)

### Added — background-noise cleaner for the built-in listener (device: "performs better in a quieter
environment")
- `lib/denoise.ts`: GTCRN speech enhancement (`gtcrn_simple.onnx`, 535,638 bytes, sherpa-onnx release
  `speech-enhancement-models`, MIT) via `react-native-sherpa-onnx/enhancement`. Fetched automatically
  with the listener (and on refresh if missing) into `listen/denoise/`; removed with it.
- Live capture: mic chunk → streaming cleaner (strictly in order) → pause detection + Whisper. Tail
  flushed at stop. Cleaner failure → raw audio for the rest of the session (logged).
- Google rescue: the saved recording is cleaned (offline engine) before Whisper.
- Measured here with sherpa-onnx 2.0.1 + this model: fan-type noise 0.030 → 0.0009 (≈ −30 dB),
  speech 0.097 → 0.091; soft voice 0.0071 → 0.0063 (quiet speech kept); 3 s cleaned in 0.25 s.
- Settings → Listening → "Clean background noise" On (default) / Off; key `listen_denoise`.
- Not done: a learned speech detector (Silero VAD) — `react-native-sherpa-onnx/vad` is a placeholder
  ("not yet implemented") in every release up to 0.4.4. Pause detection runs on the CLEANED audio
  instead, which removes most of what fooled it.
- `[listen]` log lines now show cleaned AND raw levels and whether the cleaner was on.
- listen-sim: 45 checks (nothing lost through the cleaner, fallback, off switch, rescue cleaning).

## [1.12.0-voice.5] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, build 52)

### Fixed
- Device: the built-in listener delivered "(wind blowing)" as the transcript. Whisper writes sound
  labels like subtitles; `cleanTranscript` now strips (…), […], *…*, ♪…♪ anywhere, so noise-only
  audio becomes "didn't catch that" and labels inside real speech are removed.

## [1.12.0-voice.4] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, build 51)

### Fixed — built-in listener missed voices / felt slow (device report on voice.3: "slow and sometimes
no response … never capture my voice", offline). Self-test on device: 1.8 s for the pack's test clip.
- Cause found in the library: its mic capture uses Android's `VOICE_RECOGNITION` source, which has no
  automatic gain (Google's recogniser boosts its own). The fixed speech bar (0.012) sat above a
  normal voice at raw level, so nothing counted as speech → "no-speech" after 7 s. Reproduced in
  simulation. Now: bar = room noise × 3.5 (min 0.0025, max 0.05).
- The noise estimate was the average of the first 3 chunks — talking straight away taught it that
  your voice was the noise. Now it follows the quietest recent level (drops at once, rises slowly).
- Speech needs 3 chunks in a row above the bar, so a click doesn't count.
- Whisper is loaded 4 s after launch (if installed), not on first use.
- Diagnostics: `adb logcat -s ReactNativeJS` → `[listen]` lines (path taken, mic level / noise /
  bar each second, stop reason, Whisper time, word count — never the words).
- listen-sim: 37 checks (quiet mic, talk-at-once, click).

## [1.12.0-voice.3] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, build 50)

### Added — built-in listener (Whisper small.en, on the phone)
- `lib/whisper.ts`: sherpa-onnx's `sherpa-onnx-whisper-small.en` pack (606 MB download from the
  `asr-models` GitHub release), unpacked into its own folder (`listen/`, never `voices/`). Only the
  8-bit encoder/decoder + tokens are kept (~370 MB); the full-size copies are deleted (the library
  finds the int8 files by name). English, transcribe, 4 threads. Self-test on the pack's
  `test_wavs/0.wav` vs `trans.txt`, with timing, shown in Settings.
- `useSpeechToText` (`lib/speech.ts`), when the listener is installed:
  - **Online, "Google first" (default):** Google listens as before and also records what it hears
    (expo-speech-recognition `recordingOptions.persist`, 16 kHz WAV). If Google fails with an error
    Whisper can cover (network, language-not-supported, service-not-allowed, busy,
    too-many-requests, client, unknown, no-speech, speech-timeout), the error and end are held; the
    recording is transcribed and delivered as a final result. If it holds no speech, or Google never
    hands it over within 3 s, the original error shows. Recordings are deleted after use.
  - **Offline, "Phone only", or a private (`onDeviceOnly`) mic:** records directly (sherpa PCM
    stream, 16 kHz); stops after a pause (1.5 s ask / 3 s capture), after 7 s / 10 s with no speech,
    at the 60 s ceiling, or on a tap; then Whisper transcribes. No interim words.
  - Not installed: unchanged.
- Hallucination guards: Whisper never runs on audio with no speech (energy check vs the
  recording's own quiet parts); phantom lines ("Thank you.", "[BLANK_AUDIO]" …) are dropped.
- Audio longer than 30 s is split into ≤ 28 s pieces at the quietest moment between words.
- Session counter: a late result from an older session is dropped; Google's late `end` after a
  rescue is ignored.
- Dictation: `stop()` keeps the text target while Whisper is still transcribing (`finishingId`, mic
  dimmed); new `cancel()` (Voice tab Save uses it, so words can't land in an already-saved note).
- Settings → **Listening**: Google first / 🔒 Phone only (private), download with progress + Cancel,
  self-test, Remove. New persisted key `listen_mode`.
- `scripts/listen-sim/` — 34 checks of the above with mocked Google / mic / Whisper.

## [1.12.0-voice.2] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, build 49)

### Fixed (first build of voice.1 failed)
- Gradle `:dr.pogodin_react-native-fs:generateCodegenSchemaFromJavaScript` failed —
  reproduced here: `Unrecognized generic type 'ArrayBuffer' in NativeModule spec`.
  @dr.pogodin/react-native-fs **2.41.0** (2026-10-21) put `ArrayBuffer` in its TurboModule spec,
  which React Native 0.85.3's codegen doesn't support. Pinned **2.40.4** (2026-10-19): codegen
  passes (checked 2.34.0–2.40.4 here), and it has every file function MemoAirem uses.
- Build 49 never reached the phone, so it is reused.

## [1.12.0-voice.1] — 2026-10-27 — TEST BUILD (branch `feat/built-in-voice`, not on main)

### Added — built-in voice (Kokoro, offline)
- **react-native-sherpa-onnx 0.4.4** (MIT; sherpa-onnx 1.12.35) + **@dr.pogodin/react-native-fs
  2.41.0**, both pinned. Only `/tts` and `/extraction` are imported.
- **Kokoro v1.0** (`kokoro-multi-lang-v1_0`, Apache-2.0, 334 MB) downloaded once from the
  sherpa-onnx GitHub release into the app's files, unpacked on the phone (`lib/kokoro.ts`).
  12 curated English voices (US/UK ♀/♂), default af_heart. The pack's dictionary is chosen per
  voice (lexicon.txt = US or UK — the library otherwise picks gb-en alphabetically).
- Playback through the library's PCM player; chunks written in order; a 350 ms tail before stop
  (its stop flushes the buffer and would clip the last word).
- **Settings → Voice:** "Speaks with: Phone / Built-in (Kokoro)", download with progress + Cancel
  (continues if Settings closes), voice chips with preview, Remove.
- **Fallback both ways** (`lib/speech.ts`): Built-in errors → the phone speaks; Phone selected but
  silent for 4 s (engine stopped by ColorOS) or reports an error → the built-in voice speaks (when
  installed). Stop cancels a pending fallback.

### Build safety
- `package.json expo.autolinking.exclude`: `@kesha-antonov/react-native-background-downloader`
  (sherpa's optional download helper — unused; npm installs it as a peer).
- `plugins/withNoDuplicateMmkv.js`: excludes `com.tencent:mmkv-shared` (added by sherpa for that
  helper) — react-native-mmkv v4 already ships MMKV; one MMKV in the APK. sherpa's own Android code
  doesn't use MMKV.
- Verified here: autolinking (sherpa + fs linked, downloader not), prebuild output (exclusion in
  app/build.gradle), type-check, speech-logic simulation 11/11. NOT verified: Gradle build, device
  speed/quality — the user's first build is the test.

### Known / later
- sherpa bundles LGPL FFmpeg — license notices needed before any store release.
- First answer after app start waits for the voice to load.

## [1.10.15] — 2026-10-27

### Changed (user rule: "save" + card name + "number" → private save)
- **Any card or ID name works**, not only the known IDs: "save (my|the) <1–4 word name> number /
  no. / num / #", optionally followed by the number itself — "save my bank card no.", "save my
  crew ID number", "save my BDO account number 1234-5678-90" → Private note, the name as its title
  ("Bank card", "Crew ID"), the number filled in when said (`privateSearch.cardNoteDraft`). Works
  on the main screen and the Voice tab. Only the number may follow — "save the room number 8012 for
  the guest" stays ordinary. About → Voice commands updated; voice-corpus + 10 checks.

## [1.10.14] — 2026-10-27

### Fixed (device report: "save my pag ibig id no." / "save my passport no." on the main screen)
- **Saving an ID without saying the number wasn't recognised** — the ID rule needed the number
  in the sentence. Now an explicit save ("save / store / keep / add / record / remember / put
  (my) <ID> (ID / no. / number)") opens the Private note prompt with the title filled in and the
  cursor on the number box (`privateSearch.idNoteDraft`). Only when nothing but number-words follow
  the ID — "save the SSS contribution receipt" stays an ordinary note.
- **The main screen never checked for private SAVES** — only the Voice tab did, so "save my
  passport no." (or even "my SSS number is …") ran as a normal search there. `Assistant.ask` now
  checks `parsePrivateSave` after the private-search check and opens the Private prompt.
- About → Voice commands updated. `scripts/voice-corpus.ts` + 9 checks (save-my-ID: 9/9).

## [1.10.13] — 2026-10-27

### Added
- **Voice commands list** on the About screen (tap the M logo), collapsed by default like What's
  new: save by voice (set schedule / remind me to / note, or no trigger), 🔒 ask for something
  private on the main screen, 🔒 save privately on the Voice tab, search inside Private, and what
  stays normal on purpose. Every example on it was run through the real parsers.

## [1.10.12] — 2026-10-27

### Added
- **Note / ID items in the Private folder** (`type: "private-note"`; passwords keep "private" —
  existing items unchanged). Prompt: What is it · Number and details (multi-line), quick buttons
  TIN · SSS · PhilHealth · Pag-IBIG · Passport · Other, optional photo. Shown in full once the folder
  is unlocked (no second fingerprint — the user's choice); Copy (clipboard wiped after 30 s);
  "note / ID" tag. "Add password" and "Add note / ID" replace "Add private item".
- **Ask on the main screen, see it in Private** (`privateSearch.parsePrivateSearch`): besides
  "password search …", a question that simply ASKS for an ID or a password is redirected —
  "what's my SSS number?", "what is my TIN", "what's my gmail password", "password for netflix",
  "show me my bank PIN". The folder opens, asks for the fingerprint, shows the match; only titles
  are spoken. Tasks ("remind me to change my password"), facts with a value ("the wifi password is
  …") and other questions ("what's my passport expiry", "when do I pay my SSS contribution") stay
  normal.
- **Spoken ID numbers go to Private only** (`parsePrivateSave` → note draft): an ID word (TIN, SSS,
  PhilHealth, Pag-IBIG/HDMF, Passport, UMID, PhilSys/National ID, driver's license, PRC, seaman's
  book/SIRB) followed by a value with ≥ 5 digits — "my SSS number is 34-1234567-8". "private note …"
  now opens the note prompt. Mentions without a number ("pay my SSS contribution on the 10th") stay
  ordinary voice notes.
- Search never looks inside a note's number (titles + usernames only, as for passwords).

### Tests
- `scripts/voice-corpus.ts`: + ID saves / non-saves / private questions / normal questions incl.
  all 82 label sentences — 103/103. `scripts/vault-sim/items-sim.ts`: + note items (9/9).

## [1.10.11] — 2026-10-27

### Fixed (device report: "couldn't be read with this phone's key")
- **Root cause:** MMKV keeps ONE open copy per storage name for the whole app session, and a
  second open of the same name returns that copy and IGNORES the key passed in (MMKV core 2.4.1,
  `MMKV.cpp` `getMMKVWithID`). Every folder used the name `vault`, so **Delete → start a new one in
  the same session** made a new key but kept writing with the DELETED one. It worked until the app
  restarted; then the new key couldn't read the file. "Delete it and start a new one" repeated the
  same mistake, so it broke again after every restart. Reproduced in a simulation that copies
  MMKV's rule; normal use without a delete was never affected.
- **Fix (`lib/vault.ts`):** each new folder gets its OWN storage name (`vault-<random>`, stored
  with its key in the Keystore entry as JSON); Delete removes the storage through MMKV
  (`deleteMMKV`, which also closes MMKV's open copy) — never opens it without its key; and a guard
  refuses to open any storage name with a second key in one session.
- Folders made by 1.10.0–1.10.10 keep working (plain key entry → storage `vault`). One damaged by
  this bug now says so plainly; its contents were written with a deleted key and can't be
  recovered. Delete it once more — the new folder uses the fixed path.
- `scripts/vault-sim/` — lifecycle simulation (16 checks: the bug, repeated delete/new cycles with
  restarts, delete from the locked screen, an old healthy folder, the safety refusals) + item checks
  (5). Excluded from the app's type-check (`tsconfig.json`).

## [1.10.10] — 2026-10-26

### Added
- **Voice search in the Private folder** — a mic on the search box. Spoken searches match the
  LABEL (what it's for) only (`matchPrivate(..., { titleOnly: true })`); typed searches still match
  labels and usernames. With 🔊 on, the titles found are spoken ("Found Netflix. It's on the
  screen."); passwords never are. Uses the main ask bar's quick recognizer (not the on-device-only
  setting the removed prompt mics used) — it only hears the label.
- Lock guard for it: a "background" event while the search mic listens doesn't lock mid-search;
  when the mic stops, the folder locks if the app is still in the background. The mic stops
  whenever the folder locks or closes; idle lock doesn't count down while it listens.

## [1.10.9] — 2026-10-26

### Removed
- **Mics in the Private prompt** (Username, Password). On device they cut out and pressing one
  sent the user back to the locked screen with the fingerprint prompt — unreliable, so removed on
  the user's call. Entry is typed; voice entry stays on the Voice tab ("save this password for …"
  → the prompt opens pre-filled). The 1.10.8 on-screen "what happened" list is removed too; its
  events still go to the phone log as `[private]` lines. `speech.ts` keeps the `onDeviceOnly`
  option (unused now).

## [1.10.8] — 2026-10-26

### Fixed
- **Private prompt mics cut you off** at the first pause — they were single-phrase. Now
  `continuous` (same listening window as the Voice tab, still on-device only).

### Investigating (device report, 1.10.6/1.10.7)
- Pressing a Private-prompt mic took the user back to the locked screen with the fingerprint
  prompt appearing on its own (= the folder screen restarting). No code path found that does
  this, so this build adds a DIAGNOSTIC trail instead of a blind fix: "screen opened #n",
  "app background/active", "unlock asked", "mic error: …", "locked: <reason>" — shown in small
  print on the locked screen and logged as `[private]` lines (ReactNativeJS in logcat). No secrets.

## [1.10.7] — 2026-10-26

### Fixed
- **Private prompt: the password box was cramped** (sharing one line with Show, Make one and the
  mic), so a password couldn't be seen whole. The box now takes the full width (larger mono text);
  Show · Make one · 🎙 sit on their own line below it. (Found on device, 1.10.6.)

## [1.10.6] — 2026-10-26

### Changed
- **Bottom dock is one minimalist line:** Saved · Log · Private side by side (icon, name, small
  count; Private shows a teal lock and "locked"). The dock's Export buttons and chevrons are gone —
  Export is in the Saved / Capture log folder headers (FolderScreen). "Capture log" is labelled
  "Log" in the dock to fit; its folder screen keeps the full name. The dock is about half as tall,
  so the answer window gets more room.

## [1.10.5] — 2026-10-26

### Added
- **Copy password** on each private item: fresh fingerprint / PIN, then onto the clipboard;
  wiped after 30 s (`lib/secureClipboard.ts`). The wipe only clears the clipboard if it still holds
  that password (SHA-256 compare — the password isn't kept in memory); if Android paused the timer
  in the background, it runs as soon as MemoAirem opens again; if the clipboard can't be read
  (background, Android 10+) it's wiped anyway. New library: expo-clipboard (SDK 56).
  Limit: expo-clipboard can't mark a copy SENSITIVE, so Android 13+'s copy preview may show it
  briefly and Gboard's clipboard history may keep its own copy — stated in the folder.
- **Make one** — a 16-character password generated on the phone (`lib/passwordGen.ts`):
  upper, lower, digit, symbol (one of each guaranteed), no look-alikes (O 0 I l 1), unbiased
  rejection sampling from expo-crypto, shuffled. Tested on 20,000.
- **Idle auto-lock:** the unlocked folder locks after 1 minute with no touch or typing, even with
  the screen on (not while a fingerprint check, the camera or the gallery is open).

## [1.10.4] — 2026-10-26

### Changed
- The Private prompt focuses the first EMPTY box when it opens (keyboard up): a voice draft
  "save this password for netflix" → Username; a new item → What is it for. Keyboard "Next" moves
  What for → Username → Password.

## [1.10.3] — 2026-10-26

### Changed (security)
- **Showing a password needs a fresh lock check every time.** Unlocking the folder shows titles
  and usernames; each password's "tap to show" asks for the fingerprint / face / phone PIN again
  (`vault.ts` `confirmReveal`) and hides itself after 30 s (`REVEAL_MS`). Usernames stay visible.
- Editing a stored password: its Show also needs the fresh check (a password you're typing new
  doesn't).
- Password search no longer auto-shows a single match's password — it needs the same check.

## [1.10.2] — 2026-10-26

### Fixed (security)
- **A spoken password took the normal path.** Before, "save this password bank app 1234" on the
  Voice tab was sent to Gemini, saved as a normal note, synced to Harbor (where Muse reads it) and
  read back aloud. Now `Capture.saveVoiceNote` checks `parsePrivateSave` FIRST: a password goes
  only to the Private folder — no Gemini, no store, no Harbor, no capture log, no read-back.
  - Trigger: "save / store / keep / add (this|my) password / PIN / passcode / login …", "new
    password for …", "private note …".
  - Safety net: any voice note that says a password / passcode / PIN / security code WITH a value
    ("the crew wifi password is crew2026", "my PIN is 5566"). Merely mentioning one ("remind me
    to change my password", "I forgot my gmail password") stays an ordinary note.
  - While it's heard, the Voice tab hides the transcript ("Sounds like a password…") and the
    button reads "Save to Private".

### Changed
- **Private items are three fields: What is it for · Username · Password** (+ optional photo).
  In the vault: title / people / notes — record shape unchanged. The prompt opens pre-filled from
  what you said (username "ede dot v at gmail dot com" → ede.v@gmail.com); nothing is stored until
  you unlock and tap Save. Leaving the folder or the app drops an unsaved draft.
- Password box masked while typing (Show / Hide); list shows "user …" and "pass ••••••".
- A title is never the password: no title → "Private item" / "PIN" / "Password" (titles are spoken
  by password search). Password search no longer looks inside passwords — title + username only.
- **On-device-only dictation** in the Private prompt (`MicButton onDeviceOnly` → `speech.ts`
  `requiresOnDeviceRecognition`). If the phone can't recognise offline it says so — it never falls
  back to Google.

### Tests
- `scripts/voice-corpus.ts` adds private routing: 12 spoken passwords → Private, 5 password
  mentions + the 82 label sentences → not (the Wi-Fi password sentence now correctly → Private):
  99/99. Vault logic: 22/22 with stand-in native modules.

## [1.10.1] — 2026-10-26

### Added
- **Password search** (`src/lib/privateSearch.ts`). A question in the main ask bar (typed or
  spoken) that STARTS with a trigger — "password search …", "passwords lookup …", "private search
  …", "search my passwords for …", "find password …", "show my passwords" — is caught in
  `Assistant.ask` BEFORE the normal query: it never reaches answers, Harbor or Gemini. The Private
  folder opens, asks for the phone's lock, then shows the matches. Questions without a trigger
  ("what's the wifi password") stay normal and never see private items.
- **Offline only:** matching is plain on-phone code (word-prefix match, title hits rank above
  note hits, "Wi-Fi" = "wifi", filler words like "what's my … password" ignored). No network.
- **Spoken: titles only** ("Found Bank app. It's on the screen." · "Found 2: Bank app and Gmail."
  · "Nothing in your private folder matches netflix."), with 🔊 on. Notes/passwords are never
  spoken. A single match opens with its note shown.
- A search box inside the unlocked Private folder.
- Tested: 13 trigger phrasings, 7 normal questions that must NOT trigger, matching and wording.

## [1.10.0] — 2026-10-26

### Added
- **🔒 Private folder** — a third row in the bottom dock, for passwords, codes and photos of cards
  or documents. `src/lib/vault.ts` + `src/components/PrivateScreen.tsx`.
  - **Encrypted:** its own MMKV instance (`vault`), AES-256. Key = 32 random characters
    (192 bits, `expo-crypto`) stored in `expo-secure-store` (Android Keystore); never written
    anywhere else. A canary is read back on every open, so a wrong or missing key is refused —
    never used to overwrite the folder.
  - **Locked:** opens only after the phone's own lock check (`expo-local-authentication`:
    fingerprint / face, phone PIN as fallback). Refuses if the phone has no screen lock. Locks
    when you leave the screen or the app goes to the background.
  - **Isolated:** private items never enter AppContext — so no Harbor sync, no Gemini, no capture
    log, no "Export saved", not in questions or spoken answers. Settings → Reset doesn't touch it;
    "Delete private folder" (two confirms, inside the unlocked folder) does.
  - **Screen:** screenshots and the recent-apps preview are blocked while open
    (`expo-screen-capture`); notes are hidden until tapped; no keyboard suggestions/autofill.
  - **Photos:** camera or gallery, kept full size (≤ 2000 px JPEG) inside the encrypted store;
    the camera/picker temp files and resize outputs are deleted from the cache straight away.
    No Gemini parse — you give the title. No voice capture (Android voice typing goes to Google).
  - Record shape unchanged (`type`/`via` "private").
- New native libraries: expo-secure-store, expo-local-authentication, expo-screen-capture,
  expo-crypto (all SDK 56). New Android permissions: USE_BIOMETRIC / USE_FINGERPRINT.

### Changed
- **Android auto-backup is off** (`app.config.ts` `allowBackup: false`). Normal records are still
  copied to Harbor; the private folder must never leave the phone.

### Known limits
- **No recovery by design:** losing / resetting the phone or uninstalling the app erases the
  private folder.
- A photo picked from the gallery still exists in the gallery.

## [1.9.5] — 2026-10-26

### Changed
- **Three voice labels: schedule, reminder, note.** Every voice save without a trigger lands on
  one of three — stored as `event` (shown/spoken as schedule), `reminder` or `note`. Online,
  Gemini's type is folded in (`command.ts` `voiceNoteType`): schedule-like types (event,
  appointment, meeting, booking, flight, drill, shift …) → event; to-do types (task, todo,
  errand, shopping …) → reminder; ANY other type ("wine", "price", "contact" …) → the phone's
  rules on the sentence. 1.9.4 let Gemini's own type through ("I saved it as a wine").
- Voice-saved schedule items show a **schedule** tag on the card (typed/photo events unchanged).

### Fixed (rule hardening — 89-sentence crew corpus, all correct; was 65/82)
- To-dos missed: "book …", "change …", "see …", "make sure to …", bare "need milk", and fillers
  "also / and / oh / right" before the sentence.
- Facts read as to-dos: a verb-led sentence that reaches is / are / was / costs … in its first 7
  words before any joining word is a statement — "call sign of the ship is ZCDF4", "pick up point
  is deck 2", "get well card … was lovely", "buy-in for poker is 50" are notes. Message verbs
  (tell / ask / text / email …) stay to-dos ("tell the chef the soup is cold").
- go to / visit / see / meet: with a clock time → schedule ("go to the dentist Thursday at 3"),
  without → reminder ("go to the bank tomorrow"). "sign on / off" (joining the ship) is a date.
- "Monday's menu has lobster" is a note (a possessive weekday isn't a date); a bare "today" with
  no time ("great sunset at sea today") is a note.
- Titles drop the "is" left behind when the date is taken out ("My flight home", "Formal night").

### Read-back
- Reminders say "your" for "my" ("…for you to wash your uniform") — the record keeps the words.
- A note is read with its details, so a price or code Gemini put in notes is heard.
- "$25" / "25$" are spoken as "25 dollars".

## [1.9.4] — 2026-10-26

### Fixed
- **Voice notes saved silently.** The read-back after a voice save only ran for spoken commands
  (`Capture.tsx` gated it on `wasCommand`), so a voice note without a trigger phrase saved with no
  confirmation. Every successful voice save now reads back (when 🔊 is on).
- **The mic kept listening through Save.** Tapping Save now stops the capture recognizer first: a
  live recognizer can mute the read-back on some phones (ColorOS) and could hear it and write it
  into the transcript.
- "tomorrow night" / "today morning" / "tomorrow afternoon" are taken as the day — "night" no
  longer stays in the title ("Crew party night" → "Crew party").

### Added
- **No trigger said → MemoAirem picks the label and says so.** `command.ts` `inferVoiceCommand`:
  a to-do ("buy …", "call …", "pick up …", "I need to …", "don't forget to …") → **reminder**;
  otherwise a day or time in the sentence → **event**; anything else → **note**. Fields are read
  exactly as for a spoken command. Offline (or Gemini failed) the phone's rules decide; online
  Gemini decides, with to-do types (task, todo, errand, shopping …) saved as reminder and a vague
  "note" turned into a reminder when the sentence is plainly a job (`voiceNoteType`). The capture
  log notes the label and who picked it.
- Read-back for a picked label names it: "I put a reminder for you to buy a bread on your way
  home." · "I put it on your schedule: Dinner on Friday at 7 in the evening, with Sam." · "I saved
  it as a note: …". Spoken commands keep "Scheduled. / Reminder set. / Noted.". Long titles are
  read to 25 words.

## [1.9.3] — 2026-10-25

### Fixed (bug sweep of 1.7.0–1.9.2)
- **"deck 4" read as December 4th** — in queries, the Text tab's When field and voice commands.
  Month words must now be a whole month name or standard abbreviation (`query.ts` MONTH_PAT).
  "what's on deck 5" searches deck 5, not Dec 5.
- **Editing a saved record changed what it was.** The confirm card's Edit re-saved through the Text
  form with a recomputed type and `via: typed` — a voice **reminder** became an event/note, an
  appointment became an event. Edits now keep type (except the plain event/note default), via,
  image and thumbnail. A time-only record keeps its time on edit.
- **Voice commands:** false triggers removed ("schedule for the crew is posted…", "book club
  meets…" became events); "details" no longer starts Notes ("project details with Sam"); bare
  hours use context — "dinner at 7" / "at 9 tonight" → evening, "breakfast at 7" → morning;
  "9 in the evening" understood; "from 3 to 11 pm" keeps "until 11 pm" in Notes instead of the
  title; "the day after tomorrow", "next week", "this weekend" set the date; a month ("in March")
  is never stored as a place.
- **Past-tense wording about a future booking** ("how much WAS the shore tour?") found nothing —
  it now falls back to upcoming records when looking back finds nothing.
- Spoken answers: "You had 2 events yesterday" (was "You have"); a past-dated receipt or invoice
  is spoken in the past tense; a named past day reads in time order.

## [1.9.2] — 2026-10-25

### Fixed
- **Past-tense questions search what already happened.** "When did I go to the clinic?", "when
  was the gala dinner?", "who was at …" set `pastTense` (did / was / were / went / had / ago /
  last time …): past events are included, upcoming schedule items are left out, and results are
  newest first. Before, "when did I go to the clinic" answered with the NEXT clinic appointment,
  and "when was …" found nothing. Spoken answers use the past tense and name the visit before
  ("Dentist was yesterday at 3 in the afternoon, at Main clinic. Before that, Check-up on
  Thursday, September 10th."). Menus, receipts and other records answer as before.
- "went", "go", "been", "anything", "something" … are no longer treated as search words.
- "at the gala dinner" can name the event: place words may now match a record's title as well as
  its location.

## [1.9.1] — 2026-10-25

### Changed
- **Past events leave the answers and are marked.** `query.ts` `isPastEvent()`: a schedule item
  (event / appointment / meeting / reminder) is past once its start time is more than an hour
  behind (`PAST_GRACE_MIN`), or — with no time — once its day is over. Every query now drops
  past events (keyword searches too), EXCEPT when the question is about the past: "past events"
  or a window wholly behind today ("yesterday", "last week", an earlier date). Before, only
  schedule questions filtered, and only by day. Receipts, invoices, menus and other dated records
  are never hidden. Saved dims past events with a **PAST** tag and adds "· past" to a finished
  day's header; answer cards show "· past" when a past question shows them.

## [1.9.0] — 2026-10-25

### Added
- **Voice commands.** In the Voice tab, a trigger at the start of what you say picks the record
  type — event ("set schedule", "schedule", "add event", "book", "set appointment/meeting"),
  reminder ("remind me to", "set a reminder to") or note ("note", "take a note") — and the rest
  is read ON THE PHONE (`src/lib/command.ts`) into What / When / Where / Who / Notes: day words,
  month-day, "3 p.m.", "at 10" (bare hours: 7–11 morning, 12–6 afternoon), noon/midnight/tonight,
  "with …" → who, "at/in/on the …" → where, "note …" → notes. A time with no day means today, or
  tomorrow if that time has passed. A live **📅 New event** card shows the fields while you talk.
  Save stores it via the Text-tab path with that type (no Gemini, works offline), logs
  "voice command", and — with 🔊 on — reads it back ("Scheduled. Dentist tomorrow at 3 in the
  afternoon, at Main clinic, with Dr Cruz."). Without a trigger, voice notes work as before.
- 🔊 on/off is now shared app state (ask bar + voice read-back).

## [1.8.1] — 2026-10-25

### Changed
- **Better voice engine use (no new library).** Android's Google engine lists each voice twice —
  `…-local` (offline) and `…-network` (online, more natural). Settings → Voice now shows ONE chip
  per voice (★ = high quality, US English first, `en-US-language` aliases hidden), and every
  spoken answer resolves the chosen voice to the network copy when online and the local copy when
  offline (`speech.ts` `groupVoices` / `resolveVoice`). The voice list loads at startup so this
  works before Settings is opened. Settings explains how to switch to Speech Services by Google
  and install its English voice data. Voices from other engines work as before.

## [1.8.0] — 2026-10-25

### Changed
- **Natural spoken answers.** Replies are written for the ear (`src/lib/voice.ts`): relative days
  ("tonight", "tomorrow", "on Wednesday"; full date only beyond a week, year only if not this
  year), times as said aloud ("9:30 in the morning", "noon"), each day said once with its items
  after it, where / with whom included, no symbols or abbreviations, and grammatical empty
  answers ("Nothing on Friday.", "Nothing coming up."). Direct answers read like sentences
  ("Dentist is on Wednesday, at 3 in the afternoon."). On-screen text is unchanged.
- `QueryResult` now also carries `range`, `intent`, `best` and `keywordsDisplay` so the spoken
  reply reads stored fields, not the display string. Old `buildSpoken` / `spokenWhen` removed.

## [1.7.2] — 2026-10-25

### Changed
- **One build with both lines of work.** 1.7.1 (built from 1.6.2 on `main`) and 1.7.0 (the
  `feat/in-app-cleanup` branch) are merged. Harbor sync uses 1.7.1's delete handling — the delete
  time is sent, a delete that Harbor answers "not found" is kept and retried (the upload may still
  be on its way), and a deleted note is never uploaded again — plus 1.7.0's bulk delete, Undo
  restore, and "deletes waiting" report. This replaces 1.7.0's "a 404 counts as done".
- A delete that is still "not found" after 10 minutes is retired, so records deleted before they
  ever reached Harbor (e.g. a Reset of old, never-synced data) stop retrying.

## [1.7.1] — 2026-10-25

### Fixed
- **Deleting a saved note removes it on Harbor.** The phone reads Harbor's `{ records }` list,
  sends the delete time, and does not upload that note again. A save already in flight cannot
  restore it. Open Memories on Harbor (the checklist Board is a different page). About shows
  MemoAirem v1.7.1 · build 22.

## [1.7.0] — 2026-10-25

### Added
- **Start fresh.** Settings → **Reset** (a collapsed section, closed again every time Settings
  closes) → **Delete all data…** deletes every saved item on the phone and on Harbor, the capture
  log, queued offline captures, and learned corrections, then shrinks the storage file. A red
  warning plus two confirmations come first. The AI key, Harbor link and voice choice are kept.
- **Undo last reset.** Reset saves a backup on this phone first (and deletes nothing if the backup
  can't be saved). **Undo last reset** in Settings → Reset — or **Undo now** on the "All clear"
  message — brings back the records, log, queue and corrections, keeps anything captured since,
  and uploads the records to Harbor again. The backup stays until you tap **Delete backup** or
  reset again.
- **Remove duplicates.** Saved → **Remove duplicates (N)** deletes exact copies (same type, title,
  date, time, place, people and notes) and keeps the newest. Records that differ are never touched.
  The deletes reach Harbor.
- **Clear log.** Capture log → **Clear log** empties the diagnostic log. Saved is not affected.

### Fixed
- **Past events no longer answer schedule questions.** “What’s my schedule?”, “what events do I
  have?”, “show my appointments” returned every record, past ones and menu items included;
  “upcoming events” returned nothing, and “schedule” only matched records containing that word.
  These now show today and later (plus undated events). “Past events” shows only past ones, and a
  named day or week (“tomorrow”, “last week”) still uses exactly that window.
- **Deletes on this phone now reach Harbor.** Two bugs stopped them. (1) Harbor answers the record
  list as `{ records: [...] }` but the app expected a bare list, so every sync crashed: Muse's notes
  never arrived, older records never uploaded, and Save Harbor link hung on "Syncing…". (2) A delete
  for a record Harbor never had got a 404, was retried forever, and blocked every delete behind it.
  A 404 now counts as done, the list shape is read correctly, and Settings says how many deletes are
  still waiting and why.
- **Harbor deletes can't be undone by a sync in progress.** A delete made while a sync was running
  could be re-uploaded by that sync; deletes now wait for it, then go out.

## [1.6.2] — 2026-10-25

### Added
- **Harbor memories arrive while the app is open.** Notes Muse writes on Harbor show up in Saved
  on a 20-second pull, and again when you return to the app. You do not have to tap Save Harbor
  link each time.

## [1.6.1] — 2026-10-25

### Fixed
- **Harbor sync sends notes that were already on the phone.** Records saved before a Harbor link
  existed now upload on the next sync.
- **Settings reports the Harbor result.** Save Harbor link shows whether the address and key were
  accepted, or why the phone could not reach Harbor.

## [1.6.0] — 2026-10-25

### Added
- **Harbor sync.** In Settings, add the HTTPS address and a read-write key. Saves and deletes on
  this phone show up on Harbor, and Muse can ask about the same records. Offline captures still
  save on the phone and catch up on the next launch.

## [1.5.0] — 2026-06-27

### Added
- **Day-schedule capture.** Photograph a time-ordered schedule (time on the left, event on the
  right) and it becomes ONE event per row, each independently queryable by time. The Saved view
  now groups same-date events under an expandable date header ("Tue Jun 30 — 5 events"); same-day
  events sort by time. Query supports time-of-day filters (morning/afternoon/evening/night) and
  specific times (3pm, 15:00).

### Fixed
- **Voice capture no longer wedges.** Repeated failed/cancelled voice captures previously left the
  recognizer stuck until an app restart; teardown now runs on every end/error/cancel path so a new
  capture always starts clean.
- **Voice result no longer vanishes.** A finishing recognizer could emit an empty result that wiped
  the captured transcript a few seconds after speaking; empty results are now ignored, so the
  transcript + Save persist until you save or clear.
- **Spoken-output voice list recovers automatically.** When the system TTS engine briefly dropped,
  the voice picker went empty and only a full app restart restored it; the list now re-queries on
  open / section-expand / app-foreground, retries transient empty results, and never caches empty
  as truth.
- **More reliable parsing on slow/satellite connections.** Image/PDF uploads now get up to a 120s
  window (text stays 60s) and images downscale to 1500px (smaller payload), so slow-but-working
  uploads complete instead of timing out at 60s. (Genuine dropouts still queue and auto-drain on
  reconnect.)

## [1.4.1] — 2026-06-27

### Fixed
- **Voice capture listening window widened.** A natural mid-sentence pause no longer ends a voice
  capture early — the post-speech silence tolerance is raised (capture only; the query mic stays
  snappy) and a 60-second hard ceiling keeps it from listening forever. Android's system recognizer
  enforces its own endpointing and may not fully honor app-level silence values on every
  device/ROM, so this tunes toward "better", not a guaranteed duration.

## [1.4.0] — 2026-06-27

### Added
- **Local-first voice capture.** Voice now saves a queryable record instantly without requiring
  network. The flow decides ONCE at capture and parses ONCE: online + linked → the LLM richly
  parses the transcript (who/where/when split); offline, no key, or a failed LLM call → a local
  save (date/time via the on-device parser, the rest into title/notes). The capture is never lost
  and never queued. Records are **parsed once at capture and final** — never enriched, merged, or
  re-parsed afterward (the "saved records are final" rule, which also removes the whole
  enrich/dedup risk class for voice). Offline transcription prefers the on-device speech pack; if
  the device has none, the app says so plainly instead of failing silently.

## [1.3.1] — 2026-06-26

### Fixed
- **Photo/image edits now feed the corrections loop.** Editing a record that came from a photo
  previously taught the model nothing (image captures have no source text, and the learned-examples
  builder dropped any example lacking it). Image-origin edits now contribute a **type-level** example
  (detected type + your corrected field values) so the parser learns habits like "for invoices,
  capture the due date" — without re-sending the image (corrections payload stays cheap, off-quota).
- **Long un-splittable documents no longer truncate silently.** When a single record's notes exceed
  the 4000-char cap, the record now ends with a visible `[... truncated: N chars cut]` marker and the
  capture log shows `notes truncated: <orig> -> 4000 chars`. (Continuation-record splitting is
  deferred — this removes the silence, not the cap.)

## [1.3.0] — 2026-06-26

### Added
- **Faithful capture for content-rich documents.** Multi-section documents (guides, how-tos,
  articles, numbered/headed docs) now produce ONE RECORD PER SECTION — each section's heading
  becomes the title and its full body text is transcribed into notes, instead of the whole
  document being summarized to a list of headings. Simple items (posters, cards, receipts,
  single notices, photos) still yield one record and are not fragmented. Capture log now shows
  `records: N` so over/under-fragmentation is visible. (Repro fixed: an 8-step breeding-guide
  PDF that previously collapsed to one heading-only record.)

### Fixed
- **Date resolution for explicit and far dates, across typed AND voice capture.**
  - Bare month/day input ("November 5") now tolerates ordinals ("5th", "fifth"), abbreviations
    ("Nov 5"), reversed order ("5th December"), and trailing words ("November 5 schedule").
  - A bare month/day resolves to the **next future occurrence** — this year if still ahead
    (today counts as ahead), otherwise next year. It never resolves into the past (correct for
    scheduling). Fixed in the local interpreter (`parseWhen`) and in the voice→Gemini prompt
    (which previously forced "use this year", planting passed dates in the past).
  - Time-of-day still parses alongside ("November 5 9am"); weekday/relative inputs unchanged.

## [1.2.9] — 2026-06-25

### Changed
- **Corrections controls moved off the capture screen into Settings.** The learn bar under the
  Parse button (🎓 correction count + Hints toggle + export) is gone from `Capture`; it now lives
  in `SettingsModal` as a collapsible **"Learning"** section, grouped with the voice picker.
- **Settings sections are collapsible.** **Voice** (test + voice chips) and **Learning** (count +
  Hints + export) are now tap-to-expand rows (default collapsed), so Settings stays tidy. The
  Gemini API key/model stays always-visible at the top.
- Behavior unchanged: corrections are still recorded on every save, and Hints still feeds recent
  corrections back to the AI when on — only the controls relocated (verified on-device, debug build).

## [1.2.8] — 2026-06-25

### Added
- **Save-time near-match detection (same-flyer handling).** When you Save a just-parsed
  record that overlaps one already saved — **≥2 of {title, location, time}** match
  (normalized; notes excluded; date/time may vary) — a prompt shows a **merged field-by-field
  diff** (existing vs new) and three choices: **Update existing** (apply the new values onto
  the existing record, one record kept at its id), **Create new** (save as a separate record),
  or **Keep existing** (discard the new one). Multiple overlaps prompt sequentially. No
  candidate → saves normally as before. Lives on the interactive save path (`savePending` /
  PendingReview); the matcher and the lifted `contentKey` helper are in `lib/match.ts` /
  `lib/query.ts`. Encodes invariant 17.
  - **Known gap:** the offline auto-drain path (`drainNow`) commits queued captures without
    review, so it bypasses this prompt — offline-drained duplicates still save unprompted
    (see manifest §8; v2 = a shared `commitRecords()` with a silent auto-policy).

### Fixed
- **Deleting a record clears a stale on-screen answer.** The displayed query answer was a
  cached snapshot in `MainScreen`; after a delete the Saved folder went empty but the info
  window kept rendering — and 🔊 re-speaking — the deleted record. It's now invalidated
  whenever the saved set changes (delete/save), returning the info window to its placeholder
  so the user re-asks for fresh results. (v2: re-run the last query for a live-updating answer.)

### Notes
- `query.ts` `dedupe` was refactored to use the new exported `contentKey` helper — behavior
  unchanged (same fields, same normalization). Record shape unchanged (invariant 1). No new deps.

## [1.2.7] — 2026-06-25

### Fixed (the real timeout cause)
- **Images are downscaled before the Gemini upload.** MemoAirem was sending the **full-res**
  photo (~4–8 MB base64) as a single inline JSON POST; on any network friction the upload alone
  exceeded the 60 s deadline → "Gemini didn't respond in time". Now `parseWithGemini` resizes the
  image to **~1568 px on the long edge** (JPEG, compress 0.7) via `expo-image-manipulator` before
  `inline_data` (new `resizeForUpload` in `lib/thumb.ts`). On-device this dropped one flyer from
  **~5437 KB → ~224 KB** base64 (~24×) and the same flyer that used to time out parsed cleanly.
  - Cross-checked: eOrderPad parsed fine on the same Gemini key/network, so it was never the key,
    an outage, or auth — it was the request size.
  - **Never upscales** (images already ≤ 1568 px are sent as-is); **resize failure falls back to
    full-res** (logged) so a broken manipulation never blocks the parse; the size decision is
    written to the capture log.
  - **PDFs are untouched** — the resize is gated on `kind === 'image'`; the `pdf` branch sends its
    bytes exactly as before.
  - The 240 px storage thumbnail (`makeThumb`) is unrelated and unchanged. Encodes invariant 16;
    stays inside `parseWithGemini`'s parts assembly (invariant 8); no new dependencies.

### Verified
- On-device (CPH2583), ground-truth = MMKV dump: the previously-timing-out flyer now completes;
  capture log shows `image downscaled for upload: ~5437KB → ~224KB base64`; extraction stayed
  faithful at 1568 px (titles `Grapevine tasting`/`Frescobaldi Grand Tuscan Dinner`/…, dates
  `2026-06-21`/`2026-06-17`, prices `$40`/`$105`/… all intact); a PDF (`IONOS Inc.` invoice)
  extracted cleanly with no downscale line.

## [1.2.6] — 2026-06-25

### Added (parse resilience)
- **Per-attempt 60s deadline (fixes the hang).** Every Gemini request now runs under an
  `AbortController` with a 60-second timeout (`parse.ts` `parseWithGemini`). A request that
  never responds aborts and fails cleanly instead of leaving "Reading…" pinned forever.
- **Stuck-state guard.** "Reading…" is replaced on **every** outcome — success, HTTP error,
  timeout, transport drop, or cancel. No path can leave the status spinning.
- **Retry-with-backoff for transient failures.** `503`/other `5xx` auto-retry at 1s · 2s · 4s
  (3 retries) with a subtle "retrying…" status; `429` honors a short `Retry-After` (≤5s) once,
  else stops; `4xx` auth (`400`/`401`/`403`) fails fast; a timeout is retried once. When retries
  are exhausted the message is actionable — "Gemini busy (HTTP 503) — tap Parse to try again."
  Each attempt's branch (retry-503 / exhausted-503 / 429 / auth / timeout) is recorded in the
  capture log.
- **Cancel an in-flight parse.** "Clear" now `abort()`s the live fetch and any pending backoff,
  and a monotonic token stops a late-resolving attempt from re-populating the status after you
  cancel (or after a newer parse supersedes it).
- **Every outcome is logged.** Timeout, cancel, and exhausted-retry all write a capture-log entry
  with the per-attempt breakdown — no parse failure is invisible.
- **Payload retained until saved.** A recoverable failure (503 / timeout / network) keeps the
  captured image/file in the capture zone, so a manual re-tap (or auto-retry) always has the
  source to send. It's released only on a successful save.

### Notes
- All `parse.ts` changes stay inside `parseWithGemini` (provider-isolated, invariant 8). No new
  dependencies — `AbortController` is built-in. Encodes new invariant 15.

### Verified
- On-device (CPH2583), ground-truth = MMKV capture-log dump: forced timeout (debug 100ms) fails
  cleanly with a logged `parse timed out` + retry-once breakdown and never pins "Reading…"; a genuine
  slow-Gemini run timed out at the production 60s deadline, retried once, then showed the actionable
  message; "Clear" cancels an in-flight parse (status blanked and stayed blank, `cancelled by user`
  logged); the image is retained after the failure. The live 503-retry/happy-path branch was
  best-effort — the verify window hit a real Gemini high-demand episode (timeouts, not 503 responses),
  so it shares the proven retry machinery but awaits a clean-network 503 to capture live.

## [1.2.5] — 2026-06-24

### Changed
- **Faithful extraction (parse prompt, `buildSystem`).** The Gemini prompt now extracts only
  what the source actually states and uses null for anything absent — it no longer invents/
  guesses dates, and it captures a date that IS present (was sometimes dropped). Brand/company/
  venue names (e.g. "Princess") are explicitly excluded from `people`; a company on a contact
  card goes to `notes`. Normalizing a present value to the field format (YYYY-MM-DD / 24h HH:MM)
  is still allowed — representation, not invention. Encodes invariant 13; `generationConfig` and
  `normalize()` unchanged.
- **Query gives a direct answer.** A question with a clear intent (how-much/price, when, where,
  who) now returns a one-line answer above the cards — e.g. "Princess Fine wine tasting — $40",
  "Frescobaldi Grand Tuscan Dinner — Sun, Jun 21 · 6:30 PM" — read straight from the best-matching
  record's stored fields (no invention). The spoken reply leads with the answer too.
- **Query dedups findings.** Functionally-identical records (same content fields) collapse to one,
  so repeated parses of the same source no longer stack as duplicate cards or inflate the count.
- **Question words no longer pollute matches.** "how", "much", "many", "why" are now stopwords, so
  a query like "how much is …" stops substring-matching unrelated records (e.g. "how" inside
  "showing"). Display-only/query-engine changes — the capture→store→query model is unchanged.

### Verified
- On-device (CPH2583): re-parsed the Princess "Art of Wine" menu — dated events keep their dates,
  dateless events stay null, "Princess" no longer in `people`. Queries "when is the frescobaldi
  dinner" → date answer, "how much is chief table" → "Chef's Table — $105".

## [1.2.4] — 2026-06-24

### Changed
- **About moved to its own screen, opened by tapping the M logo.** The version line + What's
  new list were pulled out of Settings (a category mismatch — Settings is for things you
  change; About is info you read) into a standalone full-screen About view (same back-out
  pattern as the folder screens, no nav lib). Added an app overview ("What it does") above the
  relocated version/What's-new block, plus a developer credit. Settings keeps the API key/model
  and the voice picker.

## [1.2.3] — 2026-06-24

### Changed
- **Provenance line echoes the user's query words faithfully.** The `who:`/`where:`/`what:`
  terms now display in the user's **original casing** (recovered from the raw query), and an
  explicit-date `when:` label shows the user's verbatim typed substring (e.g. `Jun 24`,
  `Friday`) instead of a lowercased fragment. Named-range labels (today / this weekend / …)
  stay as readable labels. **Display-only** — matching still runs on the lowercased/filtered
  tokens, so results are unchanged; only the shown provenance differs.

## [1.2.2] — 2026-06-24

### Changed
- **Answer card now includes notes.** A matched record's `notes` render verbatim on their
  own line (after who, only when present), so the answer surface carries the full event info
  — reversing the 1.2.0 decision to exclude notes from the InfoWindow. Notes get a distinct,
  muted full-width treatment (not the ◷/⚲/◍ token line). Display-only: matching, provenance,
  and the date reformat are untouched.

## [1.2.1] — 2026-06-23

### Fixed (diagnostics)
- Parse failures no longer all read "no internet". The capture log now records the **real**
  cause and distinguishes: `queued (offline)` vs `queued (no AI key)` (precondition gate),
  `gemini HTTP <status>: <msg>` (server responded with 503/429/4xx — not offline, not queued),
  and `transport failed (queued): <msg>` (a thrown fetch with no response — genuine offline,
  queued for retry). Status strings match (offline / add-key / server-error). `parse.ts` now
  carries the HTTP status on the thrown error so a server error response is never collapsed
  into a transport/offline case. Diagnostic only — queue/retry behavior is unchanged.

## [1.2.0] — 2026-06-23

### Changed
- **Home redesigned into three fixed zones:** a scrollable top (capture + ask bar + chips),
  a dedicated **info window** in the middle for the query answer (record title + when/where/who
  as readable text, with the source image shown when present; notes excluded), and a fixed
  **bottom dock** (Saved + Capture log) that opens each folder full-screen for browse/edit/delete.
  The answer surface never mixes with storage chrome.
- Keyboard now uses **adjustPan** (not resize): the bottom dock stays pinned to the screen
  bottom and is covered by the keyboard instead of reflowing upward.

### Build / ops
- Renamed the Android package **`com.valle.snapschedule` → `com.valle.memoairem`** (deep-link
  scheme → `memoairem`). New id = a fresh install (previous local data is not migrated).
- Bumped to `1.2.0` / build 3.

## [1.1.0] — 2026-06-23

Versions bumped to `1.1.0` (build 2) across the tracked sources — `app.config.ts`
(`version` + `android.versionCode`), `package.json`, and `src/lib/version.ts`
(`android/` is gitignored/generated). Surfaced in-app under Settings → About.

### Added
- **Smart adaptive parse** (replaces the old "scope" instruction): one Gemini call classifies the
  content, then EXTRACTs the relevant fields or DESCRIBEs a (near-)wordless image into the same
  unified record — a real image never returns empty. Detected type + EXTRACT/DESCRIBE mode are logged.
- **Field-aware query:** routes a question to what / where / when / who (and combinations); a bare
  keyword searches all fields. Provenance shows the matched fields (e.g. "→ who: Sam · when: Friday").
- **Text tab = progressive local authoring:** always-visible **What**, with **+ Add a detail**
  adding labeled When / Where / Who / Note inputs on demand (each removable; no duplicates). Saved
  locally with no Gemini call. When → date/time via the local interpreter; Who normalized
  ("Sam and Priya" → "Sam, Priya").
- **Save confirmation + edit:** after a local save, a card shows exactly what was stored (resolved
  date/time included) with an Edit round-trip that updates the same record in place.
- **Clear / start-fresh control** in capture: dismisses a picked source, pending review, and the
  status line so a failed or stale parse never lingers; parse attempts also reset stale state.
- **Voice picker moved to Settings** (with a test button) and a Settings "Load sample data" item.

### Changed
- Capture is fully source-agnostic — photo / file / voice all yield the same unified record.
- Query suggestion chips trimmed to **Today / This week / This weekend**; "Parse" is the single
  full-width capture action (Sample button removed from the main screen).
- Spoken answers say "items" instead of "events" (records can be dishes, notes, photos, …).
- UI copy reconciled from "Snap → Schedule" to **MemoAirem**.

### Fixed
- Capture log no longer flags intentionally-undated captures (menus, contacts, notes, photos) as a
  ⚠ "none dated" warning — a missing date is normal now; only an implausible date warns.
- Network/DNS failure mid-parse now queues ("no internet — will parse when reconnected") instead of
  showing a key/model error.

### Removed
- The "scope" capture-instruction model and its preset chips (`src/lib/presets.ts` deleted).

### Build / ops
- Produced a signed (debug-key) **release** APK (arm64-v8a, Hermes-bundled) and verified it runs
  standalone on the test device. Release signing with a real keystore is still TODO.

## [1.0.0] — baseline (pre-2026-06-23)

- Initial Android build matching the web prototype: four capture zones (Photo / File / Text / Voice),
  assistant query bar, Saved folder, capture log, Settings (Gemini key + model). Offline-first data
  layer (MMKV) with capture → store → query, corrections loop, and the offline parse queue.
  Versions: `app.config.ts`/`package.json` `1.0.0`, Android `versionName 1.0.0` / `versionCode 1`.
