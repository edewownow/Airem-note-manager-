/**
 * PendingReview — editable review of just-parsed records. Edits and deletes here
 * are diffed against the model's original output and saved as corrections (the
 * real accuracy signal). Ported from the prototype's pending cards + Save.
 */
import React from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Image } from 'react-native';
import { colors } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { useApp } from '../../state/AppContext';
import type { CmpField, Rec } from '../../types';

export function PendingReview({ onPhoto, onSaved }: { onPhoto: (rec: Rec) => void; onSaved: () => void }) {
  const { state, actions } = useApp();
  const pending = state.pending;
  if (!pending.length) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.foot}>
        <Text style={styles.hint}>
          Found <Text style={styles.bold}>{pending.length}</Text> item
          {pending.length > 1 ? 's' : ''}. Edit any field or drop the junk — your fixes are saved as
          training data.
        </Text>
        <Button
          label={`Save (${pending.length})`}
          variant="primary"
          icon="save"
          onPress={() => {
            actions.savePending();
            onSaved();
          }}
        />
      </View>
      {pending.map((rec) => (
        <PendingCard key={rec.id} rec={rec} onPhoto={onPhoto} />
      ))}
    </View>
  );
}

function PendingCard({ rec, onPhoto }: { rec: Rec; onPhoto: (rec: Rec) => void }) {
  const { actions } = useApp();
  const set = (field: CmpField, value: string) =>
    actions.editPendingField(rec.id, field, value.trim() || null);

  return (
    <View style={styles.card}>
      <View style={styles.fields}>
        <TextInput
          style={[styles.input, styles.title]}
          defaultValue={rec.title ?? ''}
          onChangeText={(t) => set('title', t)}
          placeholder="what (title)"
          placeholderTextColor={colors.muted}
        />
        <View style={styles.grid}>
          <TextInput
            style={[styles.input, styles.mono]}
            defaultValue={rec.date ?? ''}
            onChangeText={(t) => set('date', t)}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
          />
          <TextInput
            style={[styles.input, styles.mono]}
            defaultValue={rec.time ?? ''}
            onChangeText={(t) => set('time', t)}
            placeholder="HH:MM"
            placeholderTextColor={colors.muted}
          />
          <TextInput
            style={styles.input}
            defaultValue={rec.location ?? ''}
            onChangeText={(t) => set('location', t)}
            placeholder="where"
            placeholderTextColor={colors.muted}
          />
          <TextInput
            style={styles.input}
            defaultValue={rec.people ?? ''}
            onChangeText={(t) => set('people', t)}
            placeholder="who"
            placeholderTextColor={colors.muted}
          />
        </View>
      </View>
      {rec.thumb ? (
        <Pressable style={styles.photo} onPress={() => onPhoto(rec)}>
          <Image source={{ uri: rec.thumb }} style={styles.photoImg} />
        </Pressable>
      ) : null}
      <Pressable style={styles.x} onPress={() => actions.removePending(rec.id)} hitSlop={8}>
        <Icon name="x" size={16} color={colors.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 4 },
  hint: { flex: 1, minWidth: 160, fontFamily: fonts.inter, fontSize: 11.5, color: colors.muted },
  bold: { fontFamily: fonts.interSemi, color: colors.ink },
  card: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 11,
    backgroundColor: colors.surface2,
    padding: 12,
    marginTop: 10,
  },
  fields: { flex: 1, minWidth: 0, gap: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 7,
    paddingVertical: 6,
    paddingHorizontal: 9,
    fontFamily: fonts.inter,
    fontSize: 13,
    backgroundColor: colors.surface,
    color: colors.ink,
    flexGrow: 1,
    flexBasis: '46%',
  },
  title: { fontFamily: fonts.interSemi, flexBasis: '100%' },
  mono: { fontFamily: fonts.mono, fontSize: 12 },
  photo: { width: 46, height: 46, borderRadius: 9, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', alignSelf: 'center' },
  photoImg: { width: '100%', height: '100%' },
  x: { padding: 3 },
});
