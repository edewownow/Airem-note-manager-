/**
 * SetupDownloads — the live card for the first-run downloads: Kokoro (voice), Parakeet
 * (listener), Gemma (answers). One row each, with a bar that fills as bytes arrive, the
 * percent and MB, a pulse while it is working, the percent while it unpacks, and a check when
 * it is on the phone. Used in first-time setup and on the home screen until they are done.
 */
import React, { useEffect, useReducer, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { Button } from './Button';
import { Icon } from './Icon';
import { GEMMA_BYTES, gemmaFileState, subscribeGemmaFile } from '../../lib/gemmaFile';
import { KOKORO_BYTES, kokoroState, subscribeKokoro } from '../../lib/kokoro';
import { retrySetupDownloads, setupDownloadKind, setupDownloadNote, subscribeSetupDownloads } from '../../lib/setupDownloads';
import { LISTEN_MODELS, modelState, subscribeModels } from '../../lib/whisper';

type RowState = 'waiting' | 'offline' | 'downloading' | 'unpacking' | 'testing' | 'ready' | 'failed';

interface Row {
  key: string;
  name: string;
  what: string;
  state: RowState;
  fraction: number;
  bytes: number;
}

const MB = 1048576;

function useLive(): { rows: Row[]; kind: ReturnType<typeof setupDownloadKind>; note: string } {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const offs = [
      subscribeKokoro(bump),
      subscribeModels(bump),
      subscribeGemmaFile(bump),
      subscribeSetupDownloads(bump),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  const kind = setupDownloadKind();
  const idle: RowState = kind === 'offline' ? 'offline' : 'waiting';
  const k = kokoroState();
  const p = modelState('parakeet');
  const g = gemmaFileState();
  const pick = (status: string): RowState => {
    if (status === 'ready') return 'ready';
    if (status === 'downloading') return 'downloading';
    if (status === 'unpacking') return 'unpacking';
    if (status === 'testing') return 'testing';
    if (status === 'error') return 'failed';
    return idle;
  };
  return {
    kind,
    note: setupDownloadNote(),
    rows: [
      { key: 'kokoro', name: 'Kokoro', what: 'the voice', state: pick(k.status), fraction: k.fraction, bytes: KOKORO_BYTES },
      { key: 'parakeet', name: 'Parakeet', what: 'the listener', state: pick(p.status), fraction: p.fraction, bytes: LISTEN_MODELS.parakeet.bytes },
      { key: 'gemma', name: 'Gemma', what: 'spoken answers', state: pick(g.status), fraction: g.fraction, bytes: GEMMA_BYTES },
    ],
  };
}

function label(r: Row): string {
  const pct = Math.round(Math.max(0, Math.min(1, r.fraction)) * 100);
  switch (r.state) {
    case 'downloading':
      return `${pct}% · ${Math.round((r.fraction * r.bytes) / MB)} of ${Math.round(r.bytes / MB)} MB`;
    case 'unpacking':
      return `Unpacking ${pct}%`;
    case 'testing':
      return 'Checking it works';
    case 'ready':
      return 'On this phone';
    case 'failed':
      return 'Didn’t finish';
    case 'offline':
      return 'Waiting for a signal';
    default:
      return 'Next in line';
  }
}

function Bar({ state, fraction }: { state: RowState; fraction: number }) {
  const fill = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const working = state === 'downloading' || state === 'unpacking' || state === 'testing';

  useEffect(() => {
    const target =
      state === 'ready' || state === 'testing'
        ? 1
        : state === 'downloading' || state === 'unpacking'
          ? Math.max(0.02, fraction)
          : 0;
    Animated.timing(fill, { toValue: target, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [state, fraction, fill]);

  useEffect(() => {
    if (!working) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.6, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [working, pulse]);

  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={styles.track}>
      {/* Two separate animated views on purpose. The width is driven from JS and the pulse from the
          native side; React Native throws if ONE view carries both (that crashed the release build
          the moment the first download started). */}
      <Animated.View style={[styles.fillBox, { width }]}>
        <Animated.View style={[styles.fill, { opacity: pulse }, state === 'failed' ? styles.fillFail : null]} />
      </Animated.View>
    </View>
  );
}

export function SetupDownloads({ showTryAgain = true }: { showTryAgain?: boolean }) {
  const { rows, kind, note } = useLive();
  const busy = rows.find((r) => r.state === 'downloading' || r.state === 'unpacking' || r.state === 'testing');
  const done = rows.filter((r) => r.state === 'ready').length;
  const summary = busy
    ? `${done} of 3 ready · ${busy.state === 'downloading' ? 'Downloading' : busy.state === 'unpacking' ? 'Unpacking' : 'Checking'} ${busy.name}`
    : done === 3
      ? 'All 3 are on this phone'
      : `${done} of 3 ready`;
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Getting MemoAirem’s voice, ears and brain</Text>
      <Text style={styles.summary}>{summary}</Text>
      {rows.map((r) => (
        <View key={r.key} style={styles.row}>
          <View style={styles.head}>
            <Text style={styles.name}>
              {r.name} <Text style={styles.what}>· {r.what}</Text>
            </Text>
            <View style={styles.status}>
              {r.state === 'ready' ? <Icon name="logCheck" size={13} color={colors.primary} /> : null}
              <Text style={[styles.pct, r.state === 'failed' && styles.pctFail, r.state === 'ready' && styles.pctOk]}>{label(r)}</Text>
            </View>
          </View>
          <Bar state={r.state} fraction={r.fraction} />
        </View>
      ))}
      {kind === 'working' ? <Text style={styles.small}>One at a time. You can keep going.</Text> : null}
      {kind === 'failed' || kind === 'offline' ? <Text style={styles.small}>{note}</Text> : null}
      {kind === 'failed' && showTryAgain ? <Button small label="Try again" variant="primary" onPress={retrySetupDownloads} /> : null}
    </View>
  );
}

/** True while the card has something to say: working, waiting for a signal, or failed. */
export function setupDownloadsVisible(kind: ReturnType<typeof setupDownloadKind>): boolean {
  return kind === 'working' || kind === 'offline' || kind === 'failed';
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 12,
    gap: 10,
  },
  title: { fontFamily: fonts.groteskSemi, fontSize: 13.5, color: colors.ink },
  summary: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.primaryInk },
  row: { gap: 5 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { fontFamily: fonts.interSemi, fontSize: 12.5, color: colors.ink },
  what: { fontFamily: fonts.inter, color: colors.muted },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  pct: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted },
  pctOk: { color: colors.primary },
  pctFail: { color: colors.fail },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  fillBox: { height: '100%' },
  fill: { width: '100%', height: '100%', borderRadius: 4, backgroundColor: colors.primary },
  fillFail: { backgroundColor: colors.fail },
  small: { fontFamily: fonts.inter, fontSize: 11.5, color: colors.muted, lineHeight: 16 },
});
