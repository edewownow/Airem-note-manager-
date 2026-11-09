/**
 * BuiltInListening (feat/built-in-voice) — Settings → Listening: who turns your speech into text.
 *   - Google first (a built-in model backs it up when installed) or 🔒 Phone only (built-in only).
 *   - Built-in models (1.12.0-voice.7): Whisper small and Parakeet, each downloaded / removed on its
 *     own with progress + Cancel; when both are installed, chips pick which one listens. The active
 *     model's self-test ("heard … in 0.8 s") shows under it.
 *   - Clean background noise On / Off (voice.6).
 * State lives in lib/whisper.ts; this view subscribes, so a download keeps going if Settings closes.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { colors, radius } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { Chip } from '../common/Chip';
import { Button } from '../common/Button';
import {
  LISTEN_MODELS,
  activeModel,
  cancelInstall,
  installModel,
  modelState,
  refreshWhisper,
  removeModel,
  selfTestModel,
  setActiveModel,
  subscribeModels,
  type ListenModel,
} from '../../lib/whisper';
import { listenModeChoice, setListenMode } from '../../lib/speech';
import { denoiseEnabled, denoisePresent, ensureDenoiser, setDenoiseEnabled } from '../../lib/denoise';
import type { ListenMode } from '../../lib/settings';

const ORDER: ListenModel[] = ['parakeet', 'whisper'];
const mb = (id: ListenModel) => Math.round(LISTEN_MODELS[id].bytes / 1048576);
const BLURB: Record<ListenModel, string> = {
  parakeet: 'NVIDIA’s English model — fast, and better with accents.',
  whisper: 'OpenAI’s small English model — slower, weaker with accents.',
};

export function BuiltInListening() {
  const [, setTick] = useState(0);
  const [mode, setMode] = useState<ListenMode>(listenModeChoice());
  const [clean, setClean] = useState(denoiseEnabled());
  const [cleanerHere, setCleanerHere] = useState(denoisePresent());

  useEffect(() => {
    const off = subscribeModels(() => setTick((n) => n + 1));
    void refreshWhisper().then(() => setTick((n) => n + 1));
    return off;
  }, []);

  const active = activeModel();
  const isIn = (id: ListenModel) => ['ready', 'testing'].includes(modelState(id).status);
  const installedIds = ORDER.filter(isIn);
  const anyInstalled = installedIds.length > 0;

  useEffect(() => {
    if (anyInstalled && !cleanerHere) void ensureDenoiser().then(setCleanerHere);
  }, [anyInstalled, cleanerHere]);

  const chooseMode = (m: ListenMode) => {
    if (m === 'phone' && !anyInstalled) {
      Alert.alert('Download a built-in listener first', '“Phone only” needs one on this phone (Parakeet or Whisper, once).');
      return;
    }
    setMode(m);
    setListenMode(m);
  };

  const chooseClean = (on: boolean) => {
    setClean(on);
    setDenoiseEnabled(on);
  };

  const use = (id: ListenModel) => {
    setActiveModel(id);
    void selfTestModel(id);
  };

  const download = (id: ListenModel) =>
    Alert.alert(
      `Download ${LISTEN_MODELS[id].label}?`,
      `About ${mb(id)} MB, downloaded once (about ${LISTEN_MODELS[id].diskMb} MB after unpacking). Use Wi-Fi and keep MemoAirem open until it finishes.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Download',
          onPress: () => {
            void installModel(id).then(() => {
              // a freshly installed model starts listening (and runs its self-test)
              if (modelState(id).status === 'ready' || modelState(id).status === 'testing') use(id);
            });
          },
        },
      ],
    );

  const remove = (id: ListenModel) =>
    Alert.alert(
      `Remove ${LISTEN_MODELS[id].label}?`,
      `Frees about ${LISTEN_MODELS[id].diskMb} MB.` +
        (installedIds.length === 1 ? ' With no built-in listener left, listening goes back to Google only.' : ''),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            const last = installedIds.length === 1;
            void removeModel(id);
            if (last) {
              setMode('google');
              setListenMode('google');
            }
          },
        },
      ],
    );

  const row = (id: ListenModel) => {
    const s = modelState(id);
    const spec = LISTEN_MODELS[id];
    const pct = Math.round(s.fraction * 100);
    const t = s.test;
    if (s.status === 'downloading' || s.status === 'unpacking') {
      return (
        <View key={id} style={styles.model}>
          <Text style={styles.progTxt}>
            {s.status === 'downloading' ? `Downloading ${spec.label}… ${pct}%` : `Unpacking ${spec.label}… ${pct}%`}
          </Text>
          <View style={styles.bar}>
            <View style={[styles.fill, { width: `${Math.max(2, pct)}%` }]} />
          </View>
          <Pressable onPress={() => cancelInstall(id)} hitSlop={6}>
            <Text style={styles.danger}>Cancel</Text>
          </Pressable>
        </View>
      );
    }
    if (isIn(id)) {
      return (
        <View key={id} style={styles.model}>
          <Text style={styles.modelName}>
            {spec.label}
            {id === active ? '  · listening' : ''}
          </Text>
          <Text style={styles.note}>{BLURB[id]}</Text>
          {id === active ? (
            s.status === 'testing' ? (
              <Text style={styles.progTxt}>Testing…</Text>
            ) : t ? (
              <Text style={t.ok ? styles.ok : styles.err}>
                {t.ok
                  ? `✓ Self-test: heard “${t.heard}” in ${t.seconds.toFixed(1)} s`
                  : `Self-test didn’t match${t.heard ? `: heard “${t.heard}”` : ''}${s.error ? ` — ${s.error}` : ''}`}
              </Text>
            ) : null
          ) : null}
          <View style={styles.row}>
            {id === active ? (
              <Pressable onPress={() => void selfTestModel(id)} hitSlop={6} disabled={s.status === 'testing'}>
                <Text style={styles.link}>↻ test</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => remove(id)} hitSlop={6}>
              <Text style={styles.danger}>Remove</Text>
            </Pressable>
          </View>
        </View>
      );
    }
    return (
      <View key={id} style={styles.model}>
        <Text style={styles.modelName}>{spec.label}</Text>
        <Text style={styles.note}>{BLURB[id]}</Text>
        {s.status === 'error' && s.error ? <Text style={styles.err}>Didn’t finish: {s.error}. Try again on Wi-Fi.</Text> : null}
        <Button small label={`Download ${spec.label} (${mb(id)} MB)`} icon="download" onPress={() => download(id)} />
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Understands you with</Text>
      <View style={styles.row}>
        <Chip label="Google first" active={mode === 'google'} onPress={() => chooseMode('google')} />
        <Chip label="🔒 Phone only (private)" active={mode === 'phone'} onPress={() => chooseMode('phone')} />
      </View>
      <Text style={styles.note}>
        {!anyInstalled
          ? 'Optional: download a built-in listener. It understands you with no signal, takes over when Google fails, and makes “Phone only” possible.'
          : mode === 'google'
            ? `Google listens first. If it fails, or there’s no signal, ${LISTEN_MODELS[active].label} understands you on the phone instead.`
            : `Only ${LISTEN_MODELS[active].label}, on the phone — your speech never leaves it. The words appear a moment after you stop talking.`}
      </Text>

      {installedIds.length > 1 ? (
        <>
          <Text style={styles.label}>Built-in listener</Text>
          <View style={styles.row}>
            {installedIds.map((id) => (
              <Chip key={id} label={LISTEN_MODELS[id].label} active={id === active} onPress={() => use(id)} />
            ))}
          </View>
        </>
      ) : null}

      {ORDER.map(row)}

      {anyInstalled ? (
        <>
          <Text style={styles.label}>Clean background noise</Text>
          <View style={styles.row}>
            <Chip label="On" active={clean} onPress={() => chooseClean(true)} />
            <Chip label="Off" active={!clean} onPress={() => chooseClean(false)} />
          </View>
          <Text style={styles.note}>
            {!clean
              ? 'Off: the built-in listener hears the raw microphone.'
              : cleanerHere
                ? 'Removes fans, engines and crowd noise before the built-in listener hears you, and helps it notice when you stop talking.'
                : 'Getting the noise cleaner (0.5 MB)… it’s used as soon as it’s here. Needs signal once.'}
          </Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginBottom: 6 },
  label: { fontFamily: fonts.interSemi, fontSize: 12, color: colors.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  model: {
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
  },
  modelName: { fontFamily: fonts.interSemi, fontSize: 13, color: colors.ink },
  note: { fontFamily: fonts.inter, fontSize: 12, color: colors.muted, lineHeight: 17 },
  ok: { fontFamily: fonts.inter, fontSize: 12, color: colors.primaryInk, lineHeight: 17 },
  err: { fontFamily: fonts.inter, fontSize: 12, color: colors.errInk, lineHeight: 17 },
  link: { fontFamily: fonts.interSemi, fontSize: 12.5, color: colors.primary },
  danger: { fontFamily: fonts.interSemi, fontSize: 12.5, color: colors.fail },
  progTxt: { fontFamily: fonts.interSemi, fontSize: 12.5, color: colors.ink },
  bar: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surface2, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colors.primary },
});
