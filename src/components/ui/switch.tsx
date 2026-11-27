"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * An on/off toggle for a setting that takes effect at once. A real button with role="switch", so a
 * <Label htmlFor> toggles it and Space or Enter work without extra code.
 */
function Switch({
  checked,
  onCheckedChange,
  className,
  ...props
}: Omit<React.ComponentProps<"button">, "onChange" | "role" | "type"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const state = checked ? "checked" : "unchecked";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-slot="switch"
      data-state={state}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent shadow-xs transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80",
        className,
      )}
      {...props}
    >
      <span
        data-slot="switch-thumb"
        data-state={state}
        className="pointer-events-none block size-4 rounded-full bg-background shadow-sm transition-transform data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-0.5 dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground"
      />
    </button>
  );
}

export { Switch };
