/**
 * CategoryPicker — pick a category for a record (variant experiment).
 * Lists the categories already in use (chips) plus a field for a new one.
 * Saving adds "#category" to the record through actions.setRecordCategory.
 */
import React, { useState } from 'react';
import { Modal, View, Text, TextInput, StyleSheet, Pressable, ScrollView } from 'react-native';
import { colors } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { useApp } from '../../state/AppContext';
import { allCategories, normalizeTag, tagWords, TAG_COLOR } from '../../lib/categories';
import type { Rec } from '../../types';

export function CategoryPicker({ rec, onClose }: { rec: Rec | null; onClose: () => void }) {
  const { state, actions } = useApp();
  const [name, setName] = useState('');
  if (!rec) return null;
  const known = allCategories(state.saved);
  /** The category a typed name actually means, by the engine's word rules. */
  const effectiveName = (raw: string): string => normalizeTag(tagWords(normalizeTag(raw)).join(' '));
  const save = (raw: string) => {
    // Same word rules as a spoken category: cut at the first stop-word and
    // cap at three words, or the stored name and the name the engine sees
    // would disagree ("ship safety at night" is the "ship safety" category).
    const clean = effectiveName(raw);
    if (!clean) return;
    actions.setRecordCategory(rec, clean);
    onClose();
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close category picker" />
        <View style={styles.sheet}>
          <Text style={styles.title}>Category</Text>
          <Text style={styles.rec} numberOfLines={1}>
            {rec.title}
          </Text>
          {known.length ? (
            <ScrollView style={styles.chips} contentContainerStyle={styles.chipsC} showsVerticalScrollIndicator={false}>
              {known.map((k) => (
                <Pressable key={k} style={styles.chip} onPress={() => save(k)} hitSlop={6}>
                  <Text style={styles.chipText}>#{k}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.note}>No categories yet — type one below.</Text>
          )}
          <TextInput
            style={styles.input}
            placeholder="New category, e.g. ship safety"
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={setName}
            onSubmitEditing={() => save(name)}
            returnKeyType="done"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.row}>
            <Pressable style={styles.cancel} onPress={onClose} hitSlop={8}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.save, !effectiveName(name) && styles.saveOff]}
              onPress={() => save(name)}
              hitSlop={8}
            >
              <Text style={styles.saveText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10, 20, 30, 0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 10,
  },
  title: { fontFamily: fonts.groteskSemi, fontSize: 16, color: colors.ink },
  rec: { fontFamily: fonts.inter, fontSize: 13, color: colors.muted },
  chips: { maxHeight: 132 },
  chipsC: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: TAG_COLOR,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { fontFamily: fonts.interSemi, fontSize: 13, color: TAG_COLOR },
  note: { fontFamily: fonts.inter, fontSize: 13, color: colors.muted },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.inter,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.surface2,
  },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, alignItems: 'center', paddingTop: 4 },
  cancel: { paddingVertical: 8, paddingHorizontal: 4 },
  cancelText: { fontFamily: fonts.interSemi, fontSize: 14, color: colors.muted },
  save: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: TAG_COLOR },
  saveOff: { opacity: 0.4 },
  saveText: { fontFamily: fonts.interSemi, fontSize: 14, color: '#fff' },
});
