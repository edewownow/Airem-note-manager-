// GTCRN mock: streaming holds back 256 samples (like the real model's frame shift) and returns the
// rest. It removes (÷30, like the measured −30 dB) only the sim's "fan" signal (peak ≈ 0.04) — the
// real model keeps quiet speech (measured: soft voice 0.0071 → 0.0063), so the mock must too.
export const enh = { fail: false, fed: 0, out: 0, offlineCalls: 0, opened: 0 };
const peak = (a: number[]) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
const clean = (a: number[]) => (Math.abs(peak(a) - 0.04) < 0.002 ? a.map((x) => x / 30) : a);
export async function createStreamingEnhancement() {
  enh.opened++;
  let held: number[] = [];
  return {
    instanceId: 'e1',
    async feedSamples(s: number[]) {
      if (enh.fail) throw new Error('mock cleaner failure');
      await new Promise((r) => setTimeout(r, 1));
      enh.fed += s.length;
      const all = [...held, ...clean(s)];
      held = all.slice(Math.max(0, all.length - 256));
      const out = all.slice(0, Math.max(0, all.length - 256));
      enh.out += out.length;
      return { samples: new Float32Array(out), sampleRate: 16000 };
    },
    async flush() { const out = held; held = []; enh.out += out.length; return { samples: new Float32Array(out), sampleRate: 16000 }; },
    async reset() { held = []; },
    async getSampleRate() { return 16000; },
    async getFrameShiftInSamples() { return 256; },
    async destroy() {},
  };
}
export async function createEnhancement() {
  return {
    instanceId: 'o1',
    async enhanceSamples(s: number[]) { enh.offlineCalls++; return { samples: new Float32Array(clean(s)), sampleRate: 16000 }; },
    async enhanceFile() { return { samples: new Float32Array(0), sampleRate: 16000 }; },
    async getSampleRate() { return 16000; },
    async destroy() {},
  };
}
