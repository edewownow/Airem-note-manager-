/**
 * BottomDock (ZONE 3) — the storage folders on ONE minimalist line (1.10.6): Saved · Capture log ·
 * 🔒 Private, side by side — each an icon, its name and a small count. Tapping one opens that folder
 * FULL-SCREEN (management surface); the dock itself never shows folder contents.
 *
 * No Export buttons or chevrons here any more: Export lives in the Saved / Capture log folder
 * screens' headers (FolderScreen). The Private folder shows "locked", or "2 due" in that
 * same line when a document is expired or inside 6 months. No names, and the tile does not grow.
 *
 * Out of scroll flow; held to the bottom and covered by the keyboard (adjustPan) rather than
 * reflowing upward.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors } from '../theme/tokens';
import { fonts } from '../theme/typography';
import { Icon, type IconName } from './common/Icon';
import { useApp } from '../state/AppContext';
import { privateDueCount } from '../lib/vault';

export type FolderKind = 'saved' | 'log' | 'private';

export function BottomDock({ onOpen }: { onOpen: (kind: FolderKind) => void }) {
  const { state } = useApp();
  const due = privateDueCount();
  const dueLabel = due > 0 ? `${due} due` : 'locked';
  return (
    <View style={styles.dock}>
      <Tile icon="folder" label="Saved" sub={`${state.saved.length}`} onPress={() => onOpen('saved')} />
      <View style={styles.divider} />
      <Tile icon="logCheck" label="Log" sub={`${state.log.length}`} onPress={() => onOpen('log')} />
      <View style={styles.divider} />
      <Tile
        icon="lock"
        label="Private"
        sub={dueLabel}
        alert={due > 0}
        onPress={() => onOpen('private')}
        accent
      />
    </View>
  );
}

function Tile({
  icon,
  label,
  sub,
  onPress,
  accent,
  alert,
}: {
  icon: IconName;
  label: string;
  sub: string;
  onPress: () => void;
  accent?: boolean; // the Private folder's lock is drawn in the primary teal
  alert?: boolean; // same line, warning color — the tile stays the same size
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
      accessibilityRole="button"
      accessibilityLabel={`${label} folder, ${sub}`}
    >
      <Icon name={icon} size={18} color={accent ? colors.primary : colors.muted} />
      <View style={styles.text}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.sub, alert && styles.subAlert]} numberOfLines={1}>
          {sub}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dock: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: 6,
    // a soft lift so it reads as a fixed dock above the info window
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 8,
  },
  tile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 10,
  },
  tilePressed: { backgroundColor: colors.surface2 },
  text: { flexShrink: 1 },
  label: { fontFamily: fonts.groteskSemi, fontSize: 13.5, color: colors.ink },
  sub: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.muted, marginTop: 1 },
  subAlert: { color: colors.warn },
  divider: { width: 1, backgroundColor: colors.line, marginVertical: 12 },
});
