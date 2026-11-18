"use client";

// Assignment options, student tools, grading and sharing: one value object in, changes out.
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_AP_COURSE, apUnit as findApUnit, apUnitKey, parseApUnitKey } from "@/data/ap";
import { ApUnitSelectItems } from "@/components/ap-unit-select-items";
import type { AssignmentSettingsValue } from "./types";

export function SettingsFields({
  value,
  onChange,
  isFreePlan,
  hasNetwork,
  showSharing = true,
}: {
  value: AssignmentSettingsValue;
  onChange: (next: AssignmentSettingsValue) => void;
  isFreePlan: boolean;
  hasNetwork: boolean;
  showSharing?: boolean;
}) {
  const set = (patch: Partial<AssignmentSettingsValue>) => onChange({ ...value, ...patch });
  return (
    <>
      <section className="space-y-3 py-5" aria-labelledby="assignment-options-heading">
        <h2 id="assignment-options-heading" className="text-sm font-semibold">
          Assignment options
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="topic">Topic</Label>
            <Select value={value.topic} onValueChange={(topic) => set({ topic })}>
              <SelectTrigger id="topic" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kinematics">Kinematics</SelectItem>
                <SelectItem value="dynamics">Dynamics (Newton&apos;s Laws)</SelectItem>
                <SelectItem value="energy">Energy &amp; Momentum</SelectItem>
                <SelectItem value="thermo">Thermodynamics</SelectItem>
                <SelectItem value="em">Electricity &amp; Magnetism</SelectItem>
                <SelectItem value="waves">Waves &amp; Optics</SelectItem>
                <SelectItem value="modern">Modern Physics</SelectItem>
                <SelectItem value="other">General / Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ap-unit">AP unit</Label>
            <Select
              value={value.apUnit ? apUnitKey(value.apCourse, value.apUnit) : "none"}
              onValueChange={(v) => {
                const chosen = parseApUnitKey(v);
                set({
                  apCourse: chosen?.course ?? DEFAULT_AP_COURSE,
                  apUnit: chosen?.unit ?? null,
                  apTopics: [],
                });
              }}
            >
              <SelectTrigger id="ap-unit" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not an AP assignment</SelectItem>
                <ApUnitSelectItems />
              </SelectContent>
            </Select>
          </div>
          {value.apUnit && (
            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="text-sm font-medium">AP topics covered</legend>
              <p className="text-xs text-muted-foreground">
                Used by the misconception report and the Waypoints library filter.
              </p>
              <div className="grid gap-2 pt-1 sm:grid-cols-2">
                {findApUnit(value.apUnit, value.apCourse)?.topics.map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-start gap-2 text-sm">
                    <Checkbox
                      className="mt-0.5"
                      checked={value.apTopics.includes(t.id)}
                      onCheckedChange={(checked) =>
                        set({
                          apTopics:
                            checked === true
                              ? [...value.apTopics, t.id]
                              : value.apTopics.filter((id) => id !== t.id),
                        })
                      }
                    />
                    <span>
                      <span className="tabular-nums text-muted-foreground">{t.id}</span> {t.title}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="space-y-2">
            <Label htmlFor="timeLimit">Time limit (minutes)</Label>
            <Input
              id="timeLimit"
              type="number"
              min={0}
              placeholder="Unlimited"
              value={value.timeLimit}
              onChange={(event) =>
                set({
                  timeLimit: event.target.value === "" ? "" : parseInt(event.target.value, 10),
                })
              }
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 py-5" aria-labelledby="student-tools-heading">
        <h2 id="student-tools-heading" className="text-sm font-semibold">
          Student tools and test security
        </h2>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {[
            {
              id: "allowCalculator",
              label: "Allow calculator",
              description: "Give students an on-screen scientific calculator.",
              checked: value.allowCalculator,
              setChecked: (allowCalculator: boolean) => set({ allowCalculator }),
            },
            {
              id: "allowAIHelp",
              label: "Allow Raise hints",
              description: isFreePlan
                ? "Requires AI access."
                : "Give students guided hints as they work.",
              checked: value.allowAIHelp,
              setChecked: (allowAIHelp: boolean) => set({ allowAIHelp }),
              disabled: isFreePlan,
            },
            {
              id: "requireWork",
              label: "Require work upload",
              description: "Have students submit a photo or PDF of their work.",
              checked: value.requireWorkSubmission,
              setChecked: (requireWorkSubmission: boolean) => set({ requireWorkSubmission }),
            },
            {
              id: "enableTabDetection",
              label: "Track tab switching",
              description: "Record when students leave the assignment tab.",
              checked: value.enableTabDetection,
              setChecked: (enableTabDetection: boolean) => set({ enableTabDetection }),
            },
            {
              id: "lockdownMode",
              label: "Lockdown mode",
              description: "Require full screen and restrict copy and paste.",
              checked: value.lockdownMode,
              setChecked: (lockdownMode: boolean) => set({ lockdownMode }),
            },
          ].map(({ id, label, description, checked, setChecked, disabled }) => (
            <div key={id} className="flex items-start gap-2.5">
              <Checkbox
                id={id}
                checked={checked}
                disabled={disabled}
                onCheckedChange={(value) => setChecked(value === true)}
                aria-describedby={`${id}-help`}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor={id}>{label}</Label>
                <p id={`${id}-help`} className="text-xs text-muted-foreground">
                  {description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 py-5" aria-labelledby="grading-heading">
        <h2 id="grading-heading" className="text-sm font-semibold">
          Grading
        </h2>
        <RadioGroup
          aria-labelledby="grading-heading"
          value={value.gradingType}
          onValueChange={(v) => set({ gradingType: v as AssignmentSettingsValue["gradingType"] })}
        >
          {[
            {
              value: "ai",
              label: "Automatic",
              description:
                "Grade each submission as soon as it comes in. Multiple choice, true/false and numeric answers are checked against your key; written answers are graded by AI. Anything doubtful comes to you for review.",
            },
            {
              value: "manual",
              label: "Manual",
              description: "Submissions wait for you to grade them.",
            },
          ].map(({ value: option, label, description }) => (
            <div key={option} className="flex items-start gap-2.5">
              <RadioGroupItem
                value={option}
                id={`grading-${option}`}
                aria-describedby={`grading-${option}-help`}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor={`grading-${option}`}>{label}</Label>
                <p id={`grading-${option}-help`} className="text-xs text-muted-foreground">
                  {description}
                </p>
              </div>
            </div>
          ))}
        </RadioGroup>
      </section>

      {showSharing && (
        <section className="space-y-3 py-5" aria-labelledby="sharing-heading">
          <h2 id="sharing-heading" className="text-sm font-semibold">
            Sharing
          </h2>
          <RadioGroup
            aria-labelledby="sharing-heading"
            value={value.visibility}
            onValueChange={(v) => set({ visibility: v as AssignmentSettingsValue["visibility"] })}
          >
            {[
              {
                value: "private",
                label: "Private",
                description: "Keep this assignment out of the shared library.",
              },
              {
                value: "network",
                label: "School network",
                description: hasNetwork
                  ? "Share a copy with teachers in your network."
                  : "Requires a school network.",
                disabled: !hasNetwork,
              },
              {
                value: "global",
                label: "Global Waypoint",
                description: "Make a copy available in the shared Waypoints library.",
              },
            ].map(({ value: option, label, description, disabled }) => (
              <div key={option} className="flex items-start gap-2.5">
                <RadioGroupItem
                  value={option}
                  id={`visible-${option}`}
                  disabled={disabled}
                  aria-describedby={`visible-${option}-help`}
                  className="mt-0.5"
                />
                <div className="space-y-1">
                  <Label htmlFor={`visible-${option}`}>{label}</Label>
                  <p id={`visible-${option}-help`} className="text-xs text-muted-foreground">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </RadioGroup>
        </section>
      )}
    </>
  );
}
