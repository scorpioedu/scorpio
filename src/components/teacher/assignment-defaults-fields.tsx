"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_TIME_LIMIT_MINUTES, type AssignmentDefaults } from "@/lib/assignment-defaults";

const TOGGLES: {
  key:
    | "allowCalculator"
    | "allowAIHelp"
    | "requireWorkSubmission"
    | "enableTabDetection"
    | "lockdownMode";
  label: string;
  description: string;
}[] = [
  {
    key: "allowCalculator",
    label: "Allow calculator",
    description: "Give students an on-screen scientific calculator.",
  },
  {
    key: "allowAIHelp",
    label: "Allow Raise hints",
    description: "Give students guided hints as they work. Only when Raise is on for the class.",
  },
  {
    key: "requireWorkSubmission",
    label: "Require work upload",
    description: "Have students submit a photo or PDF of their work.",
  },
  {
    key: "enableTabDetection",
    label: "Track tab switching",
    description: "Record when students leave the assignment tab.",
  },
  {
    key: "lockdownMode",
    label: "Lockdown mode",
    description: "Require full screen and restrict copy and paste.",
  },
];

/** The settings every assignment in a class starts with; `idPrefix` keeps ids unique when several are on a page. */
export function AssignmentDefaultsFields({
  value,
  onChange,
  idPrefix,
}: {
  value: AssignmentDefaults;
  onChange: (next: AssignmentDefaults) => void;
  idPrefix: string;
}) {
  const set = (patch: Partial<AssignmentDefaults>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-time`}>Time limit (minutes)</Label>
          <Input
            id={`${idPrefix}-time`}
            type="number"
            min={1}
            max={MAX_TIME_LIMIT_MINUTES}
            placeholder="Unlimited"
            value={value.timeLimit ?? ""}
            onChange={(event) => {
              const minutes = parseInt(event.target.value, 10);
              set({
                timeLimit:
                  Number.isFinite(minutes) && minutes > 0
                    ? Math.min(minutes, MAX_TIME_LIMIT_MINUTES)
                    : null,
              });
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-grading`}>Grading</Label>
          <select
            id={`${idPrefix}-grading`}
            value={value.gradingType}
            onChange={(event) =>
              set({ gradingType: event.target.value === "manual" ? "manual" : "ai" })
            }
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          >
            <option value="ai">Automatic</option>
            <option value="manual">Manual</option>
          </select>
        </div>
      </div>
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {TOGGLES.map(({ key, label, description }) => {
          const id = `${idPrefix}-${key}`;
          return (
            <div key={key} className="flex items-start gap-2.5">
              <Checkbox
                id={id}
                checked={value[key]}
                onCheckedChange={(checked) => set({ [key]: checked === true })}
                aria-describedby={`${id}-help`}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <Label htmlFor={id}>{label}</Label>
                <p id={`${id}-help`} className="text-xs text-muted-foreground">
                  {description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
