"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Decides where Tab / Shift+Tab should move so focus wraps inside a modal.
 * Returns the element to focus, or null when the browser's default is fine.
 */
export function wrapFocusTarget<T>(
  focusables: readonly T[],
  active: unknown,
  shift: boolean,
  container: unknown
): T | null {
  if (focusables.length === 0) return null;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (shift && (active === first || active === container)) return last;
  if (!shift && active === last) return first;
  return null;
}

/**
 * Dialog semantics for hand-rolled overlays (drawers) that cannot be swapped for
 * the Radix Dialog without changing their animation: moves focus into the panel
 * on open, traps Tab, closes on Escape and restores focus on close.
 * Attach the returned ref to the panel and give it tabIndex={-1}.
 */
export function useModalA11y<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const panelRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    panel.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const target = wrapFocusTarget(focusables, document.activeElement, event.shiftKey, panel);
      if (target) {
        event.preventDefault();
        target.focus({ preventScroll: true });
      } else if (focusables.length === 0) {
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open]);

  return panelRef;
}
