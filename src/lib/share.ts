/**
 * Export helper — RN has no blob download, so we write JSON to a cache file and
 * hand it to the system share sheet. Used by store / log / corrections exports.
 *
 * Uses the legacy expo-file-system entry (stable writeAsStringAsync) — the new
 * File API's write throws if misused; legacy is explicitly supported for this.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

export async function shareJSON(filename: string, data: unknown): Promise<void> {
  await shareText(filename, JSON.stringify(data, null, 2));
}

/**
 * 1.13.0: share a ready-made text file (the encrypted private backup). The cache copy is deleted
 * after the share sheet closes — the user's chosen place (Drive, e-mail, Files) keeps the only copy.
 */
export async function shareText(filename: string, text: string, mimeType = 'application/json'): Promise<boolean> {
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!dir) throw new Error('No writable directory available.');
  const uri = dir + filename;
  await FileSystem.writeAsStringAsync(uri, text);
  try {
    if (!(await Sharing.isAvailableAsync())) return false;
    await Sharing.shareAsync(uri, { mimeType, dialogTitle: filename, UTI: 'public.json' });
    return true;
  } finally {
    // give the receiving app a moment to read it, then remove our copy
    setTimeout(() => void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}), 60_000);
  }
}

/** Share a private photo. The cache copy is removed after the sheet closes. */
export async function shareImage(dataUri: string, filename = `photo-${Date.now()}.jpg`): Promise<boolean> {
  // A new name each time: a fixed one let the next share reuse, or delete, the last photo's file.
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!dir) return false;
  const b64 = dataUri.replace(/^data:image\/\w+;base64,/, '');
  if (!b64) return false;
  const uri = dir + filename;
  await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
  try {
    if (!(await Sharing.isAvailableAsync())) return false;
    await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: 'Share photo', UTI: 'public.jpeg' });
    return true;
  } finally {
    setTimeout(() => void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}), 60_000);
  }
}

/** 1.13.0: pick a file and read it as text (the private backup). Null when cancelled. Copy deleted after. */
export async function pickTextFile(): Promise<{ name: string; text: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  try {
    const text = await FileSystem.readAsStringAsync(a.uri);
    return { name: a.name ?? 'file', text };
  } finally {
    void FileSystem.deleteAsync(a.uri, { idempotent: true }).catch(() => {});
  }
}
