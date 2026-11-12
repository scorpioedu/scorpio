"use client";

import { useEffect, useState } from "react";
import { onAuthChange } from "./firebase";

export type AdminAccess = "loading" | "signed-out" | "not-admin" | "admin";

/**
 * Reports whether the signed-in user holds the `admin: true` custom claim (RT-06).
 * This only decides what to render; the API routes enforce the claim themselves.
 * The token is force-refreshed so a claim granted after sign-in is picked up.
 */
export function useAdminAccess(): AdminAccess {
  const [access, setAccess] = useState<AdminAccess>("loading");

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onAuthChange(async (user) => {
      if (!user) {
        if (!cancelled) setAccess("signed-out");
        return;
      }
      try {
        const token = await user.getIdTokenResult(true);
        if (!cancelled) setAccess(token.claims.admin === true ? "admin" : "not-admin");
      } catch {
        if (!cancelled) setAccess("not-admin");
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return access;
}
