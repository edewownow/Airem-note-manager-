/**
 * PasswordHealth (2.0.0-autofill.8, phase 3) — in the open private folder: which saved passwords are
 * weak or used more than once (lib/passwordHealth.ts). Folded by default to one line; names logins and
 * reasons only — never shows or speaks a password. "Fix" opens that login's edit form (where
 * "Generate" makes a strong one); change it on the website too.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { passwordHealth, WEAK_TEXT } from '../../lib/passwordHealth';
import { isPrivateDoc, isPrivateNote } from '../../lib/vault';
import type { Rec } from '../../types';

export function PasswordHealth({ items, onFix }: { items: Rec[]; onFix: (r: Rec) => void }) {
  const [open, setOpen] = useState(false);
  const issues = useMemo(() => {
    const logins = items.filter((r) => !isPrivateDoc(r) && !isPrivateNote(r));
    return passwordHealth(logins.map((r) => ({ id: r.id, title: r.title ?? '', username: r.people ?? '', password: r.notes ?? '' })));
  }, [items]);
  if (!issues.length) return null;
  const weak = issues.filter((i) => i.weak).length;
  const reused = issues.filter((i) => i.reusedWith.length).length;
  const summary = [weak ? `${weak} weak` : '', reused ? `${reused} reused` : ''].filter(Boolean).join(' · ');
  const byId = new Map(items.map((r) => [r.id, r]));
  return (
    <View style={styles.box}>
      <Pressable onPress={() => setOpen((o) => !o)} hitSlop={6} style={styles.head}>
        <Text style={styles.title}>Password health</Text>
        <Text style={styles.summary}>
          {summary} {open ? '▴' : '▾'}
        </Text>
      </Pressable>
      {open ? (
        <>
          {issues.map((i) => (
            <View key={i.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{i.title}</Text>
                <Text style={styles.why}>
                  {[i.weak ? WEAK_TEXT[i.weak] : '', i.reusedWith.length ? `same as ${i.reusedWith.slice(0, 3).join(', ')}${i.reusedWith.length > 3 ? '…' : ''}` : '']
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              {byId.get(i.id) ? (
                <Pressable onPress={() => onFix(byId.get(i.id)!)} hitSlop={6}>
                  <Text style={styles.fix}>Fix</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
          <Text style={styles.hint}>Fix → Generate makes a strong one. Change it on the website or app too, then save it here.</Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.warnBg, borderRadius: radius.card, padding: 12, gap: 10, marginBottom: 10 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: fonts.groteskSemi, fontSize: 14, color: colors.warnInk },
  summary: { fontFamily: fonts.interSemi, fontSize: 12.5, color: colors.warnInk },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontFamily: fonts.interSemi, fontSize: 13, color: colors.ink },
  why: { fontFamily: fonts.inter, fontSize: 12, color: colors.muted, marginTop: 1 },
  fix: { fontFamily: fonts.interSemi, fontSize: 13, color: colors.primary },
  hint: { fontFamily: fonts.inter, fontSize: 11.5, color: colors.warnInk, lineHeight: 16 },
});
