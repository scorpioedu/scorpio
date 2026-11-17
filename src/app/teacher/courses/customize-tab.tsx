"use client";

// Customize: the class's own order of units and sets, and the sets it skips.
import { useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp } from "lucide-react";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { apUnit } from "@/data/ap";
import { curriculumSet, getCurriculum } from "@/data/curricula";
import {
  defaultOrder,
  isDefaultPlan,
  keyUnit,
  moveSet,
  moveUnit,
  toggleSkipped,
  unitOrder,
  type CurriculumPlan,
} from "@/lib/curriculum-plan";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function CustomizeTab({
  classId,
  className,
  curriculumId,
  saved,
  assignedKeys,
  onSaved,
}: {
  classId: string;
  className: string;
  curriculumId: string;
  saved: CurriculumPlan;
  assignedKeys: ReadonlySet<string>;
  onSaved: (plan: CurriculumPlan | null) => void;
}) {
  const [plan, setPlan] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty =
    plan.order.join() !== saved.order.join() || plan.skipped.join() !== saved.skipped.join();
  const units = unitOrder(plan.order);

  async function save(next: CurriculumPlan | null) {
    setBusy(true);
    setError("");
    try {
      const res = await authenticatedFetch(`/api/courses/${encodeURIComponent(classId)}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save the order.");
      onSaved(body.plan ?? null);
      setPlan(body.plan ?? { order: defaultOrder(curriculumId), skipped: [] });
      toast.success(
        body.plan ? `Saved for ${className}.` : `${className} follows the course as written.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the order.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Order and skipped sets for {className}</CardTitle>
        <CardDescription>
          Move a unit earlier or later, change the order of sets inside a unit, or skip sets you do
          not teach. This changes the roadmap, “next unit” and the pacing guide for this class only.
          Sets already assigned stay assigned.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-3">
          {units.map((unit, ui) => {
            const keys = plan.order.filter((k) => keyUnit(k) === unit);
            return (
              <li key={unit} className="rounded-xl border border-border">
                <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2">
                  <p className="min-w-0 break-words text-sm font-semibold">
                    <span className="text-muted-foreground">{ui + 1}.</span> Unit {unit}:{" "}
                    {apUnit(unit, getCurriculum(curriculumId)?.apCourse)?.title}
                  </p>
                  <span className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Move unit ${unit} earlier`}
                      disabled={ui === 0}
                      onClick={() => setPlan({ ...plan, order: moveUnit(plan.order, unit, -1) })}
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Move unit ${unit} later`}
                      disabled={ui === units.length - 1}
                      onClick={() => setPlan({ ...plan, order: moveUnit(plan.order, unit, 1) })}
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                  </span>
                </div>
                <ul className="divide-y divide-border text-sm">
                  {keys.map((key, si) => {
                    const skipped = plan.skipped.includes(key);
                    return (
                      <li
                        key={key}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
                      >
                        <span
                          className={`min-w-0 break-words ${skipped ? "text-muted-foreground line-through" : ""}`}
                        >
                          {key} · {curriculumSet(curriculumId, key)?.title}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <label className="mr-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <Checkbox
                              checked={skipped}
                              onCheckedChange={() => setPlan(toggleSkipped(plan, key))}
                              aria-label={`Skip ${key}`}
                            />
                            Skip{assignedKeys.has(key) ? " (already assigned)" : ""}
                          </label>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Move ${key} earlier`}
                            disabled={si === 0}
                            onClick={() =>
                              setPlan({ ...plan, order: moveSet(plan.order, key, -1) })
                            }
                          >
                            <ArrowUp aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Move ${key} later`}
                            disabled={si === keys.length - 1}
                            onClick={() => setPlan({ ...plan, order: moveSet(plan.order, key, 1) })}
                          >
                            <ArrowDown aria-hidden />
                          </Button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => save(plan)} disabled={busy || !dirty}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
          {dirty && (
            <Button variant="outline" onClick={() => setPlan(saved)} disabled={busy}>
              Discard changes
            </Button>
          )}
          {!isDefaultPlan(curriculumId, saved) && (
            <Button variant="ghost" onClick={() => save(null)} disabled={busy}>
              Reset to the course as written
            </Button>
          )}
          {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        </div>
      </CardContent>
    </Card>
  );
}
