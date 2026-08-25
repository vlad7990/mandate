"use client";

// Text derived from Date.now() ("3m ago") or from window (location.origin)
// differs between the server render and the client's hydration a moment
// later — React #418, first observed live on /hiring-manager (§128 F-5).
// Gate such text on this hook: the server snapshot (and therefore the
// client's FIRST render, which must match it) is false; the live value
// appears immediately after hydration.

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}
