// 'expo' for the vault sims: requireOptionalNativeModule hands back whatever native vault core the
// test plugs in (null = a build without the Kotlin module).
export const nativeCtl: { mod: any } = { mod: null };
export function requireOptionalNativeModule(name: string) {
  return name === 'MemoairemVault' ? nativeCtl.mod : null;
}
