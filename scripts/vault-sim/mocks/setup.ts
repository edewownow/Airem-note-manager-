// v3 (1.13.0): a new folder needs a PIN + recovery key; reopening uses the fingerprint copy.
import * as V from '../../../src/lib/vault';
export const SIM_PIN = '482916';
export async function openFolder() {
  if (V.vaultMode() === 'none') {
    V.beginSetup(SIM_PIN);
    return V.finishSetup({ biometric: true });
  }
  return V.unlockVault();
}
