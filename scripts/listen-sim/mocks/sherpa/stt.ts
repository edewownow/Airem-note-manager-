// Whisper mock: returns queued texts, records the length of every piece it was given.
export const stt = { texts: [] as string[], pieces: [] as number[], delay: 5, created: [] as any[], destroyed: 0 };
export type SttEngine = any;
export async function createSTT(o: any) {
  stt.created.push(o);
  return {
    async transcribeSamples(s: number[]) {
      stt.pieces.push(s.length);
      await new Promise((r) => setTimeout(r, stt.delay));
      return { text: stt.texts.length ? stt.texts.shift()! : 'whisper text' };
    },
    async transcribeFile() { return { text: 'After early nightfall the yellow lamps would light up' }; },
    async destroy() { stt.destroyed++; },
  };
}
