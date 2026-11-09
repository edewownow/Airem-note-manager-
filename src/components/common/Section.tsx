/**
 * Section — a collapsible card with a tappable header + chevron. Used by the
 * Saved and Capture-log zones (closed by default).
 */
import React, { useState } from 'react';
import { Pressable, View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius, shadow } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { Icon, type IconName } from './Icon';

export function Section({
  title,
  count,
  icon,
  defaultOpen = false,
  headerRight,
  children,
  style,
}: {
  title: string;
  count?: string;
  icon?: IconName;
  defaultOpen?: boolean;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={[styles.card, style]}>
      <Pressable style={styles.head} onPress={() => setOpen((o) => !o)}>
        {icon ? <Icon name={icon} size={17} color={colors.muted} /> : null}
        <Text style={styles.title}>{title}</Text>
        {count ? <Text style={styles.count}>{count}</Text> : null}
        {headerRight}
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon name="chevron" size={16} color={colors.muted} />
        </View>
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    ...shadow,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  title: { fontFamily: fonts.groteskSemi, fontSize: 14, color: colors.ink },
  count: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted, marginLeft: 'auto' },
  body: { borderTopWidth: 1, borderTopColor: colors.line },
});
