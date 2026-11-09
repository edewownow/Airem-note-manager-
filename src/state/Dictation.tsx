/**
 * Dictation — single shared speech recognizer (expo-speech-recognition exposes
 * ONE global recognizer, so we register its listeners once here and route
 * transcripts to whichever field is currently dictating).
 *
 * Voice works with no signal. Do not ask the native "is recognition available?"
 * check while rendering — a network change re-renders this tree, and that check
 * has taken the mic off the screen in airplane mode.
 *
 * Built-in listening (1.12.0-voice.3): when Whisper records directly, the words arrive a moment
 * AFTER the mic stops. stop() then keeps the text target alive until the result (or error) lands,
 * and `finishingId` tells the mic button to show "transcribing". cancel() throws a pending result
 * away (e.g. the note is being saved this instant).
 */
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useSpeechToText } from '../lib/speech';

type Target = (transcript: string, isFinal: boolean) => void;

type ErrTarget = (code: string) => void;

interface DictationValue {
  activeId: string | null;
  /** The field whose speech is still being transcribed after the mic stopped. */
  finishingId: string | null;
  available: boolean;
  start: (id: string, onText: Target, continuous?: boolean, onError?: ErrTarget, onDeviceOnly?: boolean) => void;
  stop: () => void;
  cancel: () => void;
}

const Ctx = createContext<DictationValue | null>(null);

export function DictationProvider({ children }: { children: React.ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [finishingId, setFinishingId] = useState<string | null>(null);
  const targetRef = useRef<Target | null>(null);
  const errorRef = useRef<ErrTarget | null>(null);
  const available = true;

  const { start: startRec, stop: stopRec, cancel: cancelRec } = useSpeechToText({
    onText: (t, final) => targetRef.current?.(t, final),
    onEnd: () => {
      targetRef.current = null;
      errorRef.current = null;
      setActiveId(null);
      setFinishingId(null);
    },
    onError: (code) => {
      // Surface the failure to the active caller (e.g. the Voice tab's honest message)
      // before clearing — offline-STT gaps must not fail silently (1.4.0).
      errorRef.current?.(code);
      targetRef.current = null;
      errorRef.current = null;
      setActiveId(null);
      setFinishingId(null);
    },
  });

  const start = useCallback(
    (id: string, onText: Target, continuous = false, onError?: ErrTarget, onDeviceOnly = false) => {
      targetRef.current = onText;
      errorRef.current = onError ?? null;
      setFinishingId(null);
      setActiveId(id);
      void startRec(continuous, onDeviceOnly);
    },
    [startRec],
  );

  const stop = useCallback(() => {
    // Reset listening state SYNCHRONOUSLY — do not wait for the recognizer's 'end' event. If the
    // native recognizer is wedged and never emits 'end', activeId would otherwise stick non-null
    // and MicButton's toggle (recording ? stop : start) could only ever call stop() again — a
    // permanent wedge needing an app restart. Resetting here means the next tap always starts
    // fresh (and start() force-aborts any lingering recognizer first).
    //
    // Exception (1.12.0-voice.3): Whisper is still transcribing what was recorded — keep the target
    // so the words still land in the field; onEnd/onError clears it.
    const id = activeId;
    setActiveId(null);
    if (stopRec()) {
      setFinishingId(id);
      return;
    }
    targetRef.current = null;
    errorRef.current = null;
  }, [stopRec, activeId]);

  const cancel = useCallback(() => {
    targetRef.current = null;
    errorRef.current = null;
    setActiveId(null);
    setFinishingId(null);
    cancelRec();
  }, [cancelRec]);

  return (
    <Ctx.Provider value={{ activeId, finishingId, available, start, stop, cancel }}>{children}</Ctx.Provider>
  );
}

export function useDictation() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDictation must be used within DictationProvider');
  return v;
}
