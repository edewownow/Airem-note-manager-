/**
 * Connectivity + capability. Every online feature checks capability at call
 * time: "am I online?" and "is an AI link configured?" — and picks the best path
 * it can. Nothing hard-fails for lack of signal.
 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import type { AiLink, Capability } from '../types';
import { isLinked } from './settings';

/** Treat as online when connected and the internet isn't known-unreachable. */
function onlineFromState(s: NetInfoState): boolean {
  return !!s.isConnected && s.isInternetReachable !== false;
}

export async function fetchOnline(): Promise<boolean> {
  const s = await NetInfo.fetch();
  return onlineFromState(s);
}

export function subscribeOnline(cb: (online: boolean) => void): () => void {
  return NetInfo.addEventListener((s) => cb(onlineFromState(s)));
}

/** Combine live online state + the configured link into a capability snapshot. */
export function computeCapability(online: boolean, link: AiLink): Capability {
  const aiLinked = isLinked(link);
  return { online, aiLinked, canParse: online && aiLinked };
}
