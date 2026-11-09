// PCM stream + WAV decode mocks.
export const audio = { stream: null as any, decoded: {} as Record<string, number[]>, decodeCalls: 0 };
export type PcmLiveStreamHandle = any;
export function createPcmLiveStream() {
  const s: any = {
    data: [] as any[], errs: [] as any[], started: false, stopped: false,
    async start() { s.started = true; },
    async stop() { s.stopped = true; },
    onData(cb: any) { s.data.push(cb); return () => { s.data = s.data.filter((x: any) => x !== cb); }; },
    onError(cb: any) { s.errs.push(cb); return () => { s.errs = s.errs.filter((x: any) => x !== cb); }; },
    push(chunk: Float32Array) { for (const cb of s.data) cb(chunk, 16000); },
  };
  audio.stream = s;
  return s;
}
export async function decodeAudioFileToFloatSamples(path: string) {
  audio.decodeCalls++;
  await new Promise((r) => setTimeout(r, 5));
  return { samples: audio.decoded[path] ?? [], sampleRate: 16000 };
}
