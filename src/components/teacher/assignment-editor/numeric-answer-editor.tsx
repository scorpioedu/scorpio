"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_TOLERANCE_PERCENT, parseNumericKey } from "../../../../functions/src/grading-core";
import type { Question } from "./types";

/** Answer, tolerance and sig figs for a numeric question, with a live check that the key can be read. */
export function NumericAnswerEditor({
  question,
  onChange,
}: {
  question: Question;
  onChange: (updates: Partial<Question>) => void;
}) {
  const key = question.correctAnswer?.trim() || "";
  const parsed = key ? parseNumericKey(key) : undefined;
  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="text-sm font-medium">Correct answer</legend>
      <div className="space-y-1.5">
        <Input
          id={`answer-${question.id}`}
          aria-label="Correct answer with unit"
          value={question.correctAnswer || ""}
          onChange={(e) => onChange({ correctAnswer: e.target.value })}
          placeholder="12.5 m/s"
          aria-invalid={Boolean(key) && !parsed}
          aria-describedby={`answer-${question.id}-help`}
        />
        <p
          id={`answer-${question.id}-help`}
          className={`text-xs ${key && !parsed ? "text-destructive" : "text-muted-foreground"}`}
        >
          {!key
            ? "A number and its unit. Students can answer in any equivalent unit (45 km/h for 12.5 m/s)."
            : parsed
              ? parsed.unit
                ? `Read as ${parsed.value} ${parsed.unitText}.`
                : `Read as ${parsed.value} (no unit: students' units are ignored).`
              : "Couldn't read this. Use a number and a unit, like 9.8 m/s^2 or 3.0e8 m/s."}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`tolerance-${question.id}`}>Tolerance (%)</Label>
          <Input
            id={`tolerance-${question.id}`}
            type="number"
            min={0}
            step="0.5"
            value={question.tolerance ?? ""}
            placeholder={String(DEFAULT_TOLERANCE_PERCENT)}
            onChange={(e) =>
              onChange({
                tolerance: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)),
              })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`sigfigs-${question.id}`}>
            Significant figures{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id={`sigfigs-${question.id}`}
            type="number"
            min={1}
            max={10}
            value={question.sigFigs ?? ""}
            placeholder="Not checked"
            onChange={(e) =>
              onChange({
                sigFigs:
                  e.target.value === ""
                    ? undefined
                    : Math.max(1, Math.round(Number(e.target.value))),
              })
            }
          />
        </div>
      </div>
    </fieldset>
  );
}
