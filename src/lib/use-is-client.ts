"use client";
import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** True only after hydration, so components can read browser storage in lazy useState initialisers. */
export function useIsClient() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
