/**
 * PinPad (1.13.0) — the MemoAirem 6-digit PIN. Its own keypad, not the phone keyboard: a keyboard
 * app can't learn, suggest or log the digits, and nothing is ever in a text field. Fills six dots,
 * then calls onComplete; the dots clear for the next try.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { colors } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { PIN_LENGTH } from '../../lib/vaultCrypto';

export function PinPad({
  title,
  sub,
  error,
  busy,
  onComplete,
  leftKey,
  resetKey,
}: {
  title: string;
  sub?: string | null;
  error?: string | null;
  busy?: boolean;
  onComplete: (pin: string) => void;
  /** bottom-left key, e.g. { label: 'Fingerprint', onPress } */
  leftKey?: { label: string; onPress: () => void } | null;
  /** change it to clear the dots from outside (e.g. a new step) */
  resetKey?: string | number;
}) {
  const [pin, setPin] = useState('');
  useEffect(() => setPin(''), [resetKey]);

  const press = (d: string) => {
    if (busy || pin.length >= PIN_LENGTH) return;
    const next = pin + d;
    setPin(next);
    if (next.length === PIN_LENGTH) {
      // let the last dot fill before the (slow) PIN check starts
      setTimeout(() => {
        onComplete(next);
        setPin('');
      }, 60);
    }
  };
  const back = () => !busy && setPin((p) => p.slice(0, -1));

  const Key = ({ label, onPress, small }: { label: string; onPress: () => void; small?: boolean }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={small ? styles.keySmall : styles.keyTxt}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      <View style={styles.dots} accessibilityLabel={`${pin.length} of ${PIN_LENGTH} digits`}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotOn]} />
        ))}
      </View>
      <View style={styles.status}>
        {busy ? <ActivityIndicator color={colors.primary} /> : error ? <Text style={styles.err}>{error}</Text> : null}
      </View>
      <View style={styles.grid}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <Key key={d} label={d} onPress={() => press(d)} />
        ))}
        {leftKey ? <Key label={leftKey.label} onPress={leftKey.onPress} small /> : <View style={styles.key} />}
        <Key label="0" onPress={() => press('0')} />
        <Key label="⌫" onPress={back} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10, alignSelf: 'stretch' },
  title: { fontFamily: fonts.groteskSemi, fontSize: 18, color: colors.ink, textAlign: 'center' },
  sub: { fontFamily: fonts.inter, fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 19, paddingHorizontal: 8 },
  dots: { flexDirection: 'row', gap: 14, marginTop: 6 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.primary },
  dotOn: { backgroundColor: colors.primary },
  status: { minHeight: 22, justifyContent: 'center' },
  err: { fontFamily: fonts.interSemi, fontSize: 12.5, color: colors.errInk, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 264, justifyContent: 'space-between', rowGap: 10 },
  key: { width: 80, height: 58, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  keyPressed: { backgroundColor: colors.deviceBg },
  keyTxt: { fontFamily: fonts.groteskSemi, fontSize: 24, color: colors.ink },
  keySmall: { fontFamily: fonts.interSemi, fontSize: 12, color: colors.primary, textAlign: 'center' },
});
