/**
 * Open-source notices. Opened from About. No navigation library: About renders this
 * in its place and the back control returns there.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, StatusBar as RNStatusBar } from 'react-native';
import { colors } from '../theme/tokens';
import { fonts } from '../theme/typography';
import { Icon } from './common/Icon';
import { NOTICES } from '../lib/notices';

export function NoticesScreen({ onBack }: { onBack: () => void }) {
  return (
    <View style={[styles.screen, { paddingTop: RNStatusBar.currentHeight ?? 0 }]}>
      <View style={styles.head}>
        <Pressable style={styles.back} onPress={onBack} hitSlop={8} accessibilityLabel="Back to About">
          <Icon name="back" size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.headTitle}>Open-source notices</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          MemoAirem includes this open-source software. The licence and the copyright line travel with the app.
        </Text>
        {NOTICES.map((group) => (
          <View key={group.title}>
            <Text style={styles.group}>{group.title}</Text>
            {group.items.map((item) => (
              <View key={item.name} style={styles.item}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>{item.license}</Text>
                <Text style={styles.copy}>{item.copyright}</Text>
                {item.detail ? <Text style={styles.detail}>{item.detail}</Text> : null}
              </View>
            ))}
          </View>
        ))}
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
  headTitle: { fontFamily: fonts.groteskSemi, fontSize: 17, color: colors.ink },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 44 },
  intro: { fontFamily: fonts.inter, fontSize: 14, color: colors.ink, lineHeight: 21 },
  group: { fontFamily: fonts.groteskSemi, fontSize: 14, color: colors.ink, marginTop: 22, marginBottom: 8 },
  item: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line },
  name: { fontFamily: fonts.interSemi, fontSize: 13.5, color: colors.ink },
  meta: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.primary, marginTop: 2 },
  copy: { fontFamily: fonts.inter, fontSize: 12.5, color: colors.muted, lineHeight: 18, marginTop: 2 },
  detail: { fontFamily: fonts.inter, fontSize: 12.5, color: colors.muted, lineHeight: 18, marginTop: 2 },
});
