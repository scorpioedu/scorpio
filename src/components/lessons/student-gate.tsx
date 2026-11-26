"use client";

// The public lesson pages are static and built for visitors. A signed-in student is sent to their
// app instead of being offered sign-up or a second, unsaved practice. This reads the readable
// `scorpio_role` hint the session route sets: not proof of anything (the app checks the real
// session), and false on the server, so the static HTML is always the visitor version.
import { useSyncExternalStore, type ReactNode } from "react";

const noop = () => () => {};

export function useSignedInStudent(): boolean {
  return useSyncExternalStore(
    noop,
    () => /(?:^|; )scorpio_role=student(?:;|$)/.test(document.cookie),
    () => false,
  );
}

/** Renders its children for everyone except a signed-in student. */
export function VisitorOnly({ children }: { children: ReactNode }) {
  return useSignedInStudent() ? null : <>{children}</>;
}
