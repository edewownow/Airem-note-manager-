/**
 * GemmaLoading — shown while Gemma starts (the first GPU prepare takes minutes). The engine
 * cannot report real progress, so the bar fills toward how long the last start took on this
 * phone (a first-time guess until one has been timed), with the time running beside it.
 * It stops at 95% until Gemma is ready, so it never claims to be done early. Gone when ready.
 */
import React, { useEffect, useReducer, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { gemmaIsLoading, gemmaLoadEstimateMs, gemmaLoadSeconds, subscribeGemmaLoad } from '../../lib/gemmaLive';

function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function GemmaLoading() {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [sec, setSec] = useState(() => gemmaLoadSeconds());
  const fill = useRef(new Animated.Value(0)).current;
  const loading = gemmaIsLoading();

  useEffect(() => {
    const off = subscribeGemmaLoad(bump);
    bump(); // a load may have started before this screen was listening
    return off;
  }, []);
  useEffect(() => {
    if (!loading) return;
    const tick = () => setSec(gemmaLoadSeconds());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [loading]);

  const estSec = Math.round(gemmaLoadEstimateMs() / 1000);
  const frac = Math.min(0.95, sec / Math.max(1, estSec));
  useEffect(() => {
    Animated.timing(fill, { toValue: frac, duration: 900, easing: Easing.linear, useNativeDriver: false }).start();
  }, [frac, fill]);

  if (!loading) return null;
  const over = sec > estSec;
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>Getting Gemma ready</Text>
        <Text style={styles.time}>{clock(sec)}</Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width }]} />
      </View>
      <Text style={styles.small}>
        {over
          ? 'Taking longer than usual. The first start on a phone can take a few minutes. Still working.'
          : `Usually about ${clock(estSec)}. You can keep using the app.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.card, padding: 12, gap: 8 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: fonts.groteskSemi, fontSize: 13.5, color: colors.ink },
  time: { fontFamily: fonts.mono, fontSize: 12, color: colors.primaryInk },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: colors.primary },
  small: { fontFamily: fonts.inter, fontSize: 11.5, color: colors.muted, lineHeight: 16 },
});
