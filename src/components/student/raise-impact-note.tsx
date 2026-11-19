"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * A small info button that says Raise is optional and that each message uses environmental
 * resources. `linkToSustainability` is off inside assignments, where a link would take the student
 * away from their work.
 */
export function RaiseImpactNote({
  linkToSustainability = false,
  align = "end",
  className,
}: {
  linkToSustainability?: boolean;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="About Raise and its environmental impact"
        className={cn(
          "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
          className,
        )}
      >
        <Info className="size-4" />
      </PopoverTrigger>
      <PopoverContent align={align} className="w-72 space-y-2 text-xs leading-relaxed">
        <p className="text-sm font-medium text-foreground">Raise is optional</p>
        <p className="text-muted-foreground">
          You can do all of your coursework without it. Raise gives hints and explanations, not
          answers.
        </p>
        <p className="text-muted-foreground">
          Each message runs on an AI model, which uses energy and water.{" "}
          {linkToSustainability ? (
            <>
              Environmental impact can be found in{" "}
              <Link
                href="/sustainability"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground underline underline-offset-2"
              >
                Sustainability
              </Link>
              .
            </>
          ) : (
            "Environmental impact can be found in Sustainability."
          )}
        </p>
      </PopoverContent>
    </Popover>
  );
}
