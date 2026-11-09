/**
 * Capture (top zone) — four one-tap inputs (Photo / File / Text / Voice).
 *
 * No scope: photos/files/voice go straight to the smart adaptive parser (which
 * auto-detects the content and extracts or describes into the unified record).
 * The Text tab is LOCAL fielded authoring — What / When / Where / Who / Notes
 * saved directly to the store, no Gemini, instantly queryable offline.
 *
 * Primary action is a single full-width button: "Parse" for photo/file/voice,
 * "Save" for the Text form. Minimal until a tab is tapped; folds after save or
 * when the ask bar takes focus (controlled by parent via `open`).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { colors, radius, shadow } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { Icon, type IconName } from '../common/Icon';
import { Button } from '../common/Button';
import { MicButton } from '../common/MicButton';
import { StatusLine } from '../common/StatusLine';
import { EventCard } from '../common/EventCard';
import { PendingReview } from './PendingReview';
import { CameraModal } from '../modals/CameraModal';
import { routeFile } from '../../lib/parse';
import { isNumberedList, parsePastedItems } from '../../lib/pastedText';
import { speak, sttErrorMessage } from '../../lib/speech';
import { parseVoiceCommand, type VoiceCommand } from '../../lib/command';
import { spokenConfirm } from '../../lib/voice';
import { parsePrivateSave, type PrivateDraft } from '../../lib/privateSearch';
import { parseWhen } from '../../lib/query';
import { MON, WD, parseISO, spokenTime } from '../../lib/datetime';
import { useApp, type TypedFields } from '../../state/AppContext';
import { useDictation } from '../../state/Dictation';
import type { Payload, Rec } from '../../types';

type Mode = 'photo' | 'file' | 'text' | 'voice';
const TABS: { mode: Mode; label: string; icon: IconName }[] = [
  { mode: 'photo', label: 'Photo', icon: 'camera' },
  { mode: 'file', label: 'File', icon: 'file' },
  { mode: 'text', label: 'Text', icon: 'text' },
  // 1.12.0-voice.14: no Voice tab — the one big mic under this card asks AND saves (Assistant.tsx).
  // The voice-mode code below is kept (unreachable) so it can come back by restoring this line:
  // { mode: 'voice', label: 'Voice', icon: 'mic' },
];

const EMPTY_FORM: TypedFields = { what: '', when: '', where: '', who: '', notes: '' };

/** Turn a saved record back into editable form fields (round-trips through parseWhen). */
const toFields = (r: Rec): TypedFields => ({
  what: r.title ?? '',
  when: r.date ? r.date + (r.time ? ' ' + r.time : '') : r.time ?? '', // time-only records keep their time on edit
  where: r.location ?? '',
  who: r.people ?? '',
  notes: r.notes ?? '',
});

/** The optional fields that can be added on demand (What is always present). */
type FieldKey = 'when' | 'where' | 'who' | 'notes';
const FIELD_ORDER: FieldKey[] = ['when', 'where', 'who', 'notes'];
type AutoCap = 'none' | 'sentences' | 'words';
const FIELD_DEFS: Record<
  FieldKey,
  { label: string; placeholder: string; autoCapitalize: AutoCap; autoCorrect: boolean; multiline?: boolean }
> = {
  when: { label: 'When', placeholder: 'e.g. tomorrow 9am, Jun 24', autoCapitalize: 'none', autoCorrect: false },
  where: { label: 'Where', placeholder: 'a place', autoCapitalize: 'words', autoCorrect: true },
  who: { label: 'Who', placeholder: 'names (comma or “and” separated)', autoCapitalize: 'words', autoCorrect: false },
  notes: { label: 'Note', placeholder: 'extra detail or tags', autoCapitalize: 'sentences', autoCorrect: true, multiline: true },
};

/** Which optional fields currently hold a value (used when editing a saved record). */
const fieldsWithValue = (f: TypedFields): FieldKey[] =>
  FIELD_ORDER.filter((k) => (f[k] ?? '').trim() !== '');

export function Capture({
  open,
  setOpen,
  onPhoto,
  onPrivateSave,
  flat,
}: {
  flat?: boolean; // 1.12.0-voice.15: drawn inside the main card with the big mic — no card of its own
  open: boolean;
  setOpen: (v: boolean) => void;
  onPhoto: (rec: Rec) => void;
  onPrivateSave: (draft: PrivateDraft) => void; // 1.10.2: a spoken password → the Private folder only
}) {
  const { state, actions } = useApp();
  const dictation = useDictation();
  const [mode, setMode] = useState<Mode>('photo');
  const [payload, setPayload] = useState<Payload | null>(null);
  const [transcript, setTranscript] = useState('');
  const [form, setForm] = useState<TypedFields>(EMPTY_FORM);
  const [added, setAdded] = useState<FieldKey[]>([]); // optional fields shown, in add order
  const [menuOpen, setMenuOpen] = useState(false); // the "+" field picker
  const [justSaved, setJustSaved] = useState<Rec | null>(null); // text-tab + voice confirmation
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [savingVoice, setSavingVoice] = useState(false); // voice decide-once in flight

  // Edit (variant experiment): an Edit tap on a record (answer card / saved
  // list) fills the Text form with that record and opens it. The request is
  // consumed once — the form owns the record from here (editingId).
  const editRequest = state.editRequest;
  useEffect(() => {
    if (!editRequest) return;
    const fill = () => {
      const fields = toFields(editRequest.rec);
      setForm(fields);
      setAdded(fieldsWithValue(fields));
      setPayload(null);
      setTranscript('');
      setMenuOpen(false);
      setJustSaved(null);
      setEditingId(editRequest.rec.id);
      setMode('text');
      setOpen(true);
      actions.clearEditRequest();
    };
    // An Edit tap must not silently wipe an unsaved note the user is typing
    // (or a picked photo/file). Ask first; "Keep my note" leaves the draft
    // alone and just consumes the request. form/payload/transcript are read
    // here on purpose, not effect deps — the question is asked once, when the
    // request arrives, not again if the draft changes under the dialog.
    const dirty =
      Object.values(form).some((v) => v.trim() !== '') || payload !== null || transcript.trim() !== '';
    if (!dirty) {
      fill();
      return;
    }
    Alert.alert(
      'Discard this note?',
      'You have an unsaved note in the Text form. Discard it and edit this record instead?',
      [
        { text: 'Keep my note', style: 'cancel', onPress: () => actions.clearEditRequest() },
        { text: 'Discard', style: 'destructive', onPress: fill },
      ],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest, actions, setOpen]);

  const reset = () => {
    setPayload(null);
    setTranscript('');
    setForm(EMPTY_FORM);
    setAdded([]);
    setMenuOpen(false);
    setJustSaved(null);
    setEditingId(null);
  };

  const pickTab = async (m: Mode) => {
    // voice.19: tapping the open tab again closes it — back to the mic
    if (open && mode === m) {
      setOpen(false);
      setEditingId(null);
      return;
    }
    setOpen(true);
    setMode(m);
    reset();
    if (m === 'photo') setCameraOpen(true);
  };

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    try {
      const result = await routeFile({ uri: a.uri, mimeType: a.mimeType, name: a.name, size: a.size });
      if (result.ok) {
        setPayload(result.payload);
        actions.clearStatus();
      } else {
        // rejected (office / unsupported / too large) — show message + log the decision
        setPayload(null);
        actions.setStatus('warn', result.message);
        actions.logFileRouting(result.detectedType, result.message);
      }
    } catch (e: any) {
      setPayload(null);
      actions.setStatus('err', 'Could not read the file: ' + (e?.message ?? 'unknown'));
    }
  };

  const pasteFile = async () => {
    let text = '';
    try {
      text = await Clipboard.getStringAsync();
    } catch {
      actions.setStatus('warn', 'Could not read what you copied.');
      return;
    }
    const clipped = text.replace(/\u00a0/g, ' ').trim();
    if (!clipped) {
      actions.setStatus('warn', 'Copy the text first, then tap Paste a file.');
      return;
    }
    setPayload({ kind: 'text', data: clipped, label: 'Pasted text' });
    actions.clearStatus();
  };

  const typeFile = () => {
    setPayload({ kind: 'text', data: '', label: 'Pasted text' });
    actions.clearStatus();
  };

  const savePastedFile = () => {
    if (!payload || payload.kind !== 'text') return;
    const items = parsePastedItems(payload.data).filter((item) => item.question.trim());
    if (!items.length) {
      actions.setStatus('warn', 'Nothing to save.');
      return;
    }
    setPayload(null);
    actions.setStatus('work', `Saving ${items.length}…`);
    setTimeout(() => actions.addPastedFacts(items), 0);
  };

  const pasted = payload?.kind === 'text' && payload.label === 'Pasted text';

  const pickFromLibrary = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.9 });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    if (a.base64) {
      setOpen(true);
      setMode('photo');
      setPayload({ kind: 'image', data: a.base64, mediaType: a.mimeType ?? 'image/jpeg', uri: a.uri, label: a.fileName ?? 'photo.jpg' });
    }
  };

  // Local-first voice (1.4.0): the mic just accumulates the transcript; the decide-once
  // parse+save happens on "Save" (saveVoiceNote), NOT by routing a payload to Gemini.
  // NEVER let an empty result overwrite captured text: in continuous mode the recognizer emits
  // a final EMPTY result as the session winds down (silence end / stop), which would otherwise
  // wipe the transcript + Save button a few seconds after the user finished speaking. The result
  // persists until the user taps Save or Clear — ending the listening session must not reset it.
  const onVoice = (t: string) => {
    if (t.trim()) setTranscript(t);
  };
  const onVoiceError = (code: string) => actions.setStatus('warn', sttErrorMessage(code));

  const saveVoiceNote = async () => {
    if (!transcript.trim() || savingVoice) return;
    // Stop the mic first (1.9.4): a still-listening recognizer can silence the read-back on some
    // phones (ColorOS), and could hear it and write it back into the transcript.
    // cancel(), not stop(): with the built-in listener a stop() would still deliver its words a
    // moment later — into a note that has already been saved.
    if (dictation.activeId === 'capture' || dictation.finishingId === 'capture') dictation.cancel();
    // A PASSWORD (1.10.2): "save this password …", or any note that says a password / PIN with a
    // value. It must NEVER take the normal path (Gemini, store, Harbor, capture log, read-back):
    // hand it to the Private folder's prompt — memory only until you unlock and tap Save there.
    const priv = parsePrivateSave(transcript);
    if (priv) {
      setTranscript('');
      onPrivateSave(priv);
      return;
    }
    setSavingVoice(true);
    const rec = await actions.saveVoiceNote(transcript);
    setSavingVoice(false);
    if (rec) {
      setJustSaved(rec); // same confirmation card the Text tab shows
      setTranscript('');
      // Read-back (1.9.0 commands only; 1.9.4 every voice save): say what was stored, so
      // hands-free capture is confirmed. Before 1.9.4 a plain voice note (no trigger phrase)
      // saved silently.
      // No trigger said → MemoAirem picked the label and says which ("I put a reminder for you to …").
      const picked = rec.via !== 'Voice command';
      if (state.speakOn) speak(spokenConfirm(rec, new Date(), picked), state.voiceId || undefined, state.online);
    }
  };

  const setField = (k: keyof TypedFields, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const addField = (k: FieldKey) => {
    setAdded((a) => (a.includes(k) ? a : [...a, k])); // never add the same field twice
    setMenuOpen(false);
  };
  const removeField = (k: FieldKey) => {
    setAdded((a) => a.filter((x) => x !== k));
    setField(k, ''); // drop its value so a removed field is never saved
  };

  const saveTyped = () => {
    const rec = actions.addTypedRecord(form, editingId);
    if (rec) {
      // Show what was stored (resolved date/time included); keep the zone open.
      setJustSaved(rec);
      setEditingId(null);
      setForm(EMPTY_FORM);
      setAdded([]);
      setMenuOpen(false);
    }
  };

  const editSaved = () => {
    if (!justSaved) return;
    const ff = toFields(justSaved);
    setForm(ff);
    setAdded(fieldsWithValue(ff)); // re-show only the fields that have values
    setEditingId(justSaved.id);
    setMode('text'); // edit always happens in the Text form (covers voice-saved records too)
    setJustSaved(null); // back to the form, pre-filled
  };

  const doneSaved = () => {
    reset();
    setOpen(false);
  };

  // "Clear / start fresh": drop the picked source, any pending review, and the
  // status line — so a failed or stale parse never lingers with no way out.
  const clearAll = () => {
    reset();
    actions.clearCapture();
  };

  const isText = mode === 'text';
  const isVoice = mode === 'voice';
  const isPrivate = isVoice && !!transcript && parsePrivateSave(transcript) !== null;
  // The saved-confirmation card is shared by Text and Voice (both save directly + show what stored).
  const showConfirm = (isText || isVoice) && !!justSaved;
  // Something to clear in photo/file/voice mode: a picked source, a pending review, a status
  // message, or (voice) a transcript not yet saved.
  const showClear =
    !isText && (!!payload || state.pending.length > 0 || !!state.status || (isVoice && !!transcript));

  return (
    <View style={flat ? styles.zoneFlat : styles.zone}>
      {/* tabs */}
      <View style={styles.tabs}>
        {TABS.map((t) => {
          const sel = open && mode === t.mode;
          return (
            <Pressable key={t.mode} style={[styles.tab, sel && styles.tabOn]} onPress={() => pickTab(t.mode)}>
              <Icon name={t.icon} size={16} color={sel ? colors.primary : colors.muted} />
              <Text style={[styles.tabLabel, sel && styles.tabLabelOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {open ? (
        <View style={styles.body}>
          {/* input area */}
          {mode === 'photo' || mode === 'file' ? (
            payload ? (
              <Preview
                payload={payload}
                onChangeText={
                  pasted ? (t) => setPayload({ kind: 'text', data: t, label: 'Pasted text' }) : undefined
                }
              />
            ) : mode === 'file' ? (
              <View style={styles.fileChoices}>
                <Pressable style={styles.fileChoice} onPress={() => void pickFile()}>
                  <View style={styles.dropIc}>
                    <Icon name="file" size={22} color={colors.primary} />
                  </View>
                  <Text style={styles.choiceTitle}>Choose a file</Text>
                </Pressable>
                <Pressable style={styles.fileChoice} onPress={() => void pasteFile()}>
                  <View style={styles.dropIc}>
                    <Icon name="file" size={22} color={colors.primary} />
                  </View>
                  <Text style={styles.choiceTitle}>Paste a file</Text>
                </Pressable>
                <Pressable style={styles.fileChoice} onPress={typeFile}>
                  <View style={styles.dropIc}>
                    <Icon name="text" size={22} color={colors.primary} />
                  </View>
                  <Text style={styles.choiceTitle}>Type</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.drop} onPress={() => setCameraOpen(true)}>
                <View style={styles.dropIc}>
                  <Icon name="camera" size={22} color={colors.primary} />
                </View>
                <Text style={styles.dropTitle}>Snap anything — a flyer, menu, card</Text>
                <Text style={styles.dropSub}>tap to capture</Text>
                <Pressable onPress={pickFromLibrary}>
                  <Text style={styles.dropAlt}>or choose from library</Text>
                </Pressable>
              </Pressable>
            )
          ) : null}

          {showConfirm ? (
            <View style={styles.confirm}>
              <View style={styles.confirmHead}>
                <Text style={styles.confirmTitle}>✓ Saved on device</Text>
                <Text style={styles.confirmSub}>Here’s what was stored — edit if anything’s off.</Text>
              </View>
              <EventCard rec={justSaved!} />
              <View style={styles.confirmBtns}>
                <Button label="Edit" variant="ghost" icon="text" onPress={editSaved} style={{ flex: 1 }} />
                <Button label="Done" variant="primary" icon="save" onPress={doneSaved} style={{ flex: 1 }} />
              </View>
            </View>
          ) : null}

          {isText && !justSaved ? (
            <View style={styles.form}>
              {/* What — always present, the only required field */}
              <TextInput
                style={[styles.fInput, styles.fTitle]}
                value={form.what}
                onChangeText={(t) => setField('what', t)}
                placeholder="What is it? (required)"
                placeholderTextColor={colors.muted}
                autoCapitalize="sentences"
              />

              {/* fields added on demand, in the order they were added */}
              {added.map((k) => {
                const def = FIELD_DEFS[k];
                return (
                  <View key={k} style={styles.fieldRow}>
                    <View style={styles.fieldMain}>
                      <Text style={styles.fieldLabel}>{def.label}</Text>
                      <TextInput
                        style={[styles.fInput, def.multiline && styles.fNotes]}
                        value={form[k]}
                        onChangeText={(t) => setField(k, t)}
                        placeholder={def.placeholder}
                        placeholderTextColor={colors.muted}
                        autoCapitalize={def.autoCapitalize}
                        autoCorrect={def.autoCorrect}
                        multiline={def.multiline}
                        textAlignVertical={def.multiline ? 'top' : 'center'}
                      />
                    </View>
                    <Pressable onPress={() => removeField(k)} hitSlop={8} style={styles.fieldX}>
                      <Icon name="x" size={14} color={colors.muted} />
                    </Pressable>
                  </View>
                );
              })}

              {/* the "+" field picker — only offers fields not already added */}
              {(() => {
                const remaining = FIELD_ORDER.filter((k) => !added.includes(k));
                if (!remaining.length) return null;
                return menuOpen ? (
                  <View style={styles.menu}>
                    {remaining.map((k) => (
                      <Pressable key={k} style={styles.menuItem} onPress={() => addField(k)}>
                        <Text style={styles.menuItemText}>{FIELD_DEFS[k].label}</Text>
                      </Pressable>
                    ))}
                    <Pressable style={styles.menuCancel} onPress={() => setMenuOpen(false)} hitSlop={6}>
                      <Text style={styles.menuCancelText}>cancel</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable style={styles.addBtn} onPress={() => setMenuOpen(true)}>
                    <Icon name="plus" size={14} color={colors.primary} />
                    <Text style={styles.addBtnText}>Add a detail</Text>
                  </Pressable>
                );
              })()}
            </View>
          ) : null}

          {isVoice && !justSaved ? (
            <View style={styles.voicebox}>
              <MicButton id="capture" big continuous onText={onVoice} onError={onVoiceError} />
              <Text style={styles.vhint}>Tap and speak — a note, an event, anything</Text>
              {!transcript ? (
                <Text style={styles.vtip}>Start with “set schedule…”, “remind me to…” or “note…”</Text>
              ) : null}
              {transcript && isPrivate ? (
                // a password was heard: don't show it here — it goes to the Private folder only
                <View style={styles.privHint}>
                  <Icon name="lock" size={16} color={colors.primary} />
                  <Text style={styles.privHintText}>
                    Sounds like a password or ID number — Save opens your 🔒 Private folder. It won’t go to Gemini or Harbor and
                    won’t be read aloud.
                  </Text>
                </View>
              ) : transcript ? (
                <Text style={styles.transcript}>{transcript}</Text>
              ) : null}
              {transcript && !isPrivate ? <CommandPreview cmd={parseVoiceCommand(transcript)} /> : null}
            </View>
          ) : null}

          {/* primary action — Save (local) for Text; Save (decide-once) for Voice; Parse
              (cloud) for photo/file. Hidden while the post-save confirmation is showing. */}
          {!showConfirm ? (
            <View style={styles.actions}>
              {isText ? (
                <Button
                  label="Save"
                  variant="primary"
                  icon="save"
                  disabled={!form.what.trim() && !form.notes.trim()}
                  onPress={saveTyped}
                  style={{ flex: 1 }}
                />
              ) : isVoice ? (
                <>
                  {showClear ? (
                    <Button label="Clear" variant="ghost" icon="x" onPress={clearAll} style={{ flex: 1 }} />
                  ) : null}
                  <Button
                    label={savingVoice ? 'Saving…' : isPrivate ? 'Save to Private' : 'Save'}
                    variant="primary"
                    icon="save"
                    disabled={!transcript.trim() || savingVoice}
                    onPress={saveVoiceNote}
                    style={{ flex: 1 }}
                  />
                </>
              ) : pasted ? (
                <>
                  <Button label="Clear" variant="ghost" icon="x" onPress={clearAll} small style={{ flex: 1 }} />
                  <Button
                    label="Parse"
                    variant="cloud"
                    icon="star"
                    small
                    onPress={() => {
                      if (!payload || payload.kind !== 'text') return;
                      if (!payload.data.trim()) {
                        actions.setStatus('warn', 'Type something first.');
                        return;
                      }
                      // A numbered list is one entry per number. Gemini is only for a paragraph.
                      if (isNumberedList(payload.data)) {
                        savePastedFile();
                        return;
                      }
                      actions.parseCapture(payload);
                    }}
                    style={{ flex: 1 }}
                  />
                  <Button label="Save file" variant="primary" icon="save" small onPress={savePastedFile} style={{ flex: 1 }} />
                </>
              ) : (
                <>
                  {showClear ? (
                    <Button label="Clear" variant="ghost" icon="x" onPress={clearAll} style={{ flex: 1 }} />
                  ) : null}
                  <Button
                    label="Parse"
                    variant="cloud"
                    icon="star"
                    disabled={!payload}
                    onPress={() => payload && actions.parseCapture(payload)}
                    style={{ flex: 1 }}
                  />
                </>
              )}
            </View>
          ) : null}

          <StatusLine status={state.status} />

          <PendingReview onPhoto={onPhoto} onSaved={() => { setOpen(false); reset(); }} />

          {/* voice.19 (device: "when I press photo, file or text I have no way to go back to voice").
              voice.23: the big mic stays visible below anyway — this just closes the panel. */}
          <Pressable onPress={() => { setOpen(false); setEditingId(null); }} hitSlop={8} style={styles.backVoice}>
            {/* a back arrow, not a mic — the user doesn't want a mic on the Text panel */}
            <Icon name="back" size={15} color={colors.primary} />
            <Text style={styles.backVoiceText}>Back to voice</Text>
          </Pressable>
        </View>
      ) : null}

      <CameraModal
        visible={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(p) => {
          setPayload(p);
          setCameraOpen(false);
        }}
        onPickInstead={() => {
          setCameraOpen(false);
          void pickFromLibrary();
        }}
      />
    </View>
  );
}

function Preview({ payload, onChangeText }: { payload: Payload; onChangeText?: (text: string) => void }) {
  if (payload.kind === 'image') {
    const uri = payload.uri ?? `data:${payload.mediaType};base64,${payload.data}`;
    return (
      <View style={styles.preview}>
        <Image source={{ uri }} style={styles.previewImg} resizeMode="contain" />
      </View>
    );
  }
  if (payload.kind === 'text') {
    return (
      <TextInput
        style={styles.pasteInput}
        value={payload.data}
        onChangeText={onChangeText}
        editable={!!onChangeText}
        multiline
        scrollEnabled
        textAlignVertical="top"
        placeholder="Type or edit the text"
        placeholderTextColor={colors.muted}
        autoCapitalize="sentences"
      />
    );
  }
  return (
    <View style={styles.fileRow}>
      <Icon name="file" size={18} color={colors.primary} />
      <Text style={styles.fileName}>{payload.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  privHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.deviceBg,
    borderRadius: radius.control,
    padding: 12,
    alignSelf: 'stretch',
  },
  privHintText: { flex: 1, fontFamily: fonts.inter, fontSize: 12.5, color: colors.primaryInk, lineHeight: 18 },
  zone: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 8,
    ...shadow,
  },
  zoneFlat: {},
  backVoice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginTop: 4 },
  backVoiceText: { fontFamily: fonts.interSemi, fontSize: 13.5, color: colors.primary },
  tabs: {
    flexDirection: 'row',
    gap: 3,
    padding: 5,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 11,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11, // voice.15: the three tabs share the top equally, a little taller
    borderRadius: 8,
  },
  tabOn: { backgroundColor: colors.surface },
  tabLabel: { fontFamily: fonts.interSemi, fontSize: 13, color: colors.muted },
  tabLabelOn: { color: colors.ink },
  body: { marginTop: 8, paddingHorizontal: 4, paddingBottom: 4 },
  drop: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderStyle: 'dashed',
    borderRadius: 12,
    backgroundColor: colors.surface2,
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  dropIc: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropTitle: { fontFamily: fonts.groteskSemi, fontSize: 15, color: colors.ink, textAlign: 'center' },
  dropSub: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted },
  dropAlt: { fontFamily: fonts.inter, fontSize: 12, color: colors.primary, marginTop: 4 },
  fileChoices: { flexDirection: 'row', gap: 10 },
  fileChoice: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderStyle: 'dashed',
    borderRadius: 12,
    backgroundColor: colors.surface2,
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    gap: 8,
  },
  choiceTitle: { fontFamily: fonts.groteskSemi, fontSize: 13, color: colors.ink, textAlign: 'center' },
  pasteInput: {
    minHeight: 160,
    maxHeight: 460,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.surface2,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.inter,
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
  },
  preview: { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.imageBg },
  previewImg: { width: '100%', height: 320 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 11,
    backgroundColor: colors.surface2,
    padding: 12,
  },
  fileName: { fontFamily: fonts.interSemi, fontSize: 14, color: colors.ink, flex: 1 },
  // text tab — fielded local authoring form
  form: { gap: 8 },
  fInput: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.control,
    paddingVertical: 10,
    paddingHorizontal: 13,
    fontFamily: fonts.inter,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.surface2,
  },
  fTitle: { fontFamily: fonts.interSemi },
  fNotes: { minHeight: 64 },
  // progressive added fields
  fieldRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  fieldMain: { flex: 1, minWidth: 0, gap: 3 },
  fieldLabel: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: colors.muted,
    marginLeft: 2,
  },
  fieldX: { paddingTop: 24, paddingHorizontal: 2 }, // align the × with the input, below the label
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 2,
  },
  addBtnText: { fontFamily: fonts.interSemi, fontSize: 12.5, color: colors.primary },
  menu: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7, rowGap: 7, marginTop: 2 },
  menuItem: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.deviceBg,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 13,
  },
  menuItemText: { fontFamily: fonts.interSemi, fontSize: 12.5, color: colors.primary },
  menuCancel: { paddingVertical: 6, paddingHorizontal: 6 },
  menuCancelText: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.muted },
  // text tab — post-save confirmation
  confirm: { gap: 4 },
  confirmHead: { gap: 2, marginBottom: 2 },
  confirmTitle: { fontFamily: fonts.groteskSemi, fontSize: 15, color: colors.primary },
  confirmSub: { fontFamily: fonts.inter, fontSize: 12, color: colors.muted },
  confirmBtns: { flexDirection: 'row', gap: 10, marginTop: 10 },
  voicebox: { minHeight: 170, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 10 },
  vhint: { fontFamily: fonts.inter, fontSize: 13, color: colors.muted },
  transcript: { fontFamily: fonts.inter, fontSize: 14, color: colors.ink, textAlign: 'center' },
  vtip: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted, textAlign: 'center' },
  // live voice-command preview (1.9.0)
  cmdBox: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.control,
    backgroundColor: colors.deviceBg,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
  },
  cmdHead: { fontFamily: fonts.interSemi, fontSize: 13, color: colors.primary, marginBottom: 2 },
  cmdRow: { flexDirection: 'row', gap: 8 },
  cmdKey: { width: 52, fontFamily: fonts.mono, fontSize: 11.5, color: colors.muted },
  cmdVal: { flex: 1, fontFamily: fonts.inter, fontSize: 13, color: colors.ink },
  cmdMissing: { flex: 1, fontFamily: fonts.inter, fontSize: 13, color: colors.muted, fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 13 },
});

/* ---------------- live voice-command preview (1.9.0) ---------------- */

const CMD_HEAD: Record<VoiceCommand['kind'], string> = {
  event: '📅 New event',
  reminder: '⏰ New reminder',
  note: '📝 New note',
};

/** "Mon Oct 26 · 3:00 PM" for the preview's When row (same reading parseWhen will store). */
function previewWhen(when: string): string | null {
  if (!when.trim()) return null;
  const { date, time } = parseWhen(when);
  if (!date && !time) return null;
  const day = date
    ? (() => {
        const d = parseISO(date);
        return `${WD[d.getDay()].slice(0, 3)} ${MON[d.getMonth()]} ${d.getDate()}`;
      })()
    : '';
  return [day, time ? spokenTime(time) : ''].filter(Boolean).join(' · ');
}

/** Shows what a recognised command will save, field by field, while the user is still talking. */
function CommandPreview({ cmd }: { cmd: VoiceCommand | null }) {
  if (!cmd) return null;
  const f = cmd.fields;
  const when = cmd.kind === 'note' ? null : previewWhen(f.when);
  const rows: { k: string; v: string | null; show: boolean }[] = [
    { k: 'What', v: f.what || null, show: true },
    { k: 'When', v: when, show: cmd.kind !== 'note' },
    { k: 'Where', v: f.where || null, show: !!f.where },
    { k: 'Who', v: f.who || null, show: !!f.who },
    { k: 'Notes', v: f.notes || null, show: !!f.notes },
  ];
  return (
    <View style={styles.cmdBox}>
      <Text style={styles.cmdHead}>{CMD_HEAD[cmd.kind]}</Text>
      {rows
        .filter((r) => r.show)
        .map((r) => (
          <View key={r.k} style={styles.cmdRow}>
            <Text style={styles.cmdKey}>{r.k}</Text>
            {r.v ? (
              <Text style={styles.cmdVal}>{r.v}</Text>
            ) : (
              <Text style={styles.cmdMissing}>{r.k === 'When' ? 'no date heard' : 'keep talking…'}</Text>
            )}
          </View>
        ))}
    </View>
  );
}
