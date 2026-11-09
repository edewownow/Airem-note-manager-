/**
 * FolderScreen — the full-screen management surface for a storage folder, opened
 * from the bottom dock. NOT navigation: it's a conditional render that takes over
 * the three-zone screen, with a back-out to return. Saved = browse/edit/delete;
 * Capture log = the diagnostic trail.
 *
 * Cleanup row (1.7.0) under the header, every action behind a native confirm:
 *   Saved       → Remove duplicates (exact copies, newest kept)
 *   Capture log → Clear log
 * Deletes reach Harbor, like a single-record delete. Start fresh (delete ALL data) is
 * deliberately NOT here — it lives hidden in Settings → Reset.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, StatusBar as RNStatusBar } from 'react-native';
import { colors } from '../theme/tokens';
import { fonts } from '../theme/typography';
import { Icon } from './common/Icon';
import { Button } from './common/Button';
import { SavedList } from './saved/SavedFolder';
import { LogList } from './log/CaptureLog';
import { useApp } from '../state/AppContext';
import { duplicateIds } from '../lib/query';
import { loadSyncConfig } from '../lib/sync';
import type { FolderKind } from './BottomDock';
import type { Rec } from '../types';

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export function FolderScreen({
  kind,
  onBack,
  onPhoto,
}: {
  kind: FolderKind;
  onBack: () => void;
  onPhoto: (rec: Rec) => void;
}) {
  const { state, actions } = useApp();
  const isSaved = kind === 'saved';
  const title = isSaved ? 'Saved' : 'Capture log';
  const count = isSaved ? plural(state.saved.length, 'item') : plural(state.log.length, 'capture');
  const onExport = isSaved ? actions.exportSaved : actions.exportLog;
  const exportDisabled = isSaved ? !state.saved.length : !state.log.length;

  const dupCount = isSaved ? duplicateIds(state.saved).length : 0;
  const harbor = loadSyncConfig() != null;
  const alsoHarbor = harbor ? ' on this phone and on Harbor' : '';

  const confirmDuplicates = () => {
    Alert.alert(
      'Remove duplicates?',
      `${plural(dupCount, 'exact copy', 'exact copies')} will be deleted${alsoHarbor}. The newest of each stays. Records that differ in any field are kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            const n = actions.removeDuplicates();
            Alert.alert('Duplicates removed', `Deleted ${plural(n, 'copy', 'copies')}.`);
          },
        },
      ],
    );
  };

  const confirmClearLog = () => {
    Alert.alert(
      'Clear the capture log?',
      `${plural(state.log.length, 'log entry', 'log entries')} will be deleted. Saved items are not affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear log', style: 'destructive', onPress: actions.clearLog },
      ],
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: RNStatusBar.currentHeight ?? 0 }]}>
      <View style={styles.head}>
        <Pressable style={styles.back} onPress={onBack} hitSlop={8}>
          <Icon name="back" size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.count}>{count}</Text>
        <Pressable
          onPress={onExport}
          disabled={exportDisabled}
          hitSlop={6}
          style={[styles.export, exportDisabled && { opacity: 0.4 }]}
        >
          <Icon name="download" size={14} color={colors.ink} />
          <Text style={styles.exportTxt}>Export</Text>
        </Pressable>
      </View>
      <View style={styles.tools}>
        {isSaved ? (
          <Button
            small
            label={dupCount ? `Remove duplicates (${dupCount})` : 'No duplicates'}
            onPress={confirmDuplicates}
            disabled={!dupCount}
          />
        ) : (
          <Button small label="Clear log" onPress={confirmClearLog} disabled={!state.log.length} />
        )}
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isSaved ? <SavedList onPhoto={onPhoto} onEditRequest={onBack} /> : <LogList />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.canvas },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  back: { padding: 4 },
  title: { fontFamily: fonts.groteskSemi, fontSize: 17, color: colors.ink },
  count: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted, marginLeft: 8 },
  export: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: 'auto',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  exportTxt: { fontFamily: fonts.interSemi, fontSize: 11.5, color: colors.ink },
  tools: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 2,
  },
  content: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 40 },
});
