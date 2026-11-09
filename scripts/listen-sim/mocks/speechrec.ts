// expo-speech-recognition mock: one event bus + a log of start() calls.
type L = (e: any) => void;
export const bus: Record<string, L[]> = {};
export const rec = { starts: [] as any[], aborts: 0, stops: 0, state: 'inactive', granted: true, onDevice: true };
export function useSpeechRecognitionEvent(name: string, l: L) { (bus[name] ||= []).push(l); }
export function emit(name: string, e: any = null) { for (const l of bus[name] || []) l(e); }
export const ExpoSpeechRecognitionModule = {
  abort() { rec.aborts++; },
  stop() { rec.stops++; },
  async getStateAsync() { return rec.state; },
  async requestPermissionsAsync() { return { granted: rec.granted }; },
  supportsOnDeviceRecognition() { return rec.onDevice; },
  isRecognitionAvailable() { return true; },
  start(o: any) { rec.starts.push(o); },
};
