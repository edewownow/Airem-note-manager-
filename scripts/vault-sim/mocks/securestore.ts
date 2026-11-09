// expo-secure-store, faithful to the Android module (SecureStoreModule.kt / AESEncryptor.kt):
// entries stored with requireAuthentication need a STRONG biometric on every read AND write; when the
// phone's fingerprints change, Android destroys that Keystore key and getItemAsync resolves NULL.
export const store = new Map<string, string>();
const authed = new Set<string>(); // keys written with requireAuthentication
export const bio = { cancel: false, invalidated: false, prompts: 0, enrolled: true };
export async function getItemAsync(k: string, o: any = {}) {
  if (authed.has(k)) {
    if (!o.requireAuthentication) throw new Error('auth entry read without requireAuthentication');
    bio.prompts++;
    if (!bio.enrolled) throw new Error('No biometrics are currently enrolled');
    if (bio.cancel) throw new Error('User canceled the authentication');
    if (bio.invalidated) return null;
  }
  return store.get(k) ?? null;
}
export async function setItemAsync(k: string, v: string, o: any = {}) {
  if (o.requireAuthentication) {
    bio.prompts++;
    if (!bio.enrolled) throw new Error('No biometrics are currently enrolled');
    if (bio.cancel) throw new Error('User canceled the authentication');
    authed.add(k);
    bio.invalidated = false; // a fresh key is generated
  } else authed.delete(k);
  store.set(k, v);
}
export async function deleteItemAsync(k: string) { store.delete(k); authed.delete(k); }
export function clearAll() { store.clear(); authed.clear(); }
