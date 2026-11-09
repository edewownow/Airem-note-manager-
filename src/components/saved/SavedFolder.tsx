/**
 * SavedList — the on-device store as a browsable/manageable list (type filter +
 * editable EventCards with delete). Rendered inside the full-screen folder
 * (FolderScreen) reached from the bottom dock; it is NOT the answer surface.
 *
 * Dated records are grouped by DATE under an expandable header ("Tue Jun 30 — 5 events"),
 * collapsed by default, so a captured day (e.g. a schedule photo → N per-row events) stays
 * tidy. This is DISPLAY ONLY — records remain N separate, individually queryable items; the
 * group is by date so typed / voice / photo events on the same day collapse together. Within
 * a group, events are time-sorted (the list is pre-sorted by sortByWhen = date then time).
 * Undated records (notes, undated captures) render flat below the date groups, unchanged.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { Icon } from '../common/Icon';
import { Chip } from '../common/Chip';
import { EventCard } from '../common/EventCard';
import { CategoryPicker } from '../modals/CategoryPicker';
import { useApp } from '../../state/AppContext';
import { isPastEvent, sortByWhen } from '../../lib/query';
import { parseISO, WD, MON } from '../../lib/datetime';
import type { Rec } from '../../types';

/** "Tue Jun 30" for a date group header. */
function fmtDateHeader(isoDate: string): string {
  const d = parseISO(isoDate);
  return `${WD[d.getDay()].slice(0, 3)} ${MON[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

export function SavedList({ onPhoto, onEditRequest }: { onPhoto: (rec: Rec) => void; onEditRequest?: () => void }) {
  const { state, actions } = useApp();
  const [typeFilter, setTypeFilter] = useState('all');
  // Expanded date groups (session-only component state — no persistence). Collapsed by default.
  const [openDates, setOpenDates] = useState<Set<string>>(new Set());
  // Categories (variant experiment): the record being categorized.
  const [categorizing, setCategorizing] = useState<Rec | null>(null);
  const toggleDate = (d: string) =>
    setOpenDates((prev) => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });

  const saved = state.saved;
  const types = [...new Set(saved.map((e) => e.type || 'item'))].sort();
  const showFilter = saved.length >= 1 && types.length >= 2;
  const list = (typeFilter === 'all' ? saved : saved.filter((e) => (e.type || 'item') === typeFilter))
    .slice()
    .sort(sortByWhen); // date then time — groups come out date-ascending, time-ordered within

  // Group dated records by their date (preserving the sorted order); undated render flat below.
  const groups: { date: string; items: Rec[] }[] = [];
  const groupIdx = new Map<string, number>();
  const undated: Rec[] = [];
  for (const r of list) {
    if (!r.date) {
      undated.push(r);
      continue;
    }
    let i = groupIdx.get(r.date);
    if (i == null) {
      i = groups.length;
      groupIdx.set(r.date, i);
      groups.push({ date: r.date, items: [] });
    }
    groups[i].items.push(r);
  }

  const renderCard = (r: Rec) => (
    <EventCard
      key={r.id}
      rec={r}
      onRemove={actions.removeSaved}
      onPhoto={onPhoto}
      onEdit={(rec) => {
        actions.requestEdit(rec);
        onEditRequest?.(); // back to the main screen — the Text form opens with the record
      }}
      onCategorize={setCategorizing}
    />
  );

  if (saved.length === 0) {
    return (
      <View style={styles.empty}>
        <Icon name="calendar" size={28} color={colors.line} />
        <Text style={styles.emptyText}>Items you capture or add will live here.</Text>
      </View>
    );
  }

  return (
    <View style={styles.body}>
      {showFilter ? (
        <View style={styles.filter}>
          <Chip label={`all (${saved.length})`} active={typeFilter === 'all'} onPress={() => setTypeFilter('all')} />
          {types.map((t) => (
            <Chip
              key={t}
              label={`${t.replace(/_/g, ' ')} (${saved.filter((e) => (e.type || 'item') === t).length})`}
              active={typeFilter === t}
              onPress={() => setTypeFilter(t)}
            />
          ))}
        </View>
      ) : null}
      {categorizing ? <CategoryPicker rec={categorizing} onClose={() => setCategorizing(null)} /> : null}
      {list.length ? (
        <>
          {groups.map((g) => {
            const isOpen = openDates.has(g.date);
            const allPast = g.items.every((r) => isPastEvent(r)); // 1.9.1: the whole day is over
            return (
              <View key={g.date} style={styles.group}>
                <Pressable style={[styles.header, allPast && { opacity: 0.55 }]} onPress={() => toggleDate(g.date)}>
                  <View style={{ transform: [{ rotate: isOpen ? '0deg' : '-90deg' }] }}>
                    <Icon name="chevron" size={16} color={colors.muted} />
                  </View>
                  <Text style={styles.headerDate}>{fmtDateHeader(g.date)}</Text>
                  <Text style={styles.headerCount}>
                    {g.items.length} event{g.items.length === 1 ? '' : 's'}
                    {allPast ? ' · past' : ''}
                  </Text>
                </Pressable>
                {isOpen ? g.items.map(renderCard) : null}
              </View>
            );
          })}
          {undated.map(renderCard)}
        </>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No “{typeFilter.replace(/_/g, ' ')}” items.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 16 },
  filter: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingTop: 4, paddingBottom: 2 },
  group: { paddingBottom: 2 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerDate: { fontFamily: fonts.grotesk, fontSize: 14, color: colors.ink, flex: 1 },
  headerCount: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted },
  empty: { padding: 40, alignItems: 'center', gap: 10 },
  emptyText: { fontFamily: fonts.inter, fontSize: 13, color: colors.muted, textAlign: 'center' },
});
