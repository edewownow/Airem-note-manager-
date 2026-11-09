/**
 * Button — primary (teal), cloud (violet/online), ghost (outline), danger (red outline,
 * destructive actions). Matches the
 * prototype's .btn variants. One-tap, with an optional leading icon.
 */
import React from 'react';
import { Pressable, Text, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'cloud' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'ghost',
  icon,
  disabled,
  style,
  small,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  disabled?: boolean;
  style?: ViewStyle;
  small?: boolean;
}) {
  const v = VARIANTS[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        small && styles.small,
        { backgroundColor: v.bg, borderColor: v.border },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <View style={styles.row}>
        {icon ? <Icon name={icon} size={small ? 14 : 15} color={v.fg} /> : null}
        <Text style={[styles.label, small && styles.labelSmall, { color: v.fg }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const VARIANTS: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: '#fff', border: 'transparent' },
  cloud: { bg: colors.cloud, fg: '#fff', border: 'transparent' },
  ghost: { bg: colors.surface, fg: colors.ink, border: colors.line },
  danger: { bg: colors.surface, fg: colors.fail, border: colors.fail }, // destructive (Clear all)
};

const styles = StyleSheet.create({
  base: {
    borderRadius: 9,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: { paddingVertical: 6, paddingHorizontal: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontFamily: fonts.interSemi, fontSize: 13 },
  labelSmall: { fontSize: 11.5 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
