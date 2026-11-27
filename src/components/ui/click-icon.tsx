"use client";

import {
  useEffect,
  useId,
  useRef,
  type AriaAttributes,
  type CSSProperties,
  type ForwardRefExoticComponent,
  type RefAttributes,
} from "react";
import type { IconHandle } from "@animateicons/react";
import { cn } from "@/lib/utils";

type AnimatedIconProps = AriaAttributes & {
  size?: number;
  className?: string;
  style?: CSSProperties;
  role?: string;
};

export interface ClickIconProps extends AnimatedIconProps {
  /** An icon from `@animateicons/react/lucide/<name>-icon`. */
  icon: ForwardRefExoticComponent<AnimatedIconProps & RefAttributes<IconHandle>>;
  strokeWidth?: number | string;
}

// What counts as "the control this icon sits in". A click anywhere on it plays the icon.
const TRIGGERS = 'button, a, summary, [role="button"], [role="tab"], [role="switch"]';
const SIZED = /(^|[\s:])(size|w|h)-/;
const COLORED = /(^|[\s:])text-/;

/**
 * An animated icon that plays once each time the button or link around it is clicked, and stays
 * still otherwise (no hover animation). Takes the same `className` a Lucide icon would: sizes like
 * `size-4` apply to the icon, and inside a `Button` it defaults to the button's icon size.
 *
 * Use it only inside something clickable; anywhere else a plain Lucide icon is lighter and looks
 * the same. It renders a `div`, so it cannot go inside a `<p>`.
 *
 * The wrapper is `inline-flex`, and that beats a plain `hidden` or `block` in `className`. To hide
 * it, mark the display classes important (`hidden! dark:block!`); variants alone (`md:hidden`) win
 * without help.
 */
export function ClickIcon({ icon: Icon, className, style, strokeWidth, ...props }: ClickIconProps) {
  const id = useId();
  const handle = useRef<IconHandle>(null);

  useEffect(() => {
    const trigger = document
      .querySelector(`[data-click-icon="${id}"]`)
      ?.closest<HTMLElement>(TRIGGERS);
    if (!trigger) return;
    // A frame later, so a click that swaps the icon (copy → check) plays the new one.
    const play = () => requestAnimationFrame(() => handle.current?.startAnimation());
    trigger.addEventListener("click", play);
    return () => trigger.removeEventListener("click", play);
  }, [id]);

  const iconProps = {
    "aria-hidden": props["aria-label"] ? undefined : true,
    ...props,
    "data-click-icon": id,
  };

  return (
    <Icon
      {...iconProps}
      ref={handle}
      className={cn(
        "shrink-0",
        // The class sizes the wrapper; the drawing fills it (and outranks Button's default size).
        className && SIZED.test(className) && "[&>svg]:size-full!",
        // Same for colour: some parents (select and menu triggers) mute any svg without its own.
        className && COLORED.test(className) && "[&>svg]:text-inherit!",
        strokeWidth != null && "[&>svg]:[stroke-width:var(--click-icon-stroke)]",
        className,
      )}
      style={
        strokeWidth != null
          ? ({ ...style, "--click-icon-stroke": String(strokeWidth) } as CSSProperties)
          : style
      }
    />
  );
}
