/**
 * Assistant (ZONE 1) — ONE BIG MIC that asks AND saves (1.12.0-voice.14, user: "remove the ask
 * about, mic, speaker … speaker should always be on … clean interface, just one big microphone").
 *
 *   - Tap the mic and speak ("Tap and speak — Ask something or Save it"). Your words show under it,
 *     then two pills: **Ask** (left) and **Save** (right), with a small ⓧ between them to clear and
 *     start over (voice.15 layout, the user's spec). voice.16: a CLEAR instruction acts at once
 *     (classifyIntent → sure); the pills are only the fallback when MemoAirem isn't sure — the
 *     guess filled, nothing runs until one is tapped. After acting by itself it offers the other:
 *     "It was a question" after a save, "Save it instead" after an answer.
 *   - Drawn inside MainScreen's one card, under the Photo / File / Text tabs (no card of its own).
 *   - Answers are always spoken (no speaker toggle — state.speakOn stays at its default, on).
 *   - "⌨ Type instead" opens a small text box: typing is the path that always works when voice
 *     can't (CLAUDE.md core principle), so it's kept, just out of the way. Typed text is an Ask.
 *   - voice.20: idle, the card shows the M logo and the BIG mic sits in the answer area (BigMic);
 *     the time chips sit just above the folders (MainScreen). Private rules run first, as before.
 *   - The answer renders in the InfoWindow (zone 2) via onResult.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Image } from 'react-native';
import { colors, radius, shadow } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { Icon, type IconName } from '../common/Icon';
import { MicButton } from '../common/MicButton';
import { StatusLine } from '../common/StatusLine';
import { useApp } from '../../state/AppContext';
import { useDictation } from '../../state/Dictation';
import type { QueryResult } from '../../lib/query';
import type { Rec } from '../../types';
import { spokenConfirm, spokenReply } from '../../lib/voice';
import { ensureGemmaLoaded, gemmaAnswer } from '../../lib/gemmaLive';
import { llm } from '../../lib/llmNative';
import { createProbe } from '../../lib/earlyProbe';
import {
  askForAnyCard,
  askForLetters,
  parseExpiryAsk,
  parsePrivateSearch,
  parsePrivateSave,
  type PrivateDraft,
} from '../../lib/privateSearch';
import { classifyIntent, type Intent } from '../../lib/intent';
import { parseListAll, type PrivateListKind } from '../../lib/listCommands';
import { parseVoiceCommand } from '../../lib/command';
import { expandWords, learnIntent, noteMiss, parseTeach, removeWord, replaceWordAt, setWord, wordsOf } from '../../lib/learning';
import { clearFollowUp, continueQuestion, isFollowUp, rememberQuestion } from '../../lib/followUp';
import { listVoices, pickBestVoice, speak, sttErrorMessage } from '../../lib/speech';

/** voice.20: the time chips — drawn by MainScreen just above the folders, asked through micRef. */
export const CHIPS = ['Today', 'This week', 'This weekend'];

/** voice.20: the big idle mic lives in the answer area (MainScreen) but speaks into this Assistant. */
export interface MicHandlers {
  onText: (t: string, final: boolean) => void;
  onError: (code: string) => void;
  /** voice.20: the time chips (now above the folders, in MainScreen) ask through here */
  askChip: (label: string) => void;
  /** voice.21: "⌨ Type instead" under the big mic opens the typing box in the card */
  startTyping: () => void;
}

export function Assistant({
  onFocusAsk,
  onResult,
  onPrivateSearch,
  onPrivateList,
  onPrivateSave,
  micRef,
  onIdleChange,
  onReset,
  onPillsShown,
  panelOpen,
  cardMic,
}: {
  panelOpen?: boolean; // voice.23: Photo / File / Text open — the idle logo steps aside for the panel
  cardMic?: boolean; // a small mic in the card only while an answer is showing. Otherwise the big mic is the only one.
  micRef: React.MutableRefObject<MicHandlers | null>; // voice.20: the big mic below calls these
  onIdleChange: (idle: boolean) => void; // voice.20: idle → MainScreen shows the big mic below
  onReset: () => void; // voice.20: ⓧ also clears the answer, so the big mic comes back
  onPillsShown?: () => void; // voice.22: the pills appeared — MainScreen scrolls them into view
  onFocusAsk: () => void;
  onResult: (r: QueryResult) => QueryResult | void; // returns what actually ended up on screen
  // 1.10.1: "password search …" → the Private folder only. voice.29: `expiry` = an expiry question
  // ("when does my passport expire") — the folder says the title + expiry date.
  onPrivateSearch: (query: string, expiry?: { all: boolean }) => void;
  /** 2.0.0: "list all passwords / IDs / private notes" → the Private folder, filtered to that kind */
  onPrivateList: (kind: PrivateListKind) => void;
  onPrivateSave: (draft: PrivateDraft) => void; // 1.10.14: "save my passport no." → Private prompt only
}) {
  const { state, actions } = useApp();
  // FEASIBILITY PROBE (docs/early-answer-plan.md): logs what an early Gemma draft WOULD have done.
  // Changes nothing the user sees or hears and never calls Gemma. Counts and times only.
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const probe = useRef(
    createProbe({
      eligible: (text) => {
        const q = expandWords(text);
        if (parseTeach(q) || isFollowUp(q)) return false;
        const list = parseListAll(q);
        if ((list && list.where === 'private') || parseExpiryAsk(q) || parsePrivateSearch(q) !== null || parsePrivateSave(q)) return false;
        if (askForLetters(q) ?? askForAnyCard(q)) return false;
        const g = classifyIntent(q);
        if (!g.sure || g.intent === 'save') return false;
        const r = actionsRef.current.runQuery(q);
        return r.results.length > 0 && !r.closest && !r.interpText.startsWith('list: ');
      },
      recordsFor: (text) => actionsRef.current.runQuery(expandWords(text)).results.map((r) => r.id),
      log: (line) => console.log('[early] ' + line),
    }),
  ).current;
  const dictation = useDictation();
  const [q, setQ] = useState('');
  // what the spoken words seem to want — null = nothing spoken yet / typed (→ Ask)
  const [intent, setIntent] = useState<Intent | null>(null);
  const [typing, setTyping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState<{ rec: Rec; text: string } | null>(null);
  // voice.16: a spoken question MemoAirem answered by itself — offers "Save it instead"
  const [autoAsked, setAutoAsked] = useState<string | null>(null);
  const [chipAsked, setChipAsked] = useState(false); // a time chip was asked: no 'Save it instead'
  // build 97: "when I say PH I mean PhilHealth" — just taught (with Undo)
  const [taught, setTaught] = useState<{ say: string; mean: string } | null>(null);
  // A wrong word from the listener: tap it, type the right one, and remember it.
  const [picking, setPicking] = useState(false);
  const [fixAt, setFixAt] = useState<number | null>(null);
  const [fixSource, setFixSource] = useState<string | null>(null); // the line before any word edits
  const [fixMean, setFixMean] = useState('');
  const voiceId = state.voiceId || undefined;
  const askSeq = useRef(0);
  const saveGen = useRef(0);
  const saveTail = useRef(Promise.resolve());
  const pendingSaves = useRef(0);
  const listening = dictation.activeId === 'query';
  const transcribing = dictation.finishingId === 'query';

  // First run with no saved voice: auto-pick a good default and persist it
  // (the picker itself lives in Settings now).
  // Always load the engine's voice list once booted — speak() needs it to pick the online
  // (network) or offline (local) copy of the chosen voice.
  useEffect(() => {
    if (!state.booted) return;
    void ensureGemmaLoaded();
    listVoices().then((vs) => {
      if (state.voiceId) return;
      const best = pickBestVoice(vs);
      if (best) actions.setVoiceId(best.identifier);
    });
  }, [state.booted, state.voiceId, actions]);

  /** Stop the mic before acting — a still-listening recognizer could write over the text. */
  const quietMic = () => {
    if (dictation.activeId === 'query' || dictation.finishingId === 'query') dictation.cancel();
  };

  const clear = () => {
    quietMic();
    setQ('');
    setIntent(null);
    setJustSaved(null);
    setAutoAsked(null);
    setChipAsked(false);
    setTaught(null);
    setPicking(false);
    setFixAt(null);
    setFixSource(null);
    clearFollowUp();
    onReset(); // the answer goes too — back to the big mic
  };

  /** Returns true when the answer shows below (false: nothing to ask, or it went to the Private folder). */
  const ask = (text: string): boolean => {
    const spoken = text.trim();
    if (!spoken) return false;
    quietMic();
    setIntent(null);
    setJustSaved(null);
    setAutoAsked(null);
    setTaught(null);
    // build 97: "when I say PH I mean PhilHealth" — kept on the phone (Settings → Learning → My words)
    const teach = parseTeach(spoken);
    if (teach) {
      const err = setWord(teach.say, teach.mean);
      setQ('');
      const line = err ?? `Got it. When you say ${teach.say}, I'll understand ${teach.mean}.`;
      if (!err) setTaught(teach);
      else actions.setStatus('warn', err);
      if (state.speakOn) speak(line, voiceId, state.online);
      return false;
    }
    // build 97: your own words, understood (what you SAVE keeps your words — this is for asking)
    const query = expandWords(spoken);
    // voice.29: "when does my passport expire?" → the Private folder's documents, which SAY the title
    // and the expiry date (never the number). A known document goes straight there; another name
    // ("contract") only when your normal records have nothing for it.
    // 2.0.0: "list all passwords / IDs …" → the Private folder, ONE kind, to look at (never a save,
    // never a keyword search). "list all reminders / notes …" falls through: runQuery lists them.
    const list = parseListAll(query);
    if (list && list.where === 'private') {
      clearFollowUp();
      setQ('');
      onPrivateList(list.kind);
      return false;
    }
    const exp = parseExpiryAsk(query);
    if (exp && (exp.known || !actions.runQuery(exp.term).results.length)) {
      clearFollowUp();
      setQ('');
      onPrivateSearch(exp.term, { all: exp.all });
      return false;
    }
    // "password search …" (1.10.1) looks ONLY in the Private folder: caught here, before the normal
    // query runs, so it never reaches answers, Harbor or Gemini. Not spoken here — the folder
    // speaks titles only, after the phone's lock check.
    const priv = parsePrivateSearch(query);
    if (priv !== null) {
      clearFollowUp();
      setQ('');
      onPrivateSearch(priv);
      return false;
    }
    // A SAVE of something private said/typed here (1.10.14) — "save my passport no.", "my SSS
    // number is …", "save password for gmail …" — opens the Private prompt (after the fingerprint),
    // never the normal search.
    const secret = parsePrivateSave(query);
    if (secret) {
      clearFollowUp();
      setQ('');
      onPrivateSave(secret);
      return false;
    }
    // "what is my <card> number / no." for a card MemoAirem doesn't know (voice.8 — device: an "SRB"
    // note in the Private folder couldn't be found by asking). Your normal records come first: if
    // they mention the card's NAME ("room" → "Room number 8012") the normal answer shows. Only the
    // name is checked — the whole question would match any note containing "number" (voice.9 fix).
    const card = askForLetters(query) ?? askForAnyCard(query);
    if (card && !actions.runQuery(card).results.length) {
      clearFollowUp();
      setQ('');
      onPrivateSearch(card);
      return false;
    }
    const follow = isFollowUp(query);
    const followed = follow ? continueQuestion(query) : query;
    if (!follow) clearFollowUp();
    const r = actions.runQuery(followed);
    if (r.results.length) rememberQuestion(followed);
    const shown = { ...r, asked: followed };
    // onResult returns what actually ended up on screen (MainScreen may
    // replace it — e.g. "categorize this" with nothing on screen). Speak
    // that, so the voice never says something the screen contradicts.
    const effective = onResult(shown) ?? shown;
    // build 97: a question that found nothing → Settings → Learning → What MemoAirem missed.
    // A category command or a category miss is not a miss — the engine
    // understood it. But a scoped question that found nothing IS a miss: its
    // provenance also starts with "category: X", and it carries keywords,
    // which commands never do — so the keyword check tells them apart.
    const categoryCommand =
      !!r.categoryAction || !!r.categoryMiss || (r.interpText.startsWith('category') && !r.keywords.length);
    if (!r.results.length && !r.interpText.startsWith('list: ') && !categoryCommand) noteMiss(spoken, 'no-answer');
    const rulesLine = spokenReply(effective);
    const seq = ++askSeq.current;
    const waitForGemma = !!llm()?.status().loaded && r.results.length > 0 && !r.closest && !r.interpText.startsWith('list: ');
    // The rules line is already on screen. Speech waits only when Gemma is loaded,
    // so the phone says one sentence — Gemma's, or the rules' if Gemma is rejected.
    if (!waitForGemma) {
      if (state.speakOn) speak(rulesLine, voiceId, state.online);
      return true;
    }
    void gemmaAnswer(followed, effective).then((sentence) => {
      if (seq !== askSeq.current) return;
      if (sentence) onResult({ ...effective, answer: sentence, spoken: sentence });
      if (state.speakOn) speak(sentence || rulesLine, voiceId, state.online);
    });
    return true;
  };

  /** Save what was said — the same path as the old Voice tab's Save (labels, read-back). */
  const writeSave = async (t: string, gen: number) => {
    if (gen !== saveGen.current) return;
    quietMic();
    setIntent(null);
    setAutoAsked(null);
    // a password / ID number → the Private folder's prompt only (never the normal store)
    const priv = parsePrivateSave(expandWords(t));
    if (priv) {
      setQ('');
      onPrivateSave(priv);
      return;
    }
    const rec = await actions.saveVoiceNote(t);
    if (!rec) return;
    // A correction or "It was a question" happened while this save was still writing.
    if (gen !== saveGen.current) {
      actions.dropSavedCopies(rec);
      return;
    }
    setQ('');
    setJustSaved({ rec, text: t });
    const picked = rec.via !== 'Voice command'; // no trigger said → MemoAirem picked the label
    if (state.speakOn) speak(spokenConfirm(rec, new Date(), picked), voiceId, state.online);
  };

  const save = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const gen = saveGen.current;
    pendingSaves.current += 1;
    setSaving(true);
    const job = saveTail.current.then(() => writeSave(t, gen));
    saveTail.current = job.then(
      () => {
        pendingSaves.current -= 1;
        if (pendingSaves.current === 0) setSaving(false);
      },
      () => {
        pendingSaves.current -= 1;
        if (pendingSaves.current === 0) setSaving(false);
      },
    );
  };

  /** "Save it instead" — after MemoAirem answered a spoken sentence by itself. */
  const saveInstead = () => {
    if (!autoAsked) return;
    const text = autoAsked;
    // build 97: remember — next time a sentence shaped like this is SAVED at once
    learnIntent(text, 'save');
    noteMiss(text, 'was-save');
    setAutoAsked(null);
    void save(text);
  };

  /** Put the corrected line through the same path, without speaking it again. */
  const replay = (source: string, next: string) => {
    saveGen.current += 1;
    setQ(next);
    setPicking(false);
    setFixAt(null);
    const savedRec = justSaved?.rec ?? null;
    const { kept, removed } = actions.replaceMisheardSave(source, next, savedRec);
    setJustSaved(null);
    // A note, schedule, or event from the wrong words is gone. Keep one copy of the corrected line.
    if (savedRec || removed || saving) {
      const g = classifyIntent(expandWords(next));
      if (g.intent === 'ask' && g.sure) {
        if (ask(next)) setAutoAsked(next);
        return;
      }
      if (kept) setJustSaved({ rec: kept, text: next });
      else save(next);
      return;
    }
    if (autoAsked) {
      setAutoAsked(null);
      if (ask(next)) setAutoAsked(next);
      return;
    }
    onSpoken(next);
  };

  const lineNow = () => (q.trim() || justSaved?.text || autoAsked || '').trim();

  /** Put this word into the line and remember it. The sentence is not saved yet. */
  const applyOpenWord = (): { line: string; dropped: boolean } => {
    const source = lineNow();
    if (parsePrivateSave(source) !== null || parsePrivateSearch(source) !== null) return { line: source, dropped: false };
    if (fixAt === null) return { line: source, dropped: false };
    const heard = wordsOf(source)[fixAt];
    if (!heard) return { line: source, dropped: false };
    const meant = fixMean.trim();
    const bare = heard.replace(/^[\s"'“”‘’]+|[\s"'“”‘’.?!,]+$/g, '');
    const dropped = !meant;
    const next = !meant ? replaceWordAt(source, fixAt, '') : meant.toLowerCase() === bare.toLowerCase() ? source : replaceWordAt(source, fixAt, meant);
    if (meant && next !== source) {
      const err = setWord(heard, meant, Date.now(), 'mic');
      if (err) actions.setStatus('warn', err);
      else {
        actions.clearStatus();
        setTaught({ say: bare, mean: meant });
      }
    }
    if (next !== source) {
      setQ(next);
      if (justSaved) setJustSaved({ rec: justSaved.rec, text: next });
      if (autoAsked) setAutoAsked(next);
    }
    setFixAt(null);
    setFixMean('');
    return { line: next, dropped };
  };

  /** Keep editing. This word is in the line; the sentence waits for Save. */
  const commitWord = () => {
    applyOpenWord();
  };

  const openWord = (i: number) => {
    const at = fixAt;
    const { line, dropped } = applyOpenWord();
    let index = i;
    if (dropped && at !== null && i > at) index -= 1;
    if (dropped && at === i) return;
    const word = wordsOf(line)[index];
    if (!word) return;
    setFixAt(index);
    setFixMean(word.replace(/^[\s"'“”‘’]+|[\s"'“”‘’.?!,]+$/g, ''));
  };

  /** One save for the whole corrected line. Earlier wrong note, schedule, or event is removed. */
  const finishFix = () => {
    const source = (fixSource ?? lineNow()).trim();
    const { line } = applyOpenWord();
    setFixSource(null);
    if (!line || line === source) {
      setPicking(false);
      setFixAt(null);
      return;
    }
    replay(source, line);
  };

  const onSpoken = (t: string) => {
    const g = classifyIntent(expandWords(t)); // build 97: your words + your lessons
    if (!g.sure) {
      setIntent(g.intent); // pills shown, the guess filled
      return;
    }
    if (g.intent === 'save') void save(t);
    else if (ask(t)) {
      setQ(t); // keep the words on screen with the answer…
      setAutoAsked(t); // …and offer "Save it instead"
    }
  };

  /** "It was a question" — take the note back out and ask it instead. */
  const unsaveAndAsk = () => {
    if (!justSaved) return;
    saveGen.current += 1;
    actions.dropSavedCopies(justSaved.rec);
    const text = justSaved.text;
    // build 97: remember — next time a sentence shaped like this is ANSWERED at once
    learnIntent(text, 'ask');
    noteMiss(text, 'was-question');
    setJustSaved(null);
    setQ(text);
    ask(text);
  };

  const said = !typing && !!q.trim();
  // a password / ID number goes to the Private folder whichever pill is tapped — say so
  const privateHint = said && (parsePrivateSave(q) !== null || parsePrivateSearch(q) !== null);

  // the words stay on the compact row after a save clears the box
  const lastWords = justSaved?.text ?? autoAsked ?? '';
  const compact = said || !!justSaved || !!autoAsked;
  const pillsShown = said && !listening && !autoAsked && !transcribing;
  const shown = (q.trim() || lastWords).trim();
  const privateLine = !!shown && (parsePrivateSave(shown) !== null || parsePrivateSearch(shown) !== null);
  const canFix = !listening && !transcribing && !typing && !privateLine && !chipAsked && !!shown;
  // voice.22 (user: "when unsure the Ask and Save buttons appear — make sure they show"): when the
  // pills appear, the screen scrolls so they're in view even if the card is taller than its space
  useEffect(() => {
    if (pillsShown) onPillsShown?.();
  }, [pillsShown, onPillsShown]);

  const handleText = (t: string, final: boolean) => {
    if (!t.trim()) return; // never let an empty end-of-session result wipe what was said
    if (state.status) actions.clearStatus(); // an old "didn't catch that" goes once words arrive
    onFocusAsk(); // fold an open Photo / File / Text panel away so the words + answer have room
    setTyping(false);
    setPicking(false);
    setFixAt(null);
    setFixSource(null);
    setTaught(null);
    const heard = expandWords(t); // a word you fixed before already means the right one
    setQ(heard);
    setJustSaved(null);
    setAutoAsked(null);
    setChipAsked(false);
    // a clear instruction acts at once; otherwise the pills wait for a tap (voice.16)
    if (final) {
      probe.final(heard);
      onSpoken(heard);
    } else {
      probe.partial(heard);
    }
  };
  const handleError = (code: string) => actions.setStatus('warn', sttErrorMessage(code));
  micRef.current = {
    onText: handleText,
    onError: handleError,
    askChip: (c) => {
      setTyping(false);
      setQ(c);
      if (ask(c)) {
        setAutoAsked(c);
        setChipAsked(true);
      }
    },
    startTyping: () => {
      quietMic();
      setQ('');
      setIntent(null);
      setTyping(true);
    },
  }; // the big mic and the time chips below speak here

  // voice.20: idle (nothing said / answered / saved) → the big mic shows in the answer area
  useEffect(() => {
    onIdleChange(!compact);
  }, [compact, onIdleChange]);

  const mic = (big: boolean) => <MicButton id="query" big={big} onText={handleText} onError={handleError} />;

  return (
    <View style={styles.zone}>
      <View style={styles.card}>
        {compact ? (
          // voice.17: once you've spoken, the card shrinks to ONE row — small mic · your words · ⓧ —
          // so the answer window below keeps its room (device: "the answer is not showing, only the
          // voice result" — the tall card had squeezed the answer window to its 150 pt minimum).
          <View style={styles.compactRow}>
            {cardMic ? mic(false) : null}
            {picking && !listening && !transcribing ? (
              <View style={styles.wordWrap}>
                {wordsOf(shown).map((w, i) => (
                  <Pressable
                    key={`${i}-${w}`}
                    onPress={() => openWord(i)}
                    style={[styles.wordChip, fixAt === i && styles.wordChipOn]}
                  >
                    <Text style={[styles.wordText, fixAt === i && styles.wordTextOn]}>{w}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.saidCompact} numberOfLines={3}>
                {listening ? (q.trim() ? `“${q.trim()}”` : 'Listening…') : transcribing ? 'Getting your words…' : `“${shown}”`}
              </Text>
            )}
            {/* the pills have their own ⓧ between them (user's spec) — this one only when they're hidden */}
            {pillsShown ? null : (
              <Pressable onPress={clear} hitSlop={10} style={styles.clearBtn} accessibilityLabel="Clear and start over">
                <Icon name="x" size={15} color={colors.muted} />
              </Pressable>
            )}
          </View>
        ) : (
          // voice.20 (user: "the mic position replace places with the M logo"): idle, the card shows
          // the M logo; the big mic + "Tap and speak" are in the answer area below (BigMic).
          panelOpen ? null : (
            // voice.34: a WATERMARK — the bare M (assets/memoairem-watermark.png, cropped from the navy
          // monogram), one flat tone, faint; not the solid app-icon square
          <View style={styles.logoWrap}>
            <Image
              source={require('../../../assets/memoairem-watermark.png')}
              style={styles.logo}
              resizeMode="contain"
              tintColor={colors.ink}
              accessibilityIgnoresInvertColors
            />
            {/* An answer is on the screen but the card went back to idle: the big mic is not
                shown then (the answer has its place), so a small mic sits on the M. Without it
                there was no way to ask again. */}
            {cardMic ? <View style={styles.logoMic}>{mic(false)}</View> : null}
          </View>
          )
        )}

        {/* after you pause: Ask (left) · clear (middle) · Save (right). The guessed one is filled.
            Nothing happens until a pill is tapped. */}
        {pillsShown && !picking ? (
          <>
            <View style={styles.pills}>
              <Pill
                label="Ask"
                icon="search"
                strong={intent === 'ask'}
                onPress={() => {
                  const t = q;
                  if (ask(t)) setAutoAsked(t); // same "Answered below · Save it instead" line
                }}
              />
              <Pressable onPress={clear} hitSlop={10} style={styles.clearBtn} accessibilityLabel="Clear and start over">
                <Icon name="x" size={15} color={colors.muted} />
              </Pressable>
              <Pill
                label={saving ? 'Saving…' : 'Save'}
                icon="save"
                strong={intent === 'save'}
                onPress={() => void save(q)}
              />
            </View>
            {privateHint ? <Text style={styles.privText}>🔒 Goes to your Private folder</Text> : null}
          </>
        ) : null}

        {canFix && !picking ? (
          <Pressable
            onPress={() => {
              setFixSource(lineNow());
              setPicking(true);
              setFixAt(null);
            }}
            hitSlop={8}
          >
            <Text style={styles.link}>Fix words</Text>
          </Pressable>
        ) : null}
        {picking ? (
          <>
            {fixAt !== null ? (
              <View style={styles.typeRow}>
                <TextInput
                  style={styles.input}
                  value={fixMean}
                  autoFocus
                  onChangeText={setFixMean}
                  placeholder="The right word"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={commitWord}
                />
                <Pressable onPress={commitWord} hitSlop={8}>
                  <Text style={styles.link}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.muted}>Tap each wrong word. Save when the line is right.</Text>
            )}
            <Pressable onPress={finishFix} hitSlop={8}>
              <Text style={styles.link}>Save</Text>
            </Pressable>
          </>
        ) : null}

        {/* answered by itself (voice.16) — the answer is below; one tap if it should have been saved */}
        {autoAsked && !picking ? (
          <View style={styles.savedRow}>
            <Text style={styles.savedText} numberOfLines={1}>
              Answered below
            </Text>
            {chipAsked ? null : (
              <Pressable onPress={saveInstead} hitSlop={8}>
                <Text style={styles.link}>Save it instead</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {/* voice.19: mic errors ("Didn't catch that…") — the status line used to live only in the open
            Photo / File / Text panel, so on the voice screen they never showed */}
        {panelOpen ? null : <StatusLine status={state.status} />}

        {/* build 97: just taught a word — with Undo */}
        {taught ? (
          <View style={styles.savedRow}>
            <Text style={styles.savedText} numberOfLines={2}>
              ✓ Learned: “{taught.say}” means “{taught.mean}”
            </Text>
            <Pressable
              onPress={() => {
                removeWord(taught.say);
                setTaught(null);
              }}
              hitSlop={8}
            >
              <Text style={styles.link}>Undo</Text>
            </Pressable>
          </View>
        ) : null}

        {/* what was saved, with "It was a question" */}
        {justSaved && !picking ? (
          <View style={styles.savedRow}>
            <Text style={styles.savedText} numberOfLines={2}>
              ✓ Saved as {justSaved.rec.type || 'note'}: {justSaved.rec.title}
            </Text>
            <Pressable onPress={unsaveAndAsk} hitSlop={8}>
              <Text style={styles.link}>It was a question</Text>
            </Pressable>
          </View>
        ) : null}

        {/* typing — kept for when voice can't work (no signal, noisy room); out of the way */}
        {typing ? (
          <View style={styles.typeRow}>
            <TextInput
              style={styles.input}
              value={q}
              autoFocus
              onChangeText={(t) => {
                setQ(t);
                setIntent(null); // typed → Ask
                setJustSaved(null);
              }}
              onFocus={onFocusAsk}
              onSubmitEditing={() => ask(q)}
              placeholder="Type a question…"
              placeholderTextColor={colors.muted}
              returnKeyType="search"
            />
            <Pill label="Ask" icon="search" strong onPress={() => ask(q)} />
          </View>
        ) : null}
      </View>

      {/* voice.21: "⌨ Type instead" lives under the big mic (BigMic); here only its "Close typing" */}
      <Pressable
        onPress={() => {
          quietMic();
          setTyping(false);
          setIntent(null);
        }}
        hitSlop={8}
        style={[styles.typeLink, typing ? null : styles.hidden]}
        disabled={!typing}
      >
        <Text style={styles.muted}>Close typing</Text>
      </Pressable>
    </View>
  );
}

/**
 * voice.20 — the BIG mic, in the answer area while nothing is on screen (where the M logo and
 * "Your answers appear here" used to be). It speaks into the Assistant through `micRef`.
 * One mic: this one, until an answer takes the space.
 */
export function BigMic({ micRef, greeting }: { micRef: React.MutableRefObject<MicHandlers | null>; greeting?: string }) {
  const dictation = useDictation();
  const listening = dictation.activeId === 'query';
  const transcribing = dictation.finishingId === 'query';
  return (
    <View style={styles.bigWrap}>
      <View style={styles.bigScale}>
        <MicButton
          id="query"
          big
          onText={(t, final) => micRef.current?.onText(t, final)}
          onError={(code) => micRef.current?.onError(code)}
        />
      </View>
      {listening ? (
        <Text style={styles.hintMain}>Listening…</Text>
      ) : transcribing ? (
        <Text style={styles.hintMain}>Getting your words…</Text>
      ) : (
        <View style={styles.hintBox}>
          {/* 1.13.0: the onboarding name — a small hello above the user's wording */}
          {greeting ? <Text style={styles.hello}>Hi, {greeting}</Text> : null}
          <Text style={styles.hintMain}>Tap and speak</Text>
          <Text style={styles.hintSub}>Ask something or Save it</Text>
          {/* voice.32 (user, from the old Voice tab): the save phrases, back under the mic */}
          <Text style={styles.vtip}>Start with “set schedule…”, “remind me to…” or “note…”</Text>
          {/* voice.21 (user: "under it, type instead") */}
          <Pressable onPress={() => micRef.current?.startTyping()} hitSlop={10} style={styles.typeUnder}>
            <Text style={styles.muted}>⌨ Type instead</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** Ask / Save pill — filled when it's MemoAirem's guess, outlined otherwise. Both always work. */
function Pill({ label, icon, strong, onPress }: { label: string; icon: IconName; strong?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pill, strong ? styles.pillOn : styles.pillOff, pressed && { opacity: 0.85 }]}
    >
      <Icon name={icon} size={16} color={strong ? '#fff' : colors.primary} />
      <Text style={[styles.pillText, { color: strong ? '#fff' : colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  zone: { gap: 10, paddingBottom: 4 },
  card: { alignItems: 'center', gap: 10, paddingTop: 12, paddingHorizontal: 8 },
  hintBox: { alignItems: 'center', gap: 2 },
  // voice.34 (user: "make it like a watermark style"): the bare M, flat ink tint, 9 % — previewed at
  // 6 / 9 / 14 %, 9 % reads as a watermark without competing with the mic. 512×500 source.
  logo: { width: 96, height: 94, opacity: 0.09, marginVertical: 4 },
  logoWrap: { width: 96, height: 94, marginVertical: 4, alignItems: 'center', justifyContent: 'center' },
  logoMic: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  bigWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', gap: 22, paddingTop: 18, paddingHorizontal: 20 },
  bigScale: { transform: [{ scale: 1.35 }] }, // the mic is THE control now — bigger than the 78 pt button
  hintMain: { fontFamily: fonts.interSemi, fontSize: 15, color: colors.ink, textAlign: 'center' },
  hello: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.muted, textAlign: 'center', marginBottom: 2 },
  hintSub: { fontFamily: fonts.inter, fontSize: 13.5, color: colors.muted, textAlign: 'center' },
  compactRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: 10 },
  saidCompact: { flex: 1, fontFamily: fonts.inter, fontSize: 15, lineHeight: 20, color: colors.ink },
  wordWrap: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  wordChip: { paddingVertical: 3, paddingHorizontal: 7, borderRadius: 8, backgroundColor: colors.surface2 },
  wordChipOn: { backgroundColor: colors.primary },
  wordText: { fontFamily: fonts.inter, fontSize: 15, lineHeight: 20, color: colors.ink },
  wordTextOn: { color: '#fff' },
  pills: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: 12 },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  pillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillOff: { backgroundColor: colors.surface, borderColor: colors.primary },
  pillText: { fontFamily: fonts.interSemi, fontSize: 15 },
  clearBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privText: { fontFamily: fonts.inter, fontSize: 12.5, color: colors.primaryInk, textAlign: 'center' },
  savedRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: 12, paddingHorizontal: 4 },
  savedText: { flex: 1, fontFamily: fonts.inter, fontSize: 13, color: colors.primaryInk },
  link: { fontFamily: fonts.interSemi, fontSize: 13, color: colors.primary },
  muted: { fontFamily: fonts.inter, fontSize: 12.5, color: colors.muted },
  typeLink: { alignSelf: 'center' },
  typeUnder: { marginTop: 14 },
  // same look as the old Voice tab's tip (Capture.tsx vtip): Space Mono, muted, centred
  vtip: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted, textAlign: 'center', marginTop: 10, paddingHorizontal: 16 },
  hidden: { display: 'none' },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch' },
  input: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.control,
    paddingVertical: 11,
    paddingHorizontal: 14,
    fontFamily: fonts.inter,
    fontSize: 14,
    backgroundColor: colors.surface2,
    color: colors.ink,
  },
});
