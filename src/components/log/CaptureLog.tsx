/**
 * LogList — the diagnostic trail: every parse attempt (thumbnail + produced JSON +
 * auto-verdict) and queued captures. Each entry expands to show the JSON. Rendered
 * inside the full-screen folder (FolderScreen) reached from the bottom dock.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { colors } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { Icon } from '../common/Icon';
import { useApp } from '../../state/AppContext';
import type { LogEntry, Status } from '../../types';

const BADGE: Record<Status, { ch: string; color: string }> = {
  ok: { ch: '✓', color: colors.good },
  warn: { ch: '⚠', color: colors.warn },
  fail: { ch: '✕', color: colors.fail },
};

export function LogList() {
  const { state } = useApp();
  const log = state.log;

  if (log.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          Each capture — the photo and the JSON it produced — gets logged here with a
          pass/warn/fail check.
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.body}>
      {log.map((e) => (
        <LogRow key={e.id} entry={e} />
      ))}
    </View>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const [open, setOpen] = useState(false);
  const badge = BADGE[entry.status];
  const when = new Date(entry.ts).toLocaleString();
  return (
    <View style={styles.entry}>
      <Pressable style={styles.row} onPress={() => setOpen((o) => !o)}>
        {entry.thumb ? (
          <Image source={{ uri: entry.thumb }} style={styles.thumb} />
        ) : (
          <View style={styles.thumbNone}>
            <Text style={styles.thumbNoneTxt}>{entry.kind}</Text>
          </View>
        )}
        <View style={styles.mid}>
          <Text style={styles.scope} numberOfLines={1}>
            <Text style={[styles.badge, { color: badge.color }]}>{badge.ch} </Text>
            {entry.label}
          </Text>
          <Text style={styles.meta}>
            {entry.count} item{entry.count === 1 ? '' : 's'} · {entry.notes.join(', ')}
          </Text>
          <Text style={styles.when}>{when}</Text>
        </View>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon name="chevron" size={16} color={colors.muted} />
        </View>
      </Pressable>
      {open ? <Text style={styles.json}>{JSON.stringify(entry.parsed, null, 2)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 16 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontFamily: fonts.inter, fontSize: 13, color: colors.muted, textAlign: 'center' },
  entry: { borderBottomWidth: 1, borderBottomColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10 },
  thumb: { width: 38, height: 38, borderRadius: 8, borderWidth: 1, borderColor: colors.line },
  thumbNone: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbNoneTxt: { fontFamily: fonts.mono, fontSize: 9, color: colors.muted, textTransform: 'uppercase' },
  mid: { flex: 1, minWidth: 0 },
  scope: { fontFamily: fonts.interSemi, fontSize: 13, color: colors.ink },
  badge: { fontFamily: fonts.monoBold },
  meta: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.muted, marginTop: 2 },
  when: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.muted, marginTop: 1 },
  json: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.ink,
    backgroundColor: colors.surface2,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
});
