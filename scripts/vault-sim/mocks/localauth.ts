export const SecurityLevel = { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 };
export const ctl = { level: 3, success: true, lastOptions: null as any };
export async function getEnrolledLevelAsync() { return ctl.level; }
export async function authenticateAsync(o: any = {}) {
  ctl.lastOptions = o;
  return ctl.success ? { success: true } : { success: false, error: 'user_cancel' };
}
