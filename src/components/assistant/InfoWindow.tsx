/**
 * InfoWindow (ZONE 2) — the answer surface. On a query it renders the matched
 * record(s) as READABLE text (title + populated when/where/who/notes, empty
 * fields dropped) and shows the source image when one exists (the image is the
 * answer for photo records). Notes render verbatim on their own line so the
 * answer carries the full event info. #tags render in the category color
 * (TagText). Every shown record carries quiet Edit / Category options, and the
 * selected category shows as a chip above the results (tap it to clear).
 * With no query yet, it shows a calm "anticipating" placeholder.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, Pressable, ScrollView } from 'react-native';
import { colors } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { Icon } from '../common/Icon';
import { TagText } from '../common/TagText';
import { CategoryPicker } from '../modals/CategoryPicker';
import { useApp } from '../../state/AppContext';
import type { QueryResult } from '../../lib/query';
import { MON, WD, parseISO, spokenTime } from '../../lib/datetime';
import { spokenReply } from '../../lib/voice';
import { isPastEvent } from '../../lib/query';
import { clearActiveCategory, getActiveCategory, TAG_COLOR } from '../../lib/categories';
import { learnRecord } from '../../lib/learning';
import { speak } from '../../lib/speech';
import type { Rec } from '../../types';

// On-brand placeholder accents (navy / blue) — quiet, not a loud empty-state.
const NAVY = '#161E2A';
const BLUE = '#2279F1';

function whenLine(rec: Rec): string {
  if (!rec.date) return rec.time ? spokenTime(rec.time) : '';
  const d = parseISO(rec.date);
  const base = WD[d.getDay()].slice(0, 3) + ', ' + MON[d.getMonth()] + ' ' + d.getDate();
  return rec.time ? base + ' · ' + spokenTime(rec.time) : base;
}

export function InfoWindow({
  result,
  onPhoto,
  onTaught,
}: {
  result: QueryResult | null;
  onPhoto: (rec: Rec) => void;
  onTaught?: (question: string) => void;
}) {
  const { state, actions } = useApp();
  // voice.24 (user: "only if it's a long list and the view can't fit") — "more ⌄" at the bottom only
  // when the result cards overflow the space and you haven't scrolled to the end
  const [viewH, setViewH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const [atEnd, setAtEnd] = useState(false);
  useEffect(() => setAtEnd(false), [result]);
  const more = contentH > viewH + 8 && !atEnd;
  // Categories (variant experiment): the record being categorized, and a local
  // tick so the chip's × clears it from the screen at once (the engine's
  // expiry is enforced on the next question).
  const [categorizing, setCategorizing] = useState<Rec | null>(null);
  const [, setCatTick] = useState(0);
  const activeCat = getActiveCategory();

  if (!result) return <Placeholder />;

  const { results, interpText, answer } = result;
  const picks = result.asked
    ? state.saved.filter((r) => r.type !== 'private' && r.type !== 'private-note' && r.type !== 'private-doc')
    : [];

  return (
    <View style={styles.window}>
      {answer ? <Text style={result.spoken ? styles.gemma : styles.answer}>{answer}</Text> : null}
      {activeCat ? (
        <View style={styles.catRow}>
          <Pressable
            style={styles.catChip}
            onPress={() => {
              clearActiveCategory();
              setCatTick((t) => t + 1);
            }}
            hitSlop={8}
            accessibilityLabel={`Clear category ${activeCat}`}
          >
            <Text style={styles.catText}>#{activeCat}</Text>
            <Text style={styles.catX}>×</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.head}>
        <Text style={styles.count}>
          {results.length} result{results.length === 1 ? '' : 's'}
        </Text>
        {interpText && interpText !== 'everything' ? (
          <Text style={styles.interp} numberOfLines={1}>
            {interpText}
          </Text>
        ) : null}
        {results.length ? (
          <Pressable
            onPress={() => speak(spokenReply(result), state.voiceId || undefined, state.online)}
            hitSlop={8}
            style={styles.replay}
          >
            <Icon name="speaker" size={16} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {results.length ? (
        <View style={styles.scroll}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollC}
            showsVerticalScrollIndicator={false}
            onLayout={(e) => setViewH(e.nativeEvent.layout.height)}
            onContentSizeChange={(_w, h) => setContentH(h)}
            scrollEventThrottle={64}
            onScroll={(e) => {
              const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
              setAtEnd(layoutMeasurement.height + contentOffset.y >= contentSize.height - 12);
            }}
          >
            {results.map((rec) => (
              <AnswerCard
                key={rec.id}
                rec={rec}
                image={actions.getImage(rec.imageId) ?? rec.thumb}
                onPhoto={onPhoto}
                onEdit={actions.requestEdit}
                onCategorize={setCategorizing}
              />
            ))}
          </ScrollView>
          {more ? (
            <View style={styles.more} pointerEvents="none">
              <Text style={styles.moreText}>more</Text>
              <Icon name="chevron" size={13} color={colors.muted} />
            </View>
          ) : null}
        </View>
      ) : picks.length ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.pickScroll}
          showsVerticalScrollIndicator
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.missHint}>
            Nothing matched. Try “this week”, a place, a name, or a keyword.
          </Text>
          <Text style={styles.missLead}>Or tap the record this question meant.</Text>
          {picks.map((rec) => (
            <Pressable
              key={rec.id}
              onPress={() => {
                if (result.asked && learnRecord(result.asked, rec.title)) onTaught?.(result.asked);
              }}
              style={styles.pickRow}
            >
              <Text style={styles.pickText} numberOfLines={1}>{rec.title}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.center}>
          <Text style={styles.muted}>
            {state.saved.length
              ? 'Nothing matched. Try “this week”, a place, a name, or a keyword.'
              : 'Nothing saved yet — capture or add something first.'}
          </Text>
        </View>
      )}
      {categorizing ? <CategoryPicker rec={categorizing} onClose={() => setCategorizing(null)} /> : null}
    </View>
  );
}

function AnswerCard({
  rec,
  image,
  onPhoto,
  onEdit,
  onCategorize,
}: {
  rec: Rec;
  image: string | null;
  onPhoto: (rec: Rec) => void;
  onEdit?: (rec: Rec) => void;
  onCategorize?: (rec: Rec) => void;
}) {
  const when = whenLine(rec);
  const isPast = isPastEvent(rec); // only shown when the question asked about the past
  return (
    <View style={[styles.card, isPast && { opacity: 0.6 }]}>
      {image ? (
        <Pressable onPress={() => onPhoto(rec)} style={styles.imgWrap}>
          <Image source={{ uri: image }} style={styles.img} resizeMode="cover" />
        </Pressable>
      ) : null}
      <TagText text={rec.title} style={styles.title} />
      {when ? <Text style={styles.field}>◷ {when}{isPast ? '  · past' : ''}</Text> : null}
      {rec.location ? <Text style={styles.field}>⚲ {rec.location}</Text> : null}
      {rec.people ? <Text style={styles.field}>◍ {rec.people}</Text> : null}
      {rec.notes ? <TagText text={rec.notes} style={styles.note} /> : null}
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
  );
}

function Placeholder() {
  return (
    <View style={styles.phWrap}>
      <View style={styles.phBadge}>
        <Image
          source={require('../../../assets/memoairem-app-icon.png')}
          style={styles.phIcon}
          resizeMode="contain"
        />
      </View>
      <Text style={styles.phTitle}>Your answers appear here</Text>
      <Text style={styles.phSub}>Ask a question above, or tap a time chip.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  window: { flex: 1, paddingHorizontal: 14, paddingTop: 6 },
  // direct answer — the headline reply ("Frescobaldi … — Sun, Jun 21 · 6:30 PM")
  answer: { fontFamily: fonts.groteskSemi, fontSize: 16, color: colors.ink, paddingTop: 4, paddingBottom: 8, lineHeight: 22 },
  // Gemma's sentence. Saved records below stay in the normal type.
  gemma: { fontFamily: fonts.interItalic, fontSize: 16, color: colors.cloudInk, paddingTop: 4, paddingBottom: 8, lineHeight: 22 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 6 },
  // Categories: the selected category, always visible while it scopes the
  // search. Tap it (or say "clear category") to go back to general search.
  catRow: { flexDirection: 'row', paddingBottom: 6 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: TAG_COLOR,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.surface,
  },
  catText: { fontFamily: fonts.interSemi, fontSize: 13, color: TAG_COLOR },
  catX: { fontFamily: fonts.interSemi, fontSize: 14, color: TAG_COLOR, lineHeight: 16 },
  count: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted },
  interp: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: colors.cloudInk,
    backgroundColor: colors.cloudBg,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  replay: { marginLeft: 'auto' },
  scroll: { flex: 1 },
  more: {
    position: 'absolute',
    bottom: 6,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  moreText: { fontFamily: fonts.interSemi, fontSize: 11.5, color: colors.muted },
  scrollC: { paddingBottom: 16, gap: 10 },
  card: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: 14,
    gap: 5,
  },
  imgWrap: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.imageBg,
    marginBottom: 6,
  },
  img: { width: '100%', height: 200 },
  title: { fontFamily: fonts.groteskSemi, fontSize: 17, color: colors.ink },
  field: { fontFamily: fonts.inter, fontSize: 14, color: colors.ink },
  // notes: sentence-shaped freeform text, not a ◷/⚲/◍ token line — muted,
  // full-width, paragraph leading, with a little breathing room above.
  note: { fontFamily: fonts.inter, fontSize: 13.5, lineHeight: 19, color: colors.muted, marginTop: 3 },
  // Edit / Category on every shown record — small, quiet, one tap.
  actions: { flexDirection: 'row', gap: 18, marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  action: { paddingVertical: 4, paddingHorizontal: 2 },
  actionText: { fontFamily: fonts.interSemi, fontSize: 13, color: TAG_COLOR },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  pickScroll: { paddingBottom: 12 },
  missHint: { fontFamily: fonts.inter, fontSize: 13, lineHeight: 18, color: colors.muted, paddingBottom: 8 },
  missLead: { fontFamily: fonts.inter, fontSize: 12.5, lineHeight: 17, color: colors.muted, paddingBottom: 2 },
  pickRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  pickText: { fontFamily: fonts.inter, fontSize: 15, color: colors.ink },
  muted: { fontFamily: fonts.inter, fontSize: 13.5, color: colors.muted, textAlign: 'center' },
  // placeholder
  phWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 28 },
  phBadge: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phIcon: { width: 40, height: 40, opacity: 0.95 },
  phTitle: { fontFamily: fonts.groteskSemi, fontSize: 16, color: BLUE },
  phSub: { fontFamily: fonts.inter, fontSize: 13, color: colors.muted, textAlign: 'center' },
});
