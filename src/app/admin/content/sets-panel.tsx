"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { CURRICULA, displayTitle } from "@/data/curricula";
import { CONTENT_FILES } from "@/data/curricula/content-files";
import { setReadyToPublish, type DraftState } from "@/lib/curriculum-roadmap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SetStatus {
  key: string;
  title: string;
  topics: string[];
  assignmentId: string | null;
  drafts: { id: string; state: DraftState }[];
}

const LABEL: Record<DraftState, string> = {
  draft: "Draft",
  "ai-reviewed": "AI-reviewed",
  "human-approved": "Human-approved",
  published: "Published",
  rejected: "Rejected",
  missing: "Missing",
};

/** Count of drafts per state, in a stable order, e.g. "3 human-approved, 2 AI-reviewed". */
function summary(drafts: SetStatus["drafts"]) {
  const counts = new Map<DraftState, number>();
  for (const d of drafts) counts.set(d.state, (counts.get(d.state) ?? 0) + 1);
  return (Object.keys(LABEL) as DraftState[])
    .filter((s) => counts.has(s))
    .map((s) => `${counts.get(s)} ${LABEL[s].toLowerCase()}`)
    .join(", ");
}

export function SetsPanel() {
  // /admin/content?tab=sets&course=ap-physics-2 opens on that course.
  const [curriculumId, setCurriculumId] = useState(() => {
    const asked =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("course")
        : null;
    return CURRICULA.find((c) => c.id === asked)?.id ?? CURRICULA[0].id;
  });
  const curriculum = CURRICULA.find((c) => c.id === curriculumId) ?? CURRICULA[0];
  const [sets, setSets] = useState<SetStatus[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setSets(null);
    try {
      const res = await authenticatedFetch(`/api/admin/content/sets?curriculumId=${curriculum.id}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setSets(body.sets);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load the sets");
      setSets([]);
    }
  }, [curriculum.id]);
  useEffect(() => {
    load();
  }, [load]);

  async function publish(key: string) {
    setBusy(key);
    setErrors((cur) => ({ ...cur, [key]: "" }));
    try {
      const res = await authenticatedFetch("/api/admin/content/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ curriculumId: curriculum.id, setKey: key }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Publish failed");
      toast.success(`Set ${key} published to Waypoints`);
      await load();
    } catch (e) {
      setErrors((cur) => ({ ...cur, [key]: e instanceof Error ? e.message : "Publish failed" }));
    } finally {
      setBusy(null);
    }
  }

  const picker = (
    <div className="flex flex-wrap items-center gap-2">
      <Label htmlFor="sets-course" className="text-sm">
        Course
      </Label>
      <Select value={curriculum.id} onValueChange={setCurriculumId}>
        <SelectTrigger id="sets-course" className="w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CURRICULA.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  if (sets === null)
    return (
      <div className="space-y-4">
        {picker}
        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      </div>
    );

  const allDrafts = curriculum.sets.flatMap(
    (def) =>
      sets.find((x) => x.key === def.key)?.drafts ??
      def.draftIds.map((id) => ({ id, state: "missing" as const })),
  );
  const missing = allDrafts.filter((d) => d.state === "missing").length;
  const aiOnly = allDrafts.filter((d) => d.state === "ai-reviewed").length;

  const planned = curriculum.sets.filter((s) => s.draftIds.length === 0).length;
  const files = CONTENT_FILES[curriculum.id] ?? [];

  return (
    <div className="space-y-4">
      {picker}
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 py-4">
          <CardTitle>{curriculum.name}: sets in teaching order</CardTitle>
          <CardDescription>
            A set can be published once every problem in it is approved. AI-reviewed problems still
            need a person&apos;s approval first: outside the local emulator the server refuses them
            and says so.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {(missing > 0 || aiOnly > 0) && (
            <div
              role="status"
              className="space-y-2 border-t border-border bg-muted/40 px-5 py-4 text-sm"
            >
              {missing > 0 && (
                <>
                  <p className="font-medium">
                    {missing} of {allDrafts.length} problems are not in this project yet.
                  </p>
                  <p className="text-muted-foreground">
                    Teachers see these sets as “Not published yet”. Import the reviewed drafts from
                    the repo (a dry run unless you add <code>--apply</code>; it never publishes):
                  </p>
                  <pre className="overflow-x-auto rounded-lg border border-border bg-background p-3 text-xs">
                    {files
                      .map(
                        (f) =>
                          `node tools/content-drafts.cjs import --project <project-id> --file ${f}`,
                      )
                      .join("\n")}
                  </pre>
                </>
              )}
              {aiOnly > 0 && (
                <p className="text-muted-foreground">
                  {aiOnly} problems are AI-reviewed only. Open each on the Approved tab, check the
                  answer key and the misconception tags, and approve it yourself; then Publish set
                  works here.
                </p>
              )}
            </div>
          )}
          {planned > 0 && (
            <p role="status" className="border-t border-border bg-muted/40 px-5 py-3 text-sm">
              {planned} of {curriculum.sets.length} sets are planned: their problems are not written
              yet.
            </p>
          )}
          <ul className="divide-y divide-border border-t border-border">
            {curriculum.sets.map((def) => {
              const s = sets.find((x) => x.key === def.key);
              const drafts =
                s?.drafts ?? def.draftIds.map((id) => ({ id, state: "missing" as const }));
              const published = !!s?.assignmentId;
              const ready = !published && setReadyToPublish(drafts.map((d) => d.state));
              return (
                <li key={def.key} className="space-y-2 px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 break-words font-medium">
                      {displayTitle(def, curriculum.name)}
                    </p>
                    {published ? (
                      <Badge variant="secondary">Published</Badge>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => publish(def.key)}
                        disabled={!ready || busy !== null}
                      >
                        {busy === def.key && <Loader2 className="animate-spin" />}
                        Publish set
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {def.topics.join(", ")} · {drafts.length} problems · {summary(drafts)}
                  </p>
                  <div
                    className="flex flex-wrap gap-1"
                    aria-label={`Problem states for set ${def.key}`}
                  >
                    {drafts.map((d) => (
                      <Badge
                        key={d.id}
                        variant={
                          d.state === "human-approved" || d.state === "published"
                            ? "secondary"
                            : "outline"
                        }
                        className={
                          d.state === "ai-reviewed"
                            ? "border-amber-500 text-amber-700 dark:text-amber-400"
                            : d.state === "missing" || d.state === "rejected"
                              ? "border-destructive text-destructive"
                              : ""
                        }
                        title={d.id}
                      >
                        {LABEL[d.state]}
                      </Badge>
                    ))}
                  </div>
                  {errors[def.key] && (
                    <p role="alert" className="text-xs text-destructive">
                      {errors[def.key]}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
