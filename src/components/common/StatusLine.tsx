/**
 * StatusLine — the work/warn/err status banner shown after actions (parse, save,
 * sample). Mirrors the prototype's .status element.
 */
import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import type { StatusLine as StatusLineType } from '../../state/AppContext';

export function StatusLine({ status }: { status: StatusLineType | null }) {
  if (!status) return null;
  const tone = TONES[status.kind];
  return (
    <View style={[styles.box, { backgroundColor: tone.bg }]}>
      {status.kind === 'work' ? <ActivityIndicator size="small" color={tone.fg} /> : null}
      <Text style={[styles.text, { color: tone.fg }]}>{status.text}</Text>
    </View>
  );
}

const TONES = {
  work: { bg: colors.cloudBg, fg: colors.cloudInk },
  done: { bg: colors.cloudBg, fg: colors.cloudInk },
  warn: { bg: colors.warnBg, fg: colors.warnInk },
  err: { bg: colors.errBg, fg: colors.errInk },
};

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderRadius: 10,
    marginTop: 14,
  },
  text: { fontFamily: fonts.inter, fontSize: 13, flex: 1 },
});
