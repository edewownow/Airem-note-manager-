/**
 * EventCard — a stored/queried record. Date box + title + type tag + meta
 * (time/where/who) + notes + provenance ("captured via") + optional source-photo
 * thumbnail + remove. Ported from the prototype's eventCard().
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { colors } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { Icon } from './Icon';
import { TagText } from './TagText';
import { MON, parseISO } from '../../lib/datetime';
import { isPastEvent } from '../../lib/query';
import { TAG_COLOR } from '../../lib/categories';
import type { Rec } from '../../types';

export function EventCard({
  rec,
  onRemove,
  onPhoto,
  onEdit,
  onCategorize,
}: {
  rec: Rec;
  onRemove?: (id: string) => void;
  onPhoto?: (rec: Rec) => void;
  onEdit?: (rec: Rec) => void;
  onCategorize?: (rec: Rec) => void;
}) {
  const meta: string[] = [];
  if (rec.time) meta.push('◷ ' + rec.time);
  if (rec.location) meta.push('⚲ ' + rec.location);
  if (rec.people) meta.push('◍ ' + rec.people);

  let day = '';
  let mon = '';
  if (rec.date) {
    const d = parseISO(rec.date);
    mon = MON[d.getMonth()];
    day = String(d.getDate());
  }

  const isPast = isPastEvent(rec); // 1.9.1: already happened → dimmed + PAST tag

  return (
    <View style={[styles.ev, isPast && styles.evPast]}>
      <View style={styles.date}>
        {rec.date ? (
          <>
            <Text style={styles.dateMon}>{mon}</Text>
            <Text style={styles.dateDay}>{day}</Text>
          </>
        ) : (
          <Text style={styles.noDate}>no{'\n'}date</Text>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <TagText text={rec.title} style={styles.title} />
          {rec.type && rec.type !== 'event' ? (
            <Text style={styles.kind}>{rec.type.replace(/_/g, ' ')}</Text>
          ) : rec.type === 'event' && /^voice/i.test(rec.via ?? '') ? (
            // 1.9.4: voice saves carry one of three labels — show "schedule" so all three are visible
            <Text style={styles.kind}>schedule</Text>
          ) : null}
          {isPast ? <Text style={styles.past}>past</Text> : null}
        </View>
        {meta.length ? <Text style={styles.meta}>{meta.join('   ')}</Text> : null}
        {rec.notes ? <TagText text={rec.notes} style={styles.notes} /> : null}
        {rec.via && rec.via !== 'typed' ? (
          <Text style={styles.via}>captured via: “{rec.via}”</Text>
        ) : null}
        {onEdit || onCategorize ? (
          <View style={styles.actions}>
            {onEdit ? (
              <Pressable onPress={() => onEdit(rec)} hitSlop={8} style={styles.action}>
                <Text style={styles.actionText}>Edit</Text>
              </Pressable>
            ) : null}
            {onCategorize ? (
              <Pressable onPress={() => onCategorize(rec)} hitSlop={8} style={styles.action}>
                <Text style={styles.actionText}>Category</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {rec.thumb ? (
        <Pressable style={styles.photo} onPress={() => onPhoto?.(rec)}>
          <Image source={{ uri: rec.thumb }} style={styles.photoImg} />
        </Pressable>
      ) : null}

      {onRemove ? (
        <Pressable style={styles.x} onPress={() => onRemove(rec.id)} hitSlop={8}>
          <Icon name="x" size={16} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ev: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 11,
    backgroundColor: colors.surface2,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  evPast: { opacity: 0.55 },
  past: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    backgroundColor: colors.line,
    color: colors.muted,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  date: {
    minWidth: 50,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 9,
  },
  dateMon: { fontFamily: fonts.mono, fontSize: 11, color: colors.primaryInk },
  dateDay: { fontFamily: fonts.monoBold, fontSize: 16, color: colors.primaryInk, lineHeight: 18 },
  noDate: { fontFamily: fonts.mono, fontSize: 9, color: colors.muted, textAlign: 'center' },
  body: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  title: { fontFamily: fonts.interSemi, fontSize: 14, color: colors.ink },
  kind: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    backgroundColor: colors.cloudBg,
    color: colors.cloudInk,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  meta: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, marginTop: 3 },
  notes: { fontFamily: fonts.inter, fontSize: 12, color: colors.muted, marginTop: 5 },
  // Edit / Category on every saved record — small, quiet, one tap.
  actions: { flexDirection: 'row', gap: 18, marginTop: 8, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  action: { paddingVertical: 4, paddingHorizontal: 2 },
  actionText: { fontFamily: fonts.interSemi, fontSize: 12.5, color: TAG_COLOR },
  via: { fontFamily: fonts.inter, fontSize: 11, color: colors.muted, fontStyle: 'italic', marginTop: 5 },
  photo: {
    width: 46,
    height: 46,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  photoImg: { width: '100%', height: '100%' },
  x: { padding: 3 },
});
