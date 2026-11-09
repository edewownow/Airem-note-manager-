/**
 * VoiceLearning (2.0.0 build 97) — Settings → Learning: what MemoAirem has learned from you, on this
 * phone only (lib/learning.ts).
 *   - My words: "when I say PH I mean PhilHealth" — add, remove.
 *   - Lessons: sentences you corrected ("It was a question" / "Save it instead") — remove a wrong one.
 *   - What MemoAirem missed: questions with no answer + corrections — export (to send to the
 *     developer) or clear.
 * Nothing private is ever in these lists (learning.ts keepable()).
 */
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { Button } from '../common/Button';
import {
  clearMisses,
  forgetAllLearning,
  forgetLesson,
  forgetRecordHint,
  listLessons,
  listRecordHints,
  listMicWords,
  listMisses,
  listWords,
  missesReport,
  removeWord,
  setWord,
} from '../../lib/learning';
import { shareText } from '../../lib/share';
import { APP_VERSION } from '../../lib/version';

const SHOW = 15;

export function VoiceLearning() {
  const [, bump] = useState(0);
  const refresh = useCallback(() => bump((n) => n + 1), []);
  const [say, setSay] = useState('');
  const [mean, setMean] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [allMisses, setAllMisses] = useState(false);
  const words = listWords().filter((w) => w.via !== 'mic');
  const micWords = listMicWords();
  const lessons = listLessons();
  const misses = listMisses();
  const hints = listRecordHints();

  const add = () => {
    const e = setWord(say, mean);
    setErr(e);
    if (!e) {
      setSay('');
      setMean('');
      refresh();
    }
  };

  const exportMisses = async () => {
    const day = new Date().toISOString().slice(0, 10);
    await shareText(`memoairem-missed-${day}.txt`, missesReport(APP_VERSION), 'text/plain').catch(() => false);
  };

  return (
    <View style={styles.wrap}>
      {/* ---------- words fixed on the big mic ---------- */}
      <Text style={styles.head}>Fixed on the mic ({micWords.length})</Text>
      <Text style={styles.note}>
        Each word you corrected with Fix a word. Next time the mic hears the first word, it uses the second. Remove one with ✕.
      </Text>
      {micWords.length === 0 ? <Text style={styles.small}>None yet.</Text> : null}
      {micWords.map((w) => (
        <View key={w.say} style={styles.row}>
          <Text style={styles.rowText}>
            “{w.say}” → {w.mean}
          </Text>
          <Pressable
            onPress={() => {
              removeWord(w.say);
              refresh();
            }}
            hitSlop={8}
          >
            <Text style={styles.remove}>✕</Text>
          </Pressable>
        </View>
      ))}

      <View style={styles.divider} />
      <Text style={styles.head}>Records you pointed at ({hints.length})</Text>
      <Text style={styles.note}>A question that missed, and the record you said it meant. The next question with that shape opens it.</Text>
      {hints.length === 0 ? <Text style={styles.small}>None yet.</Text> : null}
      {hints.map((h) => (
        <View key={h.shape} style={styles.row}>
          <Text style={styles.rowText} numberOfLines={2}>{h.title}</Text>
          <Pressable onPress={() => { forgetRecordHint(h.shape); refresh(); }} hitSlop={8}>
            <Text style={styles.remove}>✕</Text>
          </Pressable>
        </View>
      ))}

      {/* ---------- my words ---------- */}
      <View style={styles.divider} />
      <Text style={styles.head}>My words</Text>
      <Text style={styles.note}>
        Words you teach by saying “when I say PH I mean PhilHealth”, or by typing them here.
      </Text>
      {words.map((w) => (
        <View key={w.say} style={styles.row}>
          <Text style={styles.rowText}>
            “{w.say}” → {w.mean}
          </Text>
          <Pressable
            onPress={() => {
              removeWord(w.say);
              refresh();
            }}
            hitSlop={8}
          >
            <Text style={styles.remove}>✕</Text>
          </Pressable>
        </View>
      ))}
      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={say}
          onChangeText={setSay}
          placeholder="When I say…"
          placeholderTextColor={colors.muted}
          autoCorrect={false}
        />
        <TextInput
          style={[styles.input, { flex: 1.3 }]}
          value={mean}
          onChangeText={setMean}
          placeholder="I mean…"
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          onSubmitEditing={add}
        />
      </View>
      {err ? <Text style={styles.err}>{err}</Text> : null}
      <Button small label="Add word" icon="plus" onPress={add} disabled={!say.trim() || !mean.trim()} />

      {/* ---------- lessons ---------- */}
      <View style={styles.divider} />
      <Text style={styles.head}>Learned from your corrections ({lessons.length})</Text>
      <Text style={styles.note}>
        When you tap “It was a question” or “Save it instead”, MemoAirem remembers that kind of sentence — next time it does
        the right thing at once. Remove one if it learned wrong.
      </Text>
      {lessons.slice(0, SHOW).map((l) => (
        <View key={l.shape} style={styles.row}>
          <Text style={styles.rowText} numberOfLines={2}>
            “{l.example}” → <Text style={styles.tag}>{l.intent === 'ask' ? 'answer' : 'save'}</Text>
            {l.n > 1 ? <Text style={styles.small}>  ×{l.n}</Text> : null}
          </Text>
          <Pressable
            onPress={() => {
              forgetLesson(l.shape);
              refresh();
            }}
            hitSlop={8}
          >
            <Text style={styles.remove}>✕</Text>
          </Pressable>
        </View>
      ))}
      {lessons.length > SHOW ? <Text style={styles.small}>…and {lessons.length - SHOW} more</Text> : null}

      {/* ---------- misses ---------- */}
      <View style={styles.divider} />
      <Text style={styles.head}>What MemoAirem missed ({misses.length})</Text>
      <Text style={styles.note}>
        Questions that found nothing, and every correction. Kept on this phone only — never anything private. Export it
        and send it to the developer so MemoAirem learns these for everyone.
      </Text>
      {(allMisses ? misses : misses.slice(0, 5)).map((m) => (
        <Text key={m.at + m.text} style={styles.miss} numberOfLines={2}>
          <Text style={styles.tag}>{m.kind === 'no-answer' ? 'no answer' : m.kind === 'was-question' ? 'was a question' : 'was a save'}</Text>
          {'  '}“{m.text}”
        </Text>
      ))}
      {misses.length > 5 ? (
        <Pressable onPress={() => setAllMisses((a) => !a)} hitSlop={6}>
          <Text style={styles.link}>{allMisses ? 'Show fewer' : `Show all ${misses.length}`}</Text>
        </Pressable>
      ) : null}
      <View style={styles.btnRow}>
        <Button small label="Export" icon="file" onPress={() => void exportMisses()} disabled={!misses.length && !lessons.length && !words.length} />
        <Button
          small
          variant="ghost"
          label="Clear list"
          disabled={!misses.length}
          onPress={() => {
            clearMisses();
            refresh();
          }}
        />
      </View>

      <View style={styles.divider} />
      <Pressable
        onPress={() =>
          Alert.alert('Forget everything learned?', 'Your words, lessons and the missed list are removed from this phone.', [
            { text: 'Keep', style: 'cancel' },
            {
              text: 'Forget',
              style: 'destructive',
              onPress: () => {
                forgetAllLearning();
                refresh();
              },
            },
          ])
        }
        hitSlop={6}
      >
        <Text style={styles.danger}>Forget everything learned</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  head: { fontFamily: fonts.groteskSemi, fontSize: 14, color: colors.ink },
  note: { fontFamily: fonts.inter, fontSize: 12, color: colors.muted, lineHeight: 17 },
  small: { fontFamily: fonts.inter, fontSize: 11.5, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowText: { flex: 1, fontFamily: fonts.inter, fontSize: 13, color: colors.ink },
  tag: { fontFamily: fonts.interSemi, color: colors.primaryInk },
  remove: { fontFamily: fonts.interSemi, fontSize: 14, color: colors.muted, paddingHorizontal: 4 },
  addRow: { flexDirection: 'row', gap: 8 },
  input: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.control,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontFamily: fonts.inter,
    fontSize: 13.5,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  err: { fontFamily: fonts.interSemi, fontSize: 12, color: colors.errInk },
  miss: { fontFamily: fonts.inter, fontSize: 12.5, color: colors.ink },
  link: { fontFamily: fonts.interSemi, fontSize: 12.5, color: colors.primary },
  btnRow: { flexDirection: 'row', gap: 8 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 6 },
  danger: { fontFamily: fonts.interSemi, fontSize: 12.5, color: colors.errInk },
});
