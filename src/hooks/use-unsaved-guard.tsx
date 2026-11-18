"use client";

// Warns before unsaved edits are lost: closing or reloading the tab, following a link that leaves the page,
// or an in-app action (switching tab or class) that the page routes through `runGuarded`.
// Generalised from the Vault page's guard.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function useUnsavedGuard(
  dirty: boolean,
  message = "You have changes that are not saved. Leave without saving them?",
): { runGuarded: (action: () => void) => void; guardDialog: ReactNode } {
  const router = useRouter();
  const pending = useRef<(() => void) | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor || !anchor.href || anchor.target || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href);
      const here = window.location;
      if (
        url.origin === here.origin &&
        url.pathname === here.pathname &&
        url.search === here.search
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      pending.current = () =>
        url.origin === here.origin
          ? router.push(url.pathname + url.search + url.hash)
          : here.assign(url.href);
      setOpen(true);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, router]);

  const runGuarded = useCallback(
    (action: () => void) => {
      if (!dirty) return action();
      pending.current = action;
      setOpen(true);
    },
    [dirty],
  );

  const guardDialog = (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) pending.current = null;
      }}
      title="Discard unsaved changes?"
      description={message}
      confirmText="Discard changes"
      cancelText="Keep editing"
      onConfirm={() => {
        const action = pending.current;
        pending.current = null;
        action?.();
      }}
    />
  );

  return { runGuarded, guardDialog };
}
