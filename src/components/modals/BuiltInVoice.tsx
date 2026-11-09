/**
 * BuiltInVoice (feat/built-in-voice) — Settings → Voice controls for the built-in Kokoro voice:
 * which engine speaks (Phone / Built-in), download (334 MB, once) with progress + Cancel, the Kokoro
 * voice chips with instant preview, and Remove. The download keeps running if Settings closes —
 * state lives in lib/kokoro.ts and this view just subscribes.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { colors, radius } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { Chip } from '../common/Chip';
import { Button } from '../common/Button';
import {
  KOKORO_BYTES,
  KOKORO_VOICES,
  cancelKokoroInstall,
  installKokoro,
  kokoroState,
  refreshKokoro,
  removeKokoro,
  subscribeKokoro,
  type KokoroState,
} from '../../lib/kokoro';
import { builtinVoiceId, previewBuiltin, setBuiltinVoice, setTtsEngine, ttsEngine } from '../../lib/speech';
import type { TtsEngineChoice } from '../../lib/settings';

const SAMPLE = 'You have two things tomorrow. Boat drill at 10 in the morning, and dinner with Sam at 7 in the evening.';
const MB = Math.round(KOKORO_BYTES / 1048576);

export function BuiltInVoice({ onEngineChange }: { onEngineChange: (e: TtsEngineChoice) => void }) {
  const [k, setK] = useState<KokoroState>(kokoroState());
  const [engine, setEngine] = useState<TtsEngineChoice>(ttsEngine());
  const [voice, setVoice] = useState(builtinVoiceId());
  const [previewErr, setPreviewErr] = useState<string | null>(null);

  useEffect(() => {
    const off = subscribeKokoro(setK);
    void refreshKokoro().then(setK);
    return off;
  }, []);

  const choose = (e: TtsEngineChoice) => {
    setEngine(e);
    setTtsEngine(e);
    onEngineChange(e);
  };

  const preview = (id: string) => {
    setPreviewErr(null);
    previewBuiltin(SAMPLE, id).catch((e) => setPreviewErr('Built-in voice failed: ' + String(e?.message ?? e)));
  };

  const pick = (id: string) => {
    setVoice(id);
    setBuiltinVoice(id);
    preview(id);
  };

  const download = () =>
    Alert.alert(
      'Download the built-in voice?',
      `About ${MB} MB, downloaded once. After that it works fully offline. Keep MemoAirem open until it finishes.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Download', onPress: () => void installKokoro() },
      ],
    );

  const remove = () =>
    Alert.alert('Remove the built-in voice?', `Frees about ${MB} MB. You can download it again later.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void removeKokoro();
          if (engine === 'builtin') choose('phone');
        },
      },
    ]);

  const busy = k.status === 'downloading' || k.status === 'unpacking';
  const pct = Math.round(k.fraction * 100);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Speaks with</Text>
      <View style={styles.row}>
        <Chip label="Phone" active={engine === 'phone'} onPress={() => choose('phone')} />
        <Chip label="Built-in (Kokoro)" active={engine === 'builtin'} onPress={() => choose('builtin')} />
      </View>

      {k.status === 'ready' ? (
        engine === 'builtin' ? (
          <>
            <View style={styles.voiceWrap}>
              {KOKORO_VOICES.map((v) => (
                <Chip key={v.id} label={v.star ? `★ ${v.label}` : v.label} active={voice === v.id} onPress={() => pick(v.id)} />
              ))}
            </View>
            <Pressable onPress={() => preview(voice)} hitSlop={6}>
              <Text style={styles.link}>🔊 test built-in voice</Text>
            </Pressable>
            {previewErr ? <Text style={styles.err}>{previewErr}</Text> : null}
            <Text style={styles.note}>
              Runs inside MemoAirem, fully offline — Android can’t switch it off. The first answer after opening
              the app takes a moment while the voice loads.
            </Text>
          </>
        ) : (
          <Text style={styles.note}>
            Built-in voice installed — if the phone’s voice doesn’t start within 4 seconds, MemoAirem speaks with the
            built-in voice instead.
          </Text>
        )
      ) : busy ? (
        <View style={styles.progress}>
          <Text style={styles.progTxt}>
            {k.status === 'downloading' ? `Downloading the built-in voice… ${pct}%` : `Unpacking… ${pct}%`}
          </Text>
          <View style={styles.bar}>
            <View style={[styles.fill, { width: `${Math.max(2, pct)}%` }]} />
          </View>
          <Pressable onPress={cancelKokoroInstall} hitSlop={6}>
            <Text style={styles.danger}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.progress}>
          <Text style={styles.note}>
            {engine === 'builtin'
              ? `The built-in voice isn’t on this phone yet — ${MB} MB, downloaded once, then fully offline. Until then the phone’s voice speaks.`
              : `Optional: download the built-in voice (${MB} MB) — it then also stands in whenever the phone’s voice fails.`}
          </Text>
          {k.status === 'error' && k.error ? <Text style={styles.err}>Didn’t finish: {k.error}. Try again on Wi-Fi.</Text> : null}
          <Button small label={`Download built-in voice (${MB} MB)`} icon="download" onPress={download} />
        </View>
      )}

      {k.status === 'ready' ? (
        <Pressable onPress={remove} hitSlop={6} style={{ marginTop: 4 }}>
          <Text style={styles.danger}>Remove built-in voice</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginBottom: 6 },
  label: { fontFamily: fonts.interSemi, fontSize: 12, color: colors.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  voiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  note: { fontFamily: fonts.inter, fontSize: 12, color: colors.muted, lineHeight: 17 },
  err: { fontFamily: fonts.inter, fontSize: 12, color: colors.errInk, lineHeight: 17 },
  link: { fontFamily: fonts.interSemi, fontSize: 12.5, color: colors.primary },
  danger: { fontFamily: fonts.interSemi, fontSize: 12.5, color: colors.fail },
  progress: { gap: 8 },
  progTxt: { fontFamily: fonts.interSemi, fontSize: 12.5, color: colors.ink },
  bar: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surface2, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colors.primary },
});
