/**
 * PrivateScreen (1.10.0) — the 🔒 Private folder, opened from the bottom dock. Full-screen
 * conditional render like FolderScreen (invariant 7, no nav lib).
 *
 * Everything private stays INSIDE this screen + lib/vault.ts. It never calls useApp() actions
 * that save, parse, log, sync or export — so a private item can't reach Harbor, Gemini, the
 * capture log, "Export saved", questions or spoken answers (they all read AppContext state).
 *
 *   - 1.13.0 (vault v3): opens LOCKED; the fingerprint (if on) or the MemoAirem PIN opens it — NOT the
 *     phone's PIN. "Forgot PIN?" → recovery key → new PIN. No folder yet → set up / restore a backup
 *     file; a 1.10–1.12 folder moves over after one phone-lock unlock (components/vault/VaultGate).
 *     The open folder has "Security & backup" (VaultSecurity). Showing / copying a password needs a
 *     fresh fingerprint or the MemoAirem PIN (PinPrompt).
 *   - Opens LOCKED and asks straight away (fingerprint, or the phone lock for an old folder).
 *   - Locks again when you leave the screen or the app goes to the background (except while the
 *     gallery picker — another app — is open for this screen).
 *   - Screenshots and the recent-apps preview are blocked while the screen is open.
 *   - Each item is a prompt of three (1.10.2): what it's for · username · password. The username is
 *     always visible; the password is masked while typing (Show/Hide) and hidden in the list.
 *   - 1.10.3: SHOWING a stored password needs a FRESH lock check every time (confirmReveal), and it
 *     hides again after 30 s. Search never auto-reveals.
 *   - 1.10.5: Copy password (fresh check; clipboard wiped after 30 s — lib/secureClipboard.ts),
 *     "Make one" (strong password made on the phone — lib/passwordGen.ts), and idle auto-lock
 *     after 1 minute with no touch or typing.
 *   - "save this password …" said on the Voice tab arrives as `initialDraft` and opens the prompt
 *     pre-filled after the unlock. It's in memory only — nothing is stored until Save.
 *   - Voice SEARCH (1.10.10): a mic on the search box — the ask bar's quick recognizer, labels
 *     (titles) only, titles spoken. A "background" event while it listens doesn't lock mid-search;
 *     it locks when the mic stops if the app is still in the background.
 *   - Note / ID items (1.10.12): what it is + the number / text, shown in full once unlocked (no
 *     second fingerprint), quick buttons TIN · SSS · PhilHealth · Pag-IBIG · Passport, Copy (wiped in
 *     30 s). "my SSS number is …" on the Voice tab opens this prompt pre-filled.
 *   - No mics in the prompt (removed 1.10.9 — they misbehaved on device): you type. To start by
 *     voice, say "save this password for …" on the Voice tab — the prompt opens pre-filled.
 *   - Add / edit: title, note, and a photo from the camera or the gallery. No voice capture
 *     (Android's voice typing sends audio to Google) and no Gemini.
 *   - DOCUMENTS (voice.28, the user's fields): Document name · No. · Date issued · Date expired · Place
 *     of issue · Notes (+ photo). Own "Documents" section, soonest expiry first; expired / within 6
 *     months shows a warning — INSIDE this folder only. Dates typed day first (5/3/2027), "March 5
 *     2027" or ISO, read by the app's date reader and shown back before saving; the year is required.
 *     "save my passport / seaman's book / SRB / visa …" opens this form pre-filled.
 *   - voice.31 ("let's make it tidy"): EVERY ID is a document (SSS, TIN … too). "Note / ID" became
 *     "Note" (free text: locker codes, Wi-Fi …; no ID buttons). A note card has "Make it a document":
 *     the same item turns into a document in place (photo kept; first line → No., rest → Notes).
 *   - Search (1.10.1): a search box, and "password search …" from the main ask bar (typed or
 *     spoken) — it arrives as `initialQuery`, runs right after the unlock, and looks ONLY in this
 *     folder. With 🔊 on, only the matching TITLES are spoken; a single match's note is shown.
 *     useApp() is used READ-ONLY here (speaker on/off + voice) — never to save, log or sync.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Image,
  AppState,
  type AppStateStatus,
  StatusBar as RNStatusBar,
} from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as ImagePicker from 'expo-image-picker';
import * as ScreenCapture from 'expo-screen-capture';
import { colors, radius } from '../theme/tokens';
import { fonts } from '../theme/typography';
import { Icon } from './common/Icon';
import { Button } from './common/Button';
import { CameraModal } from './modals/CameraModal';
import { Lightbox } from './modals/Lightbox';
import { useApp } from '../state/AppContext';
import { speak } from '../lib/speech';
import { MicButton } from './common/MicButton';
import { useDictation } from '../state/Dictation';
import { copySecret, CLEAR_MS } from '../lib/secureClipboard';
import { generatePassword } from '../lib/passwordGen';
import { matchPrivate, matchPrivateBest, spokenPrivate, draftHasSecret, docsForAsk, tagGroupOf } from '../lib/privateSearch';
import {
  QUICK_DOCS,
  spokenExpiry,
  expiryStatus,
  readDocDate,
  showDocDate,
  sortDocs,
  unpackDocNotes,
} from '../lib/privateDocs';
import {
  deleteVault,
  eraseRequest,
  listPrivate,
  lockVault,
  rememberDueDocs,
  preparePrivatePhoto,
  privatePhoto,
  removePrivate,
  savePrivate,
  confirmReveal,
  checkPin,
  vaultMode,
  isPrivateNote,
  isPrivateDoc,
  type PrivateKind,
  type PrivatePhoto,
} from '../lib/vault';
import type { Rec } from '../types';
import type { UnlockResult } from '../lib/vault';
import { heardByCloudRecently } from '../lib/speech';
import { VaultGate } from './vault/VaultGate';
import { VaultSecurity } from './vault/VaultSecurity';
import { PinPrompt } from './vault/PinPrompt';
import { PasswordHealth } from './vault/PasswordHealth';
import { EraseConfirm } from './vault/EraseConfirm';
import { shareImage } from '../lib/share';
import { parseListAll, privateListLabel, spokenPrivateList, type PrivateListKind } from '../lib/listCommands';
import { DOC_TAGS, docKind, readDocTag, suggestTag, tagLabel, type DocTag } from '../lib/privateDocs';
import { expandWords } from '../lib/learning';

/** 2.0.0: which kind an item is, for "list all …". IDs, visas, passports, and training certificates are documents of that kind. */
function ofKind(r: Rec, kind: PrivateListKind): boolean {
  if (kind === 'all') return true;
  if (kind === 'note') return isPrivateNote(r);
  if (kind === 'password') return !isPrivateDoc(r) && !isPrivateNote(r);
  if (!isPrivateDoc(r)) return false;
  if (kind === 'doc') return true;
  return docKind(r.title, r.notes) === kind;
}

const SCREEN_KEY = 'memoairem-private';
const PIN_AWAKE = 'private-pin';
/**
 * The pinned item survives a dimmed screen and leaving this screen, until Pin it is tapped
 * again, Lock, or the item is deleted. Not written to disk.
 */
let pinnedItem: { id: string; photo: boolean } | null = null;
/**
 * DIAGNOSTIC (1.10.8; on-screen list removed 1.10.9): why did the folder lock? Events (screen
 * opened #n, app background/active, unlock asked, locked: reason) go to the phone log as
 * "[private]" lines for `adb logcat`. No secrets — only events.
 */
let screenOpens = 0;
function note(ev: string): void {
  console.log('[private]', ev);
}

/** A revealed password hides itself again after this long. */
const REVEAL_MS = 30_000;
/** 1.10.5: the open folder locks itself after this long with no touch or typing. */
const IDLE_MS = 60_000;

/**
 * The prompt. Password (1.10.2): what it's for · username · password. Note / ID (1.10.12): what it
 * is · the number or text (shown in full once unlocked). Both take an optional photo.
 */
type Draft = {
  kind: PrivateKind;
  title: string;
  username: string;
  password: string;
  site: string; // 2.0.0-autofill.1: password items — website or app
  content: string;
  // voice.28 — document fields (dates as TYPED; read when saving)
  docNo: string;
  issued: string;
  expires: string;
  place: string;
  docNotes: string;
  tag: DocTag | null;
  photo: PrivatePhoto | null;
  removePhoto: boolean;
  editingId: string | null;
};
const EMPTY: Draft = {
  kind: 'password',
  title: '',
  username: '',
  password: '',
  site: '',
  content: '',
  docNo: '',
  issued: '',
  expires: '',
  place: '',
  docNotes: '',
  tag: null,
  photo: null,
  removePhoto: false,
  editingId: null,
};

/** What the Voice tab hands over (lib/privateSearch.ts parsePrivateSave): a password or an ID note. */
export type VoiceDraft = { kind: PrivateKind; title: string; username: string; password: string; content: string };

export function PrivateScreen({
  onBack,
  initialQuery = null,
  initialDraft = null,
  initialExpiry = null,
  initialList = null,
}: {
  initialList?: PrivateListKind | null; // 2.0.0: "list all passwords / IDs …" said on the main mic
  initialExpiry?: { all: boolean } | null; // voice.29: initialQuery is an EXPIRY question
  onBack: () => void;
  initialQuery?: string | null;
  initialDraft?: VoiceDraft | null; // a password said on the Voice tab — opens the prompt after unlock
}) {
  const { state } = useApp(); // read-only: 🔊 on/off + chosen voice
  const [search, setSearch] = useState('');
  // Several documents match one expiry question ("when is my visa expiring?"). Titles only, until one is tapped.
  const [choices, setChoices] = useState<Rec[]>([]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  // 2.0.0-autofill.8 (user: "screen cluttered"): items stay HIDDEN until asked for — a search (typed
  // or spoken, no extra check) shows the matches; "Show all" needs one press + fingerprint / PIN.
  const [showAll, setShowAll] = useState(false);
  // 2.0.0: "list all passwords / IDs / private notes" (said) → only that kind shows, to look at
  const [kindFilter, setKindFilter] = useState<PrivateListKind | null>(null);
  // 1.10.10: a search SPOKEN into the folder's search mic matches labels (titles) only.
  const [searchByVoice, setSearchByVoice] = useState(false);
  const dictation = useDictation();
  const voiceSearching = useRef(false); // the folder's search mic is listening
  voiceSearching.current = dictation.activeId === 'private-search';
  const lockDeferred = useRef(false); // a background event arrived while the search mic was on
  const stopMic = useRef(dictation.stop);
  stopMic.current = dictation.stop;
  const pendingQuery = useRef<string | null>(initialQuery);
  const pendingExpiry = useRef<{ all: boolean } | null>(initialExpiry);
  const pendingList = useRef<PrivateListKind | null>(initialList);
  // Held in memory only until the unlock — never written anywhere unless you tap Save.
  const pendingDraft = useRef<VoiceDraft | null>(initialDraft);
  const [showPass, setShowPass] = useState(false); // the prompt's password box: masked by default
  // 1.10.4: the prompt opens with the cursor in the first EMPTY box, keyboard up.
  const titleRef = useRef<TextInput>(null);
  const userRef = useRef<TextInput>(null);
  const passRef = useRef<TextInput>(null);
  const contentRef = useRef<TextInput>(null);
  const docNoRef = useRef<TextInput>(null);
  const issuedRef = useRef<TextInput>(null);
  const expiresRef = useRef<TextInput>(null);
  const placeRef = useRef<TextInput>(null);
  const docNotesRef = useRef<TextInput>(null);
  const listRef = useRef<ScrollView>(null);
  const [focusField, setFocusField] = useState<
    'title' | 'username' | 'password' | 'content' | 'docNo' | 'expires' | null
  >(null);
  const [unlocked, setUnlocked] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [keyLost, setKeyLost] = useState(false);
  const [items, setItems] = useState<Rec[]>([]);
  // Passwords revealed right now. Each reveal needs a FRESH lock check and hides itself again
  // after REVEAL_MS (1.10.3). Usernames are always visible.
  const [shown, setShown] = useState<Set<string>>(new Set());
  const hideTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [draft, setDraft] = useState<Draft | null>(null); // the add / edit form when open
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [viewing, setViewing] = useState<{ id: string; uri: string; full: boolean } | null>(null);
  const viewingRef = useRef<{ id: string; uri: string } | null>(null);
  // Pin keeps this item on screen, holds the screen awake, and skips the 1-minute lock.
  // Another item needs a fresh fingerprint or PIN.
  const [heldId, setHeldId] = useState<string | null>(null);
  const heldIdRef = useRef<string | null>(null);
  viewingRef.current = viewing;
  const stateRef = useRef(state);
  stateRef.current = state;
  const picking = useRef(false); // gallery picker open — don't lock for that background trip
  const lastActive = useRef(Date.now()); // idle auto-lock: last touch / typing
  const authing = useRef(false);
  const guard = useRef({ authing, picking }).current;
  const autoFirst = useRef(true); // ask for the fingerprint by itself only when the screen first opens
  const [gateKey, setGateKey] = useState(0); // a fresh locked screen after every lock
  const cloudHeard = useRef(initialDraft ? heardByCloudRecently() : false);
  // the MemoAirem PIN as a re-check (show / copy a password, change a lock)
  const [pinAsk, setPinAsk] = useState<string | null>(null);
  const setEraseModeRef = useRef<((m: 'open' | 'locked' | null) => void) | null>(null);
  const pinDone = useRef<((ok: boolean) => void) | null>(null);

  /** 2.0.0: show ONE kind (a "list all …" command) and say how many + their titles (never a secret). */
  const showKind = (kind: PrivateListKind, all: Rec[]) => {
    setSearch('');
    setChoices([]);
    setPickedId(null);
    setKindFilter(kind);
    const titles = all.filter((r) => ofKind(r, kind)).map((r) => r.title || 'Untitled');
    const line = spokenPrivateList(kind, titles);
    setMessage(line);
    if (stateRef.current.speakOn) speak(line, stateRef.current.voiceId || undefined, stateRef.current.online);
  };

  const lock = useCallback((reason: string) => {
    note(`locked: ${reason}`);
    if (voiceSearching.current) stopMic.current(); // never keep listening behind the locked screen
    lockVault();
    heldIdRef.current = null;
    setHeldId(null);
    setUnlocked(false);
    setItems([]);
    setShown(new Set());
    Object.values(hideTimers.current).forEach(clearTimeout);
    hideTimers.current = {};
    setDraft(null);
    setViewing(null);
    setCameraOpen(false);
    setSearch('');
    setChoices([]);
    setPickedId(null);
    setSearchByVoice(false);
    setShowAll(false);
    setKindFilter(null);
    setShowPass(false);
    setFocusField(null);
    setPinAsk(null); // a PIN re-check never stays over the locked screen
    setEraseModeRef.current?.(null);
    pinDone.current?.(false);
    pinDone.current = null;
    setGateKey((k) => k + 1);
  }, []);

  /** Put the pinned item back on screen. Only that item is shown. */
  const restorePin = (all: Rec[]): boolean => {
    const pin = pinnedItem;
    if (!pin) return false;
    const rec = all.find((r) => r.id === pin.id);
    if (!rec) {
      pinnedItem = null;
      return false;
    }
    heldIdRef.current = pin.id;
    setHeldId(pin.id);
    setPickedId(pin.id);
    setSearch('');
    setShowAll(false);
    setKindFilter(null);
    setChoices([]);
    setDraft(null);
    if (pin.photo) {
      const fullPhoto = privatePhoto(rec.imageId);
      const uri = fullPhoto ?? rec.thumb;
      if (uri) setViewing({ id: rec.id, uri, full: !!fullPhoto });
    }
    setMessage('Pinned. The screen stays on while this is in front, and this item is here when you come back.');
    return true;
  };

  /** The gate opened the folder (fingerprint, PIN, recovery key, setup or restore). */
  const afterOpen = useCallback((r: UnlockResult, gateNote?: string | null) => {
    if (r.ok) {
      note('unlocked');
      autoFirst.current = false;
      setKeyLost(false);
      const all = listPrivate();
      rememberDueDocs(all);
      setItems(all);
      setUnlocked(true);
      setMessage(
        r.tampered
          ? 'Warning: your private items were changed outside MemoAirem since the last time. Check them; if something looks wrong, restore your backup file.'
          : gateNote ?? null,
      );
      // A "password search …" from the ask bar: run it now, inside the unlocked folder only.
      const lk = pendingList.current;
      pendingList.current = null;
      if (lk) showKind(lk, all);
      const q = pendingQuery.current;
      pendingQuery.current = null;
      const exp = pendingExpiry.current;
      pendingExpiry.current = null;
      if (q !== null && exp) {
        // voice.29: "when does my passport expire?" — documents only; the TITLE and EXPIRY DATE are
        // said (the user's choice) and shown; never the number.
        const docs = all.filter(isPrivateDoc);
        const found = docsForAsk(docs, q, exp.all);
        // voice.30: not a document, but saved as a note (SSS, an older "Passport" note) — say so
        const asNote = !exp.all && !found.length ? matchPrivateBest(all.filter((r) => !isPrivateDoc(r)), q)[0] ?? null : null;
        const several = !exp.all && found.length > 1;
        setChoices(several ? sortDocs(found) : []);
        setPickedId(null);
        if (!exp.all && !several) {
          if (tagGroupOf(q) && found[0]) setPickedId(found[0].id);
          else if (!tagGroupOf(q)) setSearch(q);
        }
        const line = spokenExpiry(found, q, exp.all, new Date(), asNote);
        setMessage(line);
        if (stateRef.current.speakOn) speak(line, stateRef.current.voiceId || undefined, stateRef.current.online);
      } else if (q !== null) {
        setSearch(q);
        const found = matchPrivate(all, q);
        // (no auto-reveal: even the one you searched for needs a fresh check to show its password)
        if (stateRef.current.speakOn) speak(spokenPrivate(found, q), stateRef.current.voiceId || undefined, stateRef.current.online);
      }
      // A password said on the Voice tab: open the prompt pre-filled. Nothing is stored until Save.
      const d = pendingDraft.current;
      pendingDraft.current = null;
      if (d) {
        setShowPass(false);
        // 1.13.0 (user's choice: keep Google, warn): said on the main mic while online → Google heard it.
        // voice.37: only when a secret was SAID (a number, PIN or password) — not for a label alone.
        const cloud = cloudHeard.current && draftHasSecret(d)
          ? ' Note: you said this on the main mic while online, so Google’s speech service heard it. For secrets, type them here — or use “Phone only” listening (Settings).'
          : '';
        cloudHeard.current = false;
        if (d.kind === 'doc') {
          // voice.28: "save my passport (number P123…)" — the document form, number in No.
          setDraft({ ...EMPTY, kind: 'doc', title: d.title, docNo: d.content, tag: suggestTag(d.title) });
          setFocusField(!d.title.trim() ? 'title' : !d.content.trim() ? 'docNo' : 'expires');
          setMessage('From your voice — check the document, add the dates, then Save.' + cloud);
          return;
        }
        setDraft({ ...EMPTY, ...d });
        if (d.kind === 'note') {
          setFocusField(!d.title.trim() ? 'title' : !d.content.trim() ? 'content' : null);
          setMessage('From your voice — check what it is and the number, then Save.' + cloud);
        } else {
          setFocusField(!d.title.trim() ? 'title' : !d.username.trim() ? 'username' : !d.password.trim() ? 'password' : null);
          setMessage('From your voice — check what it’s for, the username and the password, then Save.' + cloud);
        }
        return;
      }
      if (!lk && q === null) restorePin(all);
    }
  }, []);

  // Block screenshots + the recent-apps preview while this screen exists; ask to unlock at once.
  useEffect(() => {
    screenOpens += 1;
    note(`screen opened #${screenOpens}`);
    void ScreenCapture.preventScreenCaptureAsync(SCREEN_KEY).catch(() => {});
    const timers = hideTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
      note('screen closed');
      if (voiceSearching.current) stopMic.current();
      lockVault(); // leaving the screen always locks
      void ScreenCapture.allowScreenCaptureAsync(SCREEN_KEY).catch(() => {});
    };
  }, []);

  // Lock when the app goes to the background (not for the gallery picker, the unlock prompt, or a pin).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      note(`app ${s}${authing.current ? ' (during fingerprint)' : ''}${picking.current ? ' (gallery)' : ''}`);
      if (s !== 'background' || picking.current || authing.current) return;
      if (heldIdRef.current || pinnedItem) {
        note('background while pinned — same item stays');
        return;
      }
      if (voiceSearching.current) {
        // Some phones report "background" when the recognizer starts. Don't lock mid-search; decide
        // when the mic stops (below): still in the background then → lock.
        lockDeferred.current = true;
        note('background during voice search — lock deferred');
        return;
      }
      lock('app went to background');
    });
    return () => sub.remove();
  }, [lock]);

  // The search mic stopped: if a background event came in while it listened and the app is STILL
  // not in front, lock now (a real switch to another app).
  useEffect(() => {
    if (dictation.activeId === 'private-search' || !lockDeferred.current) return;
    lockDeferred.current = false;
    // 2.0.0-autofill.8: the recognizer closing can report "background" a moment before "active"
    // comes back — look again after a short wait, so a voice search never locks the folder by itself.
    const t = setTimeout(() => {
      if (heldIdRef.current || pinnedItem) note('voice search ended while pinned — stays open');
      else if (AppState.currentState !== 'active') lock('app went to background (after voice search)');
      else note('voice search ended in front — stays open');
    }, 1500);
    return () => clearTimeout(t);
  }, [dictation.activeId, lock]);

  // Idle auto-lock (1.10.5): unlocked, and nobody touched or typed for IDLE_MS → lock — even with
  // the screen still on. Not while a fingerprint check, the camera or the gallery is open.
  const poke = () => {
    lastActive.current = Date.now();
  };
  useEffect(() => {
    if (!unlocked) return;
    poke();
    const t = setInterval(() => {
      if (heldIdRef.current) return;
      if (authing.current || picking.current || cameraOpen || voiceSearching.current) return poke();
      if (Date.now() - lastActive.current >= IDLE_MS) {
        lock('1 min idle');
        setMessage('Locked after 1 minute without use.');
      }
    }, 5_000);
    return () => clearInterval(t);
  }, [unlocked, cameraOpen, lock]);
  // A pin holds the screen on while this app is in front. A dimmed screen can sleep; the pin stays.
  useEffect(() => {
    if (!unlocked || !heldId) return;
    let awake = false;
    const sync = (s: AppStateStatus) => {
      const want = s === 'active';
      if (want === awake) return;
      awake = want;
      if (want) void activateKeepAwakeAsync(PIN_AWAKE);
      else void deactivateKeepAwake(PIN_AWAKE);
    };
    sync(AppState.currentState);
    const sub = AppState.addEventListener('change', sync);
    return () => {
      sub.remove();
      if (awake) void deactivateKeepAwake(PIN_AWAKE);
    };
  }, [unlocked, heldId]);
  // typing in the prompt or the search box counts as use
  useEffect(poke, [draft, search]);

  const refresh = () => {
    const all = listPrivate();
    rememberDueDocs(all);
    setItems(all);
  };

  /* ---------- add / edit ---------- */

  const startAdd = (kind: PrivateKind) => {
    setShowPass(false);
    setDraft({ ...EMPTY, kind });
    setFocusField('title');
  };

  /**
   * voice.31: "Make it a document" — an older note (e.g. "Passport", "SSS") opens the DOCUMENT form,
   * pre-filled; Save turns the SAME item into a document (same id, photo kept). First line → No.,
   * the rest → Notes. Nothing changes until Save.
   */
  const startConvert = (r: Rec) => {
    setShowPass(false);
    const lines = (r.notes ?? '').split(/\r?\n/);
    setDraft({
      ...EMPTY,
      kind: 'doc',
      title: r.title ?? '',
      docNo: (lines[0] ?? '').trim(),
      docNotes: lines.slice(1).join('\n').trim(),
      tag: suggestTag(r.title ?? ''),
      editingId: r.id,
    });
    setFocusField('expires');
    setMessage('Making it a document — check the No., add the dates, then Save.');
  };

  // The form sits at the top. Opening it must land there — the list used to stay on the card.
  const formOpen = draft ? `${draft.kind}:${draft.editingId ?? 'new'}` : '';
  useEffect(() => {
    if (!formOpen) return;
    const go = () => listRef.current?.scrollTo({ y: 0, animated: false });
    const frame = requestAnimationFrame(go);
    const later = setTimeout(go, 80);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(later);
    };
  }, [formOpen]);

  // Put the cursor in the chosen box once the prompt has rendered (keyboard comes up with it).
  useEffect(() => {
    if (!focusField || !draft) return;
    const ref =
      focusField === 'title'
        ? titleRef
        : focusField === 'username'
          ? userRef
          : focusField === 'content'
            ? contentRef
            : focusField === 'docNo'
              ? docNoRef
              : focusField === 'expires'
                ? expiresRef
                : passRef;
    const t = setTimeout(() => {
      ref.current?.focus();
      setFocusField(null);
    }, 250);
    return () => clearTimeout(t);
  }, [focusField, draft]);
  const startEdit = (r: Rec) => {
    setShowPass(false);
    if (isPrivateDoc(r)) {
      const u = unpackDocNotes(r.notes);
      setDraft({
        ...EMPTY,
        kind: 'doc',
        title: r.title ?? '',
        docNo: r.people ?? '',
        issued: u.issued ? showDocDate(u.issued) : '',
        expires: r.date ? showDocDate(r.date) : '',
        place: r.location ?? '',
        docNotes: u.notes,
        tag: u.tag === undefined ? suggestTag(r.title ?? '') : u.tag,
        editingId: r.id,
      });
      return;
    }
    const note = isPrivateNote(r);
    setDraft({
      ...EMPTY,
      kind: note ? 'note' : 'password',
      title: r.title ?? '',
      username: note ? '' : r.people ?? '',
      site: note ? '' : r.location ?? '',
      password: note ? '' : r.notes ?? '',
      content: note ? r.notes ?? '' : '',
      photo: null,
      removePhoto: false,
      editingId: r.id,
    });
  };



  const takePhoto = async (uri: string | undefined) => {
    setCameraOpen(false);
    if (!uri) return;
    setPhotoBusy(true);
    const p = await preparePrivatePhoto(uri);
    setPhotoBusy(false);
    if (p) setDraft((d) => (d ? { ...d, photo: p, removePhoto: false } : d));
    else Alert.alert('Photo not added', 'That photo could not be read. Try again.');
  };

  const pickPhoto = async () => {
    setCameraOpen(false);
    picking.current = true;
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (!res.canceled && res.assets?.length) await takePhoto(res.assets[0].uri);
    } finally {
      picking.current = false;
    }
  };

  const save = () => {
    if (!draft) return;
    // voice.28: a document's dates must be real dates with a year
    let issued: string | null = null;
    let expires: string | null = null;
    if (draft.kind === 'doc') {
      issued = readDocDate(draft.issued);
      expires = readDocDate(draft.expires);
      const bad = draft.issued.trim() && !issued ? 'Date issued' : draft.expires.trim() && !expires ? 'Date expired' : null;
      if (bad) {
        Alert.alert(`${bad} isn’t a date`, 'Type it with the year, day first — e.g. 5/3/2027, 5 March 2027 or 2027-03-05.');
        return;
      }
    }
    const rec = savePrivate(
      {
        kind: draft.kind,
        title: draft.title,
        username: draft.username,
        site: draft.site,
        password: draft.password,
        content: draft.content,
        doc:
          draft.kind === 'doc'
            ? { no: draft.docNo, issued, expires, place: draft.place, notes: draft.docNotes, tag: draft.tag }
            : undefined,
        photo: draft.photo,
        removePhoto: draft.removePhoto,
      },
      draft.editingId,
    );
    if (!rec) {
      Alert.alert(
        'Nothing to save',
        draft.kind === 'doc'
          ? 'Fill in the document name, its number, a date or add a photo.'
          : draft.kind === 'note'
            ? 'Fill in what it is, the number or add a photo.'
            : 'Fill in what it’s for, the username, the password or add a photo.',
      );
      return;
    }
    setDraft(null);
    setShowPass(false);
    setMessage(null);
    refresh();
  };

  const confirmRemove = (r: Rec) =>
    Alert.alert('Delete this private item?', `“${r.title}” and its photo will be deleted from this phone. This can’t be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          removePrivate(r.id);
          if (pinnedItem?.id === r.id || heldIdRef.current === r.id) {
            pinnedItem = null;
            heldIdRef.current = null;
            setHeldId(null);
            setPickedId(null);
            setViewing(null);
          }
          refresh();
        },
      },
    ]);

  /**
   * 2.0.0-autofill.9: deleting the folder — never by two quick taps. Open: fresh fingerprint / PIN,
   * then type DELETE. Locked: type DELETE to start a 24-hour wait (EraseConfirm).
   */
  const [eraseMode, setEraseMode] = useState<'open' | 'locked' | null>(null);
  const confirmDeleteAll = async () => {
    if (!unlocked) return setEraseMode('locked');
    const ok = await reauth('Delete the private folder');
    if (ok) setEraseMode('open');
  };
  setEraseModeRef.current = setEraseMode;
  const doErase = async () => {
    pinnedItem = null;
    await deleteVault();
    setEraseMode(null);
    lock('folder erased');
    setKeyLost(false);
    setMessage('Private folder erased. Set up a new one, or restore a backup file.');
  };

  const hide = (id: string) => {
    clearTimeout(hideTimers.current[id]);
    delete hideTimers.current[id];
    setShown((cur) => {
      const n = new Set(cur);
      n.delete(id);
      return n;
    });
  };

  /**
   * 1.13.0: a fresh check — the fingerprint (strong, when on) or the MemoAirem PIN. Never the
   * phone's own PIN for a v3 folder.
   */
  const reauth = useCallback(async (why: string): Promise<boolean> => {
    authing.current = true;
    const r = await confirmReveal();
    authing.current = false;
    if (r === 'ok') return true;
    if (r === 'cancel') return false;
    return new Promise<boolean>((resolve) => {
      pinDone.current = resolve;
      setPinAsk(why);
    });
  }, []);

  /** While an item is held, a different item (or leaving) needs a fresh fingerprint or PIN. */
  const allow = useCallback(async (id: string | null, why = 'Open another item'): Promise<boolean> => {
    const held = heldIdRef.current;
    if (!held || held === id) return true;
    const ok = await reauth(why);
    if (ok && id !== null) {
      heldIdRef.current = null;
      setHeldId(null);
      pinnedItem = null;
    }
    return ok;
  }, [reauth]);

  const holdItem = useCallback(async (id: string) => {
    if (heldIdRef.current && heldIdRef.current !== id) {
      const ok = await reauth('Open another item');
      if (!ok) return;
    }
    if (heldIdRef.current === id) {
      const ok = await reauth('Leave this item');
      if (!ok) return;
      heldIdRef.current = null;
      setHeldId(null);
      pinnedItem = null;
      setPickedId(null);
      setMessage(null);
      return;
    }
    const photo = viewingRef.current?.id === id;
    pinnedItem = { id, photo };
    heldIdRef.current = id;
    setHeldId(id);
    setPickedId(id);
    setSearch('');
    setKindFilter(null);
    setShowAll(false);
    setChoices([]);
    setMessage('Pinned. The screen stays on while this is in front, and this item is here when you come back. Opening another item needs your fingerprint or PIN.');
  }, [reauth]);

  const openPhoto = async (r: Rec) => {
    if (!(await allow(r.id))) return;
    // Show the small picture at once, then check and load the full one. Checking a multi-MB photo
    // takes a moment, and a tap that shows nothing in that time feels dead.
    if (r.thumb) setViewing({ id: r.id, uri: r.thumb, full: false });
    await new Promise<void>((done) => setTimeout(done, 30));
    const t0 = Date.now();
    const full = privatePhoto(r.imageId);
    note(`photo opened: ${full ? `full ${Math.round(full.length / 1024)} KB, checked in ${Date.now() - t0} ms` : r.thumb ? 'thumbnail only' : 'none'}`);
    const uri = full ?? r.thumb;
    if (!uri) return;
    setViewing({ id: r.id, uri, full: !!full });
    if (pinnedItem?.id === r.id) pinnedItem = { id: r.id, photo: true };
  };

  const closePhoto = async () => {
    if (viewing && heldIdRef.current === viewing.id) {
      const ok = await reauth('Leave this item');
      if (!ok) return;
      heldIdRef.current = null;
      setHeldId(null);
      pinnedItem = null;
      setPickedId(null);
    }
    setViewing(null);
  };

  /** Show a password only after a fresh fingerprint / PIN; hide on tap or after REVEAL_MS. */
  const toggleShown = async (id: string) => {
    if (shown.has(id)) {
      hide(id);
      return;
    }
    const ok = await reauth('Show password');
    if (!ok) return;
    setShown((cur) => new Set(cur).add(id));
    clearTimeout(hideTimers.current[id]);
    hideTimers.current[id] = setTimeout(() => hide(id), REVEAL_MS);
  };

  /** Copy a password for another app: fresh fingerprint first; the clipboard wipes in 30 s. */
  const copyPassword = async (r: Rec) => {
    if (!r.notes) return;
    const ok = await reauth('Copy password');
    if (!ok) return;
    const done = await copySecret(r.notes);
    setMessage(
      done
        ? `Password for ${r.title} copied — the clipboard clears in ${CLEAR_MS / 1000} seconds.`
        : 'Couldn’t copy the password. Try again.',
    );
  };

  /** Copy a note's number / text (it's already on screen, so no extra fingerprint); wiped in 30 s. */
  const copyNote = async (r: Rec) => {
    if (!r.notes) return;
    const done = await copySecret(r.notes);
    setMessage(
      done ? `${r.title} copied — the clipboard clears in ${CLEAR_MS / 1000} seconds.` : 'Couldn’t copy it. Try again.',
    );
  };

  /** voice.28: copy a document's number (already on screen) — clipboard wiped in 30 s. */
  const copyDocNo = async (r: Rec) => {
    if (!r.people) return;
    const done = await copySecret(r.people);
    setMessage(
      done ? `${r.title} number copied — the clipboard clears in ${CLEAR_MS / 1000} seconds.` : 'Couldn’t copy it. Try again.',
    );
  };

  /** "Make one": a strong password made on the phone, shown so you can see what was made. */
  const makePassword = () => {
    if (!draft) return;
    setDraft({ ...draft, password: generatePassword(16) });
    setShowPass(true);
  };

  /** The prompt's Show: a STORED password (editing) needs a fresh check; one you're typing doesn't. */
  const toggleShowPass = async () => {
    if (showPass) {
      setShowPass(false);
      return;
    }
    if (draft?.editingId) {
      const ok = await reauth('Show password');
      if (!ok) return;
    }
    setShowPass(true);
  };

  /* ---------- render ---------- */

  const visible = pickedId
    ? items.filter((r) => r.id === pickedId)
    : search.trim()
    ? matchPrivate(items, search, { titleOnly: searchByVoice })
    : kindFilter
      ? items.filter((r) => ofKind(r, kindFilter))
      : showAll
        ? items
        : [];
  const hiddenCounts = {
    passwords: items.filter((r) => !isPrivateDoc(r) && !isPrivateNote(r)).length,
    notes: items.filter(isPrivateNote).length,
    docs: items.filter(isPrivateDoc).length,
  };
  /** One press + a fresh fingerprint / PIN shows everything (hidden again on lock). */
  const revealAll = async () => {
    const ok = await reauth('Show all items');
    if (ok) setShowAll(true);
  };
  // voice.28: documents get their own section, soonest expiry first
  const visibleDocs = sortDocs(visible.filter(isPrivateDoc));
  const visibleOther = visible.filter((r) => !isPrivateDoc(r));
  const needAttention = items.filter((r) => {
    const st = isPrivateDoc(r) ? expiryStatus(r.date) : null;
    return st && st.level !== 'ok';
  }).length;

  /** Spoken search: fill the box, match labels only, and say the titles found (🔊 on). */
  const onVoiceSearch = (said: string, final: boolean) => {
    const t = expandWords(said); // build 97: your own words ("PH" → "PhilHealth")
    // 2.0.0: "list all passwords / IDs / private notes" → that kind, not a search for those words
    const l = parseListAll(t);
    if (l && l.where === 'private') {
      setSearch('');
      if (final) showKind(l.kind, items);
      else setKindFilter(l.kind);
      return;
    }
    setSearchByVoice(true);
    setSearch(t);
    if (final && t.trim() && stateRef.current.speakOn) {
      speak(
        spokenPrivate(matchPrivate(items, t, { titleOnly: true }), t.trim()),
        stateRef.current.voiceId || undefined,
        stateRef.current.online,
      );
    }
  };
  const existingThumb = draft?.editingId ? items.find((r) => r.id === draft.editingId)?.thumb ?? null : null;
  const draftThumb = draft?.photo?.thumb ?? (draft?.removePhoto ? null : existingThumb);

  return (
    <View style={[styles.screen, { paddingTop: RNStatusBar.currentHeight ?? 0 }]} onTouchStart={poke}>
      <View style={styles.head}>
        <Pressable style={styles.back} onPress={() => void (async () => { if (await allow(null, 'Leave this item')) onBack(); })()} hitSlop={8}>
          <Icon name="back" size={20} color={colors.ink} />
        </Pressable>
        <Icon name="lock" size={17} color={colors.primary} />
        <Text style={styles.title}>Private</Text>
        {unlocked ? (
          <Text style={styles.count}>
            {items.length} item{items.length === 1 ? '' : 's'}
          </Text>
        ) : null}
        {unlocked ? (
          <Pressable onPress={() => { pinnedItem = null; lock('Lock tapped'); }} hitSlop={6} style={styles.lockBtn}>
            <Icon name="lock" size={13} color={colors.ink} />
            <Text style={styles.lockTxt}>Lock</Text>
          </Pressable>
        ) : null}
      </View>

      {!unlocked ? (
        <ScrollView contentContainerStyle={styles.locked} keyboardShouldPersistTaps="handled">
          {message ? <Text style={styles.msg}>{message}</Text> : null}
          {pendingDraft.current ? <Text style={styles.msg}>It is NOT saved yet — unlock to finish saving it.</Text> : null}
          <VaultGate
            key={gateKey}
            autoStart={autoFirst.current}
            guard={guard}
            onOpened={afterOpen}
            onKeyLost={() => setKeyLost(true)}
          />
          <Text style={styles.lockedSub}>
            Encrypted on this phone only. Never synced to Harbor, never sent to Gemini; passwords and notes are never read aloud.
          </Text>
          {keyLost || vaultMode() === 'v3' ? (
            <Pressable onPress={() => void confirmDeleteAll()} hitSlop={6} style={{ alignSelf: 'center', marginTop: 10 }}>
              <Text style={styles.dangerLink}>{eraseRequest() ? 'Erase requested — see when / cancel' : keyLost ? 'Delete it and start a new one' : 'Lost your PIN and recovery key? Delete the folder'}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      ) : (
        <ScrollView ref={listRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {message ? <Text style={styles.msg}>{message}</Text> : null}
          {choices.length ? (
            <View style={styles.pickList}>
              {choices.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => {
                    setChoices([]);
                    setPickedId(r.id);
                    setSearch('');
                    const line = spokenExpiry([r], r.title, false);
                    setMessage(line);
                    if (stateRef.current.speakOn) speak(line, stateRef.current.voiceId || undefined, stateRef.current.online);
                  }}
                  style={styles.pickRow}
                >
                  <Text style={styles.pickText} numberOfLines={1}>{r.title}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {draft ? (
            <View style={styles.form}>
              <Text style={styles.formHead}>
                {draft.kind === 'doc'
                  ? draft.editingId
                    ? 'Edit document'
                    : 'New document'
                  : draft.kind === 'note'
                  ? draft.editingId
                    ? 'Edit note'
                    : 'New note'
                  : draft.editingId
                    ? 'Edit password'
                    : 'New password'}
              </Text>

              {draft.kind === 'doc' ? (
                <>
                  {!draft.editingId ? (
                    <View style={styles.quickRow}>
                      {[...QUICK_DOCS, 'Other'].map((t) => (
                        <Pressable
                          key={t}
                          onPress={() => {
                            if (t === 'Other') {
                              setDraft({ ...draft, tag: null });
                              setFocusField('title');
                            } else {
                              setDraft({ ...draft, title: t, tag: suggestTag(t) });
                              setFocusField('docNo');
                            }
                          }}
                          style={[styles.quick, draft.title === t && styles.quickOn]}
                          hitSlop={4}
                        >
                          <Text style={[styles.quickTxt, draft.title === t && styles.quickTxtOn]}>{t}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  <Text style={styles.fieldLabel}>Document name</Text>
                  <TextInput
                    ref={titleRef}
                    returnKeyType="next"
                    onSubmitEditing={() => docNoRef.current?.focus()}
                    style={[styles.input, styles.inputTitle]}
                    value={draft.title}
                    onChangeText={(t) => setDraft({ ...draft, title: t })}
                    placeholder="e.g. Passport, Seaman's book, US visa"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="sentences"
                    autoCorrect={false}
                    autoComplete="off"
                    importantForAutofill="no"
                  />
                  <Text style={styles.fieldLabel}>Tag</Text>
                  <View style={styles.quickRow}>
                    {DOC_TAGS.map((t) => (
                      <Pressable
                        key={t.id}
                        onPress={() => setDraft({ ...draft, tag: draft.tag === t.id ? null : t.id })}
                        style={[styles.quick, draft.tag === t.id && styles.quickOn]}
                        hitSlop={4}
                      >
                        <Text style={[styles.quickTxt, draft.tag === t.id && styles.quickTxtOn]}>{t.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.tagHint}>
                    {draft.tag ? 'Tap the tag again to clear it.' : 'No tag — this document stays by itself.'}
                  </Text>
                  <Text style={styles.fieldLabel}>No.</Text>
                  <TextInput
                    ref={docNoRef}
                    returnKeyType="next"
                    onSubmitEditing={() => issuedRef.current?.focus()}
                    style={[styles.input, styles.inputMono]}
                    value={draft.docNo}
                    onChangeText={(t) => setDraft({ ...draft, docNo: t })}
                    placeholder="document number"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    autoComplete="off"
                    importantForAutofill="no"
                    spellCheck={false}
                  />
                  <View style={styles.row}>
                    <View style={{ flex: 1, gap: 6 }}>
                      <Text style={styles.fieldLabel}>Date issued</Text>
                      <TextInput
                        ref={issuedRef}
                        returnKeyType="next"
                        onSubmitEditing={() => expiresRef.current?.focus()}
                        style={styles.input}
                        value={draft.issued}
                        onChangeText={(t) => setDraft({ ...draft, issued: t })}
                        placeholder="5/3/2022"
                        placeholderTextColor={colors.muted}
                        autoCorrect={false}
                        autoComplete="off"
                        importantForAutofill="no"
                      />
                      <DateEcho text={draft.issued} />
                    </View>
                    <View style={{ flex: 1, gap: 6 }}>
                      <Text style={styles.fieldLabel}>Date expired</Text>
                      <TextInput
                        ref={expiresRef}
                        returnKeyType="next"
                        onSubmitEditing={() => placeRef.current?.focus()}
                        style={styles.input}
                        value={draft.expires}
                        onChangeText={(t) => setDraft({ ...draft, expires: t })}
                        placeholder="5/3/2032"
                        placeholderTextColor={colors.muted}
                        autoCorrect={false}
                        autoComplete="off"
                        importantForAutofill="no"
                      />
                      <DateEcho text={draft.expires} />
                    </View>
                  </View>
                  <Text style={styles.fieldLabel}>Place of issue</Text>
                  <TextInput
                    ref={placeRef}
                    returnKeyType="next"
                    onSubmitEditing={() => docNotesRef.current?.focus()}
                    style={styles.input}
                    value={draft.place}
                    onChangeText={(t) => setDraft({ ...draft, place: t })}
                    placeholder="e.g. DFA Manila, MARINA"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="words"
                    autoCorrect={false}
                    autoComplete="off"
                    importantForAutofill="no"
                  />
                  <Text style={styles.fieldLabel}>Notes</Text>
                  <TextInput
                    ref={docNotesRef}
                    style={[styles.input, styles.inputNotes]}
                    value={draft.docNotes}
                    onChangeText={(t) => setDraft({ ...draft, docNotes: t })}
                    placeholder="anything else — e.g. renew 6 months before"
                    placeholderTextColor={colors.muted}
                    multiline
                    textAlignVertical="top"
                    autoCorrect={false}
                    autoComplete="off"
                    importantForAutofill="no"
                  />
                </>
              ) : draft.kind === 'note' ? (
                <>
                  <Text style={styles.fieldLabel}>What is it?</Text>
                  <TextInput
                    ref={titleRef}
                    returnKeyType="next"
                    onSubmitEditing={() => contentRef.current?.focus()}
                    style={[styles.input, styles.inputTitle]}
                    value={draft.title}
                    onChangeText={(t) => setDraft({ ...draft, title: t })}
                    placeholder="e.g. Locker code, Crew Wi-Fi"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="sentences"
                    autoCorrect={false}
                    autoComplete="off"
                    importantForAutofill="no"
                  />
                  <Text style={styles.fieldLabel}>Note</Text>
                  <TextInput
                    ref={contentRef}
                    style={[styles.input, styles.inputContent]}
                    value={draft.content}
                    onChangeText={(t) => setDraft({ ...draft, content: t })}
                    placeholder={'e.g. 12 34 56\nanything you want kept private'}
                    placeholderTextColor={colors.muted}
                    multiline
                    textAlignVertical="top"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    importantForAutofill="no"
                    spellCheck={false}
                  />
                </>
              ) : (
                <>
                <Text style={styles.fieldLabel}>What is it for?</Text>
                <TextInput
                  ref={titleRef}
                  returnKeyType="next"
                  onSubmitEditing={() => userRef.current?.focus()}
                  style={[styles.input, styles.inputTitle]}
                  value={draft.title}
                  onChangeText={(t) => setDraft({ ...draft, title: t })}
                  placeholder="e.g. Bank app, Crew portal, Gmail"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="sentences"
                  autoCorrect={false}
                  autoComplete="off"
                  importantForAutofill="no"
                />

                {/* 2.0.0-autofill.1: where it's used — autofill will match logins to this */}
                <Text style={styles.fieldLabel}>Website or app</Text>
                <TextInput
                  returnKeyType="next"
                  onSubmitEditing={() => userRef.current?.focus()}
                  style={[styles.input, styles.inputMono]}
                  value={draft.site}
                  onChangeText={(t) => setDraft({ ...draft, site: t })}
                  placeholder="e.g. gmail.com, BDO app"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  keyboardType="url"
                  autoCorrect={false}
                  autoComplete="off"
                  importantForAutofill="no"
                  spellCheck={false}
                />

                <Text style={styles.fieldLabel}>Username</Text>
                <TextInput
                  ref={userRef}
                  returnKeyType="next"
                  onSubmitEditing={() => passRef.current?.focus()}
                  style={[styles.input, styles.inputMono]}
                  value={draft.username}
                  onChangeText={(t) => setDraft({ ...draft, username: t })}
                  placeholder="name, e-mail or ID"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  importantForAutofill="no"
                  spellCheck={false}
                />

                <Text style={styles.fieldLabel}>Password</Text>
                {/* 1.10.7: the box gets the full width so a whole password fits; actions sit below it */}
                <TextInput
                  ref={passRef}
                  returnKeyType="done"
                  style={[styles.input, styles.inputPass]}
                  value={draft.password}
                  onChangeText={(t) => setDraft({ ...draft, password: t })}
                  placeholder="password, PIN or code"
                  placeholderTextColor={colors.muted}
                  // masked + no suggestions / autofill, so the keyboard doesn't learn or offer it
                  secureTextEntry={!showPass}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  importantForAutofill="no"
                  spellCheck={false}
                />
                <View style={styles.passActions}>
                  <Pressable onPress={() => void toggleShowPass()} hitSlop={8} style={styles.passBtn}>
                    <Text style={styles.link}>{showPass ? 'Hide' : 'Show'}</Text>
                  </Pressable>
                  <Pressable onPress={makePassword} hitSlop={8} style={styles.passBtn}>
                    <Text style={styles.link}>Make one</Text>
                  </Pressable>
                </View>
                </>
              )}

              {draftThumb ? (
                <View style={styles.photoRow}>
                  <Image source={{ uri: draftThumb }} style={styles.thumb} />
                  <Pressable onPress={() => setDraft({ ...draft, photo: null, removePhoto: true })} hitSlop={6}>
                    <Text style={styles.dangerLink}>Remove photo</Text>
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.row}>
                <Button
                  small
                  label={photoBusy ? 'Adding photo…' : draftThumb ? 'Retake' : 'Take photo'}
                  icon="camera"
                  onPress={() => setCameraOpen(true)}
                  disabled={photoBusy}
                />
                <Button small label="From gallery" icon="file" onPress={pickPhoto} disabled={photoBusy} />
              </View>
              <Text style={styles.hint}>
                A photo taken here is kept only inside this folder. One picked from the gallery is copied in — the
                original stays in your gallery until you delete it there.
              </Text>
              <View style={styles.row}>
                <Button label="Cancel" onPress={() => setDraft(null)} style={{ flex: 1 }} />
                <Button label="Save" variant="primary" icon="save" onPress={save} disabled={photoBusy} style={{ flex: 1 }} />
              </View>
            </View>
          ) : (
            <View style={styles.addRow}>
              <Button small label="Password" variant="primary" icon="plus" onPress={() => void (async () => { if (await allow(null)) startAdd('password'); })()} style={styles.addBtn} />
              <Button small label="Note" icon="plus" onPress={() => void (async () => { if (await allow(null)) startAdd('note'); })()} style={styles.addBtn} />
              <Button small label="Document" icon="plus" onPress={() => void (async () => { if (await allow(null)) startAdd('doc'); })()} style={styles.addBtn} />
            </View>
          )}

          {items.length > 0 && !draft ? (
            <View style={styles.searchRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={search}
                onChangeText={(t) => {
                  setKindFilter(null);
                  setChoices([]);
                  setPickedId(null);
                  setSearchByVoice(false); // typed: labels and usernames
                  setSearch(t);
                }}
                placeholder="Search — or tap 🎙 and say a label"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                importantForAutofill="no"
              />
              {/* the same quick mic as the main ask bar; it only hears the LABEL you say */}
              <MicButton id="private-search" onText={onVoiceSearch} />
            </View>
          ) : null}

          {!items.length && !draft ? (
            <Text style={styles.empty}>
              Nothing here yet. Add a password, an ID (SSS, TIN, SID, driver’s license, PhilHealth), a passport, a visa, a
              training certificate, a seaman’s book, or a note. Or say “save this password…”, “save my passport” or “my SSS number is…”.
            </Text>
          ) : null}

          {kindFilter && !search.trim() && !draft ? (
            <View style={styles.kindChip}>
              <Text style={styles.kindChipText}>
                Showing: {privateListLabel(kindFilter)}
              </Text>
              <Pressable onPress={() => setKindFilter(null)} hitSlop={8}>
                <Text style={styles.link}>✕ Hide</Text>
              </Pressable>
            </View>
          ) : null}
          {items.length > 0 && !draft && !search.trim() && !showAll && !kindFilter && !choices.length && !pickedId ? (
            <View style={styles.hiddenBox}>
              <Text style={styles.hiddenText}>
                {[
                  hiddenCounts.passwords ? `${hiddenCounts.passwords} password${hiddenCounts.passwords === 1 ? '' : 's'}` : '',
                  hiddenCounts.notes ? `${hiddenCounts.notes} note${hiddenCounts.notes === 1 ? '' : 's'}` : '',
                  hiddenCounts.docs ? `${hiddenCounts.docs} document${hiddenCounts.docs === 1 ? '' : 's'}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}{' '}
                — hidden
              </Text>
              {needAttention ? (
                <Text style={styles.attention}>
                  {needAttention} document{needAttention === 1 ? '' : 's'} need{needAttention === 1 ? 's' : ''} attention
                </Text>
              ) : null}
              <Text style={styles.hint}>
                Search or tap 🎙 and say a label to see just that one — or say “list all passwords”, “list all IDs” or “list all
                private notes”.
              </Text>
              <Button small label="Show all" icon="lock" onPress={() => void revealAll()} />
            </View>
          ) : null}
          {showAll && !search.trim() && !draft && items.length > 0 ? (
            <Pressable onPress={() => setShowAll(false)} hitSlop={6} style={{ alignSelf: 'flex-end' }}>
              <Text style={styles.link}>Hide all</Text>
            </Pressable>
          ) : null}

          {items.length > 0 && search.trim() !== '' && visible.length === 0 ? (
            <Text style={styles.empty}>Nothing in your private folder matches “{search.trim()}”.</Text>
          ) : null}

          {/* voice.28: DOCUMENTS — own section, soonest expiry first, warnings inside this folder only */}
          {visibleDocs.length ? (
            <>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Documents</Text>
                {needAttention ? (
                  <Text style={styles.attention}>
                    {needAttention} need{needAttention === 1 ? 's' : ''} attention
                  </Text>
                ) : null}
              </View>
              {visibleDocs.map((r) => {
                const u = unpackDocNotes(r.notes);
                const st = expiryStatus(r.date);
                return (
                  <View key={r.id} style={[styles.card, st?.level === 'expired' && styles.cardExpired, st?.level === 'soon' && styles.cardSoon]}>
                    <View style={styles.cardMain}>
                      <Text style={styles.docTitle}>{r.title}</Text>
                      {readDocTag(r.notes) || st ? (
                        <View style={styles.docTags}>
                          {readDocTag(r.notes) ? <Text style={styles.kindTag}>{tagLabel(readDocTag(r.notes)!)}</Text> : null}
                          {st ? (
                            <Text style={[styles.expTag, st.level === 'expired' ? styles.expBad : st.level === 'soon' ? styles.expSoon : styles.expOk]}>
                              {st.text}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                      {r.people ? (
                        <View style={styles.docField}>
                          <Text style={styles.docLabel}>No.</Text>
                          <Text style={styles.noteValue} selectable={false}>
                            {r.people}
                          </Text>
                        </View>
                      ) : null}
                      {u.issued || r.date ? (
                        <View style={styles.docDates}>
                          {u.issued ? (
                            <View style={styles.docDate}>
                              <Text style={styles.docLabel}>Issued</Text>
                              <Text style={styles.docValue}>{showDocDate(u.issued)}</Text>
                            </View>
                          ) : null}
                          {r.date ? (
                            <View style={styles.docDate}>
                              <Text style={styles.docLabel}>Expires</Text>
                              <Text style={styles.docValue}>{showDocDate(r.date)}</Text>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                      {r.location ? (
                        <View style={styles.docField}>
                          <Text style={styles.docLabel}>Place of issue</Text>
                          <Text style={styles.docValue}>{r.location}</Text>
                        </View>
                      ) : null}
                      {u.notes ? <Text style={styles.docNotes}>{u.notes}</Text> : null}
                      <View style={styles.cardBtns}>
                        <Pressable onPress={() => void holdItem(r.id)} hitSlop={6}>
                          {heldId === r.id ? <Icon name="lock" size={16} color={colors.accent} /> : <Text style={styles.link}>Pin it</Text>}
                        </Pressable>
                        {r.people ? (
                          <Pressable onPress={() => void (async () => { if (await allow(r.id)) await copyDocNo(r); })()} hitSlop={6}>
                            <Text style={styles.link}>Copy No.</Text>
                          </Pressable>
                        ) : null}
                        <Pressable onPress={() => void (async () => { if (await allow(r.id)) startEdit(r); })()} hitSlop={6}>
                          <Text style={styles.link}>Edit</Text>
                        </Pressable>
                        <Pressable onPress={() => void (async () => { if (await allow(r.id)) confirmRemove(r); })()} hitSlop={6}>
                          <Text style={styles.dangerLink}>Delete</Text>
                        </Pressable>
                      </View>
                    </View>
                    {r.thumb ? (
                      <Pressable onPress={() => void openPhoto(r)}>
                        <Image source={{ uri: r.thumb }} style={styles.thumb} />
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
              {visibleOther.length ? <Text style={styles.sectionTitle}>Passwords & notes</Text> : null}
            </>
          ) : null}

          {showAll && !search.trim() ? (
            <PasswordHealth items={items} onFix={(r) => void (async () => { if (await allow(r.id)) startEdit(r); })()} />
          ) : null}
          {visibleOther.map((r) => {
            const open = shown.has(r.id);
            if (isPrivateNote(r)) {
              // Note / ID (1.10.12): shown in full once the folder is unlocked
              return (
                <View key={r.id} style={styles.card}>
                  <View style={styles.cardMain}>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{r.title}</Text>
                      <Text style={styles.kindTag}>note</Text>
                    </View>
                    {r.notes ? (
                      <Text style={styles.noteValue} selectable={false}>
                        {r.notes}
                      </Text>
                    ) : null}
                    <View style={styles.cardBtns}>
                      <Pressable onPress={() => void holdItem(r.id)} hitSlop={6}>
                        {heldId === r.id ? <Icon name="lock" size={16} color={colors.accent} /> : <Text style={styles.link}>Pin it</Text>}
                      </Pressable>
                      {r.notes ? (
                        <Pressable onPress={() => void (async () => { if (await allow(r.id)) await copyNote(r); })()} hitSlop={6}>
                          <Text style={styles.link}>Copy</Text>
                        </Pressable>
                      ) : null}
                      <Pressable onPress={() => void (async () => { if (await allow(r.id)) startConvert(r); })()} hitSlop={6}>
                        <Text style={styles.link}>Make it a document</Text>
                      </Pressable>
                      <Pressable onPress={() => void (async () => { if (await allow(r.id)) startEdit(r); })()} hitSlop={6}>
                        <Text style={styles.link}>Edit</Text>
                      </Pressable>
                      <Pressable onPress={() => void (async () => { if (await allow(r.id)) confirmRemove(r); })()} hitSlop={6}>
                        <Text style={styles.dangerLink}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                  {r.thumb ? (
                    <Pressable onPress={() => void openPhoto(r)}>
                      <Image source={{ uri: r.thumb }} style={styles.thumb} />
                    </Pressable>
                  ) : null}
                </View>
              );
            }
            return (
              <View key={r.id} style={styles.card}>
                <View style={styles.cardMain}>
                  <Text style={styles.cardTitle}>{r.title}</Text>
                  {r.location ? (
                    <Text style={styles.notes}>
                      <Text style={styles.kv}>site  </Text>
                      {r.location}
                    </Text>
                  ) : null}
                  {r.people ? (
                    <Text style={styles.notes}>
                      <Text style={styles.kv}>user  </Text>
                      {r.people}
                    </Text>
                  ) : null}
                  {r.notes ? (
                    <Pressable onPress={() => void (async () => { if (await allow(r.id)) await toggleShown(r.id); })()} hitSlop={4}>
                      <Text style={open ? styles.notes : styles.hidden}>
                        <Text style={styles.kv}>pass  </Text>
                        {open ? r.notes : '••••••  tap to show (fingerprint)'}
                      </Text>
                    </Pressable>
                  ) : null}
                  <View style={styles.cardBtns}>
                    <Pressable onPress={() => void holdItem(r.id)} hitSlop={6}>
                      {heldId === r.id ? <Icon name="lock" size={16} color={colors.accent} /> : <Text style={styles.link}>Pin it</Text>}
                    </Pressable>
                    {r.notes ? (
                      <Pressable onPress={() => void (async () => { if (await allow(r.id)) await copyPassword(r); })()} hitSlop={6}>
                        <Text style={styles.link}>Copy password</Text>
                      </Pressable>
                    ) : null}
                    <Pressable onPress={() => void (async () => { if (await allow(r.id)) startEdit(r); })()} hitSlop={6}>
                      <Text style={styles.link}>Edit</Text>
                    </Pressable>
                    <Pressable onPress={() => void (async () => { if (await allow(r.id)) confirmRemove(r); })()} hitSlop={6}>
                      <Text style={styles.dangerLink}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
                {r.thumb ? (
                  <Pressable onPress={() => void openPhoto(r)}>
                    <Image source={{ uri: r.thumb }} style={styles.thumb} />
                  </Pressable>
                ) : null}
              </View>
            );
          })}

          <VaultSecurity guard={guard} reauth={reauth} onMessage={setMessage} onChanged={refresh} onActivity={poke} />

          <Pressable onPress={() => void confirmDeleteAll()} hitSlop={6} style={styles.deleteAll}>
            <Text style={styles.dangerLink}>Delete private folder</Text>
          </Pressable>
          <Text style={styles.footnote}>
            Copied passwords are wiped from the clipboard after {CLEAR_MS / 1000} s. A keyboard with clipboard
            history (Gboard) may keep its own copy for a while — paste and move on.
          </Text>
          <Text style={styles.footnote}>
            Locked on this phone with your PIN (and fingerprint). Your recovery key opens it if you forget the PIN; a
            backup file + the recovery key bring it back on a new phone. Without both, losing the phone loses the folder.
          </Text>
        </ScrollView>
      )}

      <CameraModal
        visible={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(p) => void takePhoto(p.uri)}
        onPickInstead={() => void pickPhoto()}
        onPrompt={(on) => {
          // The first time, Android asks "allow camera?" and the phone calls that a trip to the
          // background. That must not lock the folder while a photo is being taken.
          picking.current = on;
        }}
      />
      <Lightbox
        uri={viewing?.uri ?? null}
        held={!!viewing && heldId === viewing.id}
        onHold={viewing ? () => void holdItem(viewing.id) : undefined}
        onClose={() => void closePhoto()}
        onShare={viewing?.full ? (u) => void shareImage(u) : undefined}
        loadingFull={!!viewing && !viewing.full}
      />
      <EraseConfirm mode={eraseMode} onCancel={() => setEraseMode(null)} onErase={doErase} onActivity={poke} />
      <PinPrompt
        visible={!!pinAsk}
        title={pinAsk ?? ''}
        sub="Enter your MemoAirem PIN"
        onClose={() => {
          setPinAsk(null);
          pinDone.current?.(false);
          pinDone.current = null;
        }}
        onPin={async (pin) => {
          authing.current = true;
          const r = await checkPin(pin);
          authing.current = false;
          if (!r.ok) return r.message;
          setPinAsk(null);
          pinDone.current?.(true);
          pinDone.current = null;
          return null;
        }}
      />
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
  title: { fontFamily: fonts.groteskSemi, fontSize: 17, color: colors.ink },
  count: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted, marginLeft: 8 },
  lockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: 'auto',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  lockTxt: { fontFamily: fonts.interSemi, fontSize: 11.5, color: colors.ink },
  locked: { flexGrow: 1, justifyContent: 'center', padding: 16, gap: 12 },
  lockedSub: { fontFamily: fonts.inter, fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 17, paddingHorizontal: 12 },
  pickList: { alignSelf: 'stretch' },
  pickRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  pickText: { fontFamily: fonts.inter, fontSize: 16, color: colors.ink },
  msg: {
    fontFamily: fonts.inter,
    fontSize: 12.5,
    color: colors.warnInk,
    backgroundColor: colors.warnBg,
    borderRadius: radius.control,
    padding: 10,
    textAlign: 'center',
  },
  content: { padding: 14, gap: 12, paddingBottom: 48 },
  form: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 12,
    gap: 10,
  },
  formHead: { fontFamily: fonts.groteskSemi, fontSize: 14, color: colors.ink },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.control,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontFamily: fonts.inter,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.surface2,
  },
  inputTitle: { fontFamily: fonts.interSemi },
  inputMono: { fontFamily: fonts.mono, fontSize: 13.5 },
  fieldLabel: { fontFamily: fonts.interSemi, fontSize: 12, color: colors.muted, marginBottom: -4 },
  inputPass: { fontFamily: fonts.mono, fontSize: 15, letterSpacing: 0.5, paddingVertical: 11, alignSelf: 'stretch' },
  passActions: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: -2 },
  passBtn: { paddingVertical: 6 },
  kv: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted },
  row: { flexDirection: 'row', gap: 8 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hint: { fontFamily: fonts.inter, fontSize: 11.5, color: colors.muted, lineHeight: 16 },
  empty: { fontFamily: fonts.inter, fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 12 },
  kindChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.deviceBg,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  kindChipText: { fontFamily: fonts.interSemi, fontSize: 13, color: colors.primaryInk },
  hiddenBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 14,
    gap: 8,
    alignItems: 'center',
  },
  hiddenText: { fontFamily: fonts.interSemi, fontSize: 13.5, color: colors.ink, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 12,
  },
  cardMain: { flex: 1, gap: 6 },
  cardTitle: { fontFamily: fonts.interSemi, fontSize: 14.5, color: colors.ink, flexShrink: 1 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kindTag: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.primaryInk,
    backgroundColor: colors.deviceBg,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  noteValue: { fontFamily: fonts.mono, fontSize: 15, color: colors.ink, lineHeight: 21, letterSpacing: 0.3 },
  inputContent: { minHeight: 84, fontFamily: fonts.mono, fontSize: 15 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quick: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: colors.surface },
  quickOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  quickTxt: { fontFamily: fonts.interSemi, fontSize: 12.5, color: colors.ink },
  quickTxtOn: { color: '#fff' },
  tagHint: { fontFamily: fonts.inter, fontSize: 12, color: colors.muted, marginTop: -2 },
  notes: { fontFamily: fonts.mono, fontSize: 13, color: colors.ink, lineHeight: 19 },
  hidden: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.muted },
  cardBtns: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 8, marginTop: 2 },
  link: { fontFamily: fonts.interSemi, fontSize: 12.5, color: colors.primary },
  dangerLink: { fontFamily: fonts.interSemi, fontSize: 12.5, color: colors.fail },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: colors.imageBg },
  deleteAll: { alignSelf: 'center', marginTop: 18 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footnote: { fontFamily: fonts.inter, fontSize: 11, color: colors.muted, textAlign: 'center', lineHeight: 16 },
  // voice.28 — documents
  addRow: { flexDirection: 'row', gap: 8 },
  addBtn: { flex: 1, paddingHorizontal: 6 },
  inputNotes: { minHeight: 64 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  sectionTitle: { fontFamily: fonts.groteskSemi, fontSize: 14, color: colors.ink, marginTop: 4 },
  attention: { fontFamily: fonts.interSemi, fontSize: 12, color: colors.errInk },
  cardExpired: { borderColor: colors.errInk },
  cardSoon: { borderColor: colors.warnInk },
  expTag: { fontFamily: fonts.mono, fontSize: 10, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  expBad: { color: '#fff', backgroundColor: colors.errInk },
  expSoon: { color: colors.warnInk, backgroundColor: colors.warnBg },
  expOk: { color: colors.muted, backgroundColor: colors.surface2 },
  docMeta: { fontFamily: fonts.inter, fontSize: 12, color: colors.muted, lineHeight: 17 },
  docNotes: { fontFamily: fonts.inter, fontSize: 12.5, color: colors.ink, lineHeight: 18 },
  docTitle: { fontFamily: fonts.interSemi, fontSize: 15, color: colors.ink, lineHeight: 20 },
  docTags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  docField: { gap: 1 },
  docDates: { flexDirection: 'row', gap: 16 },
  docDate: { gap: 1 },
  docLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  docValue: { fontFamily: fonts.inter, fontSize: 13.5, color: colors.ink },
  echo: { fontFamily: fonts.inter, fontSize: 11.5, marginTop: -2 },
  echoOk: { color: colors.primaryInk },
  echoBad: { color: colors.errInk },
});

/** voice.28: shows how a typed document date was read ("→ 5 Mar 2027"), or that it isn't one yet. */
function DateEcho({ text }: { text: string }) {
  if (!text.trim()) return null;
  const d = readDocDate(text);
  return (
    <Text style={[styles.echo, d ? styles.echoOk : styles.echoBad]}>
      {d ? `→ ${showDocDate(d)}` : 'with the year, day first: 5/3/2027'}
    </Text>
  );
}
