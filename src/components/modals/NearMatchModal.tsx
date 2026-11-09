/**
 * NearMatchModal — the save-time duplicate prompt. When a just-parsed record overlaps
 * one already saved (≥2 of {title, location, time}), this surfaces a merged field-by-field
 * diff (existing vs new) and lets the user UPDATE the existing record, CREATE a new one, or
 * KEEP the existing (discard the new). Sequential: one prompt per overlapping record.
 *
 * Renders only when state.nearMatch is set (driven by AppContext's resolution session).
 * No nav lib — a transparent Modal overlay, same pattern as SettingsModal/Lightbox (inv. 7).
 */
import React from 'react';
import { Modal, View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, radius, shadow } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { Button } from '../common/Button';
import { useApp } from '../../state/AppContext';
import { DIFF_FIELDS } from '../../lib/match';
import { contentKey } from '../../lib/query';
import type { Rec } from '../../types';

const LABELS: Partial<Record<keyof Rec, string>> = {
  title: 'What',
  date: 'Date',
  time: 'Time',
  location: 'Where',
  people: 'Who',
  notes: 'Note',
};

const show = (v: Rec[keyof Rec]): string => {
  const s = (v ?? '').toString().trim();
  return s || '—';
};

export function NearMatchModal() {
  const { state, actions } = useApp();
  const nm = state.nearMatch;

  return (
    <Modal visible={!!nm} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.scrim}>
        {nm ? (
          <View style={styles.box}>
            <Text style={styles.h3}>Possible duplicate</Text>
            <Text style={styles.sub}>
              This looks like something you already saved. Update it, keep both, or discard
              this new one.
            </Text>

            <ScrollView style={styles.diff} contentContainerStyle={styles.diffC} showsVerticalScrollIndicator={false}>
              {DIFF_FIELDS.map((f) => {
                const oldV = show(nm.existing[f]);
                const newV = show(nm.pending[f]);
                const changed = contentKey(nm.existing, [f]) !== contentKey(nm.pending, [f]);
                return (
                  <View key={f} style={styles.row}>
                    <Text style={styles.label}>{LABELS[f] ?? f}</Text>
                    {changed ? (
                      <View style={styles.valWrap}>
                        <Text style={styles.oldV}>{oldV}</Text>
                        <Text style={styles.arrow}>→</Text>
                        <Text style={styles.newV}>{newV}</Text>
                      </View>
                    ) : (
                      <View style={styles.valWrap}>
                        <Text style={styles.sameV}>{oldV}</Text>
                        <Text style={styles.sameTag}>same</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.btns}>
              <Button label="Update existing" variant="primary" icon="save" onPress={() => actions.resolveNearMatch('update')} />
              <View style={styles.btnRow}>
                <Button label="Create new" variant="ghost" onPress={() => actions.resolveNearMatch('create')} style={{ flex: 1 }} />
                <Button label="Keep existing" variant="ghost" onPress={() => actions.resolveNearMatch('keep')} style={{ flex: 1 }} />
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  box: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '85%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 20,
    ...shadow,
  },
  h3: { fontFamily: fonts.groteskSemi, fontSize: 17, color: colors.ink },
  sub: { fontFamily: fonts.inter, fontSize: 12.5, color: colors.muted, marginTop: 6, lineHeight: 18 },
  diff: { marginTop: 14, maxHeight: 320 },
  diffC: { gap: 8 },
  row: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.control,
    backgroundColor: colors.surface2,
    paddingVertical: 8,
    paddingHorizontal: 11,
    gap: 3,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: colors.muted,
  },
  valWrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  oldV: { fontFamily: fonts.inter, fontSize: 13.5, color: colors.muted, textDecorationLine: 'line-through' },
  arrow: { fontFamily: fonts.mono, fontSize: 13, color: colors.accent },
  newV: { fontFamily: fonts.interSemi, fontSize: 13.5, color: colors.ink },
  sameV: { fontFamily: fonts.inter, fontSize: 13.5, color: colors.ink, flexShrink: 1 },
  sameTag: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted, marginLeft: 'auto' },
  btns: { marginTop: 16, gap: 8 },
  btnRow: { flexDirection: 'row', gap: 8 },
});
