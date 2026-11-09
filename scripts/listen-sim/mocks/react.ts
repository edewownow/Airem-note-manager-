// Minimal React for a single-render hook simulation.
export function useRef<T>(v: T) { return { current: v }; }
export function useCallback<T>(fn: T, _d?: unknown[]) { return fn; }
export function useState<T>(v: T) { return [v, () => {}] as const; }
export function useEffect() {}
export function createContext() { return {}; }
export function useContext() { return null; }
export default { useRef, useCallback, useState, useEffect, createContext, useContext };
