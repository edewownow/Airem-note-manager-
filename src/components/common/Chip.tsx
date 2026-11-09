/**
 * Chip — small pill button (query suggestions, type filters). Mono label.
 */
import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/tokens';
import { fonts } from '../../theme/typography';

export function Chip({
  label,
  onPress,
  active,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && styles.active,
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text
        style={[styles.label, active && styles.labelActive]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    maxWidth: '100%', // never overflow the row; long labels truncate
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  active: { backgroundColor: colors.ink, borderColor: colors.ink },
  label: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.muted },
  labelActive: { color: '#fff' },
});
