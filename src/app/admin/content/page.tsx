"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { useAdminAccess } from "@/lib/use-admin-access";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { AP_UNITS, apTopicLabel, apUnit as findUnit, MISCONCEPTION_TAGS } from "@/data/ap";
import type { DraftProblem } from "@/lib/content/problem-format";
import type { DraftStatus } from "@/lib/content/drafts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MarkdownRenderer } from "@/components/markdown-renderer";

interface Draft {
  id: string;
  apUnit: number;
  apTopic: string;
  status: DraftStatus;
  problem: DraftProblem | null;
  original: unknown;
  errors: string[];
  warnings: string[];
  check: { answer: string; agrees: boolean; reasoning: string } | null;
  edited: boolean;
  createdAt: string | null;
  reviewNote?: string | null;
  reviewKind?: "human" | "ai" | null;
  assignmentId?: string | null;
}

const TAG_OPTIONS = MISCONCEPTION_TAGS.filter(
  (t) => t.category === "conceptual" && t.id !== "other",
);

function emptyProblem(d: Draft): DraftProblem {
  return {
    text: "",
    type: "numeric",
    correctAnswer: "",
    solution: "",
    distractors: [],
    difficulty: "medium",
    points: 10,
    apTopic: d.apTopic,
  };
}

function DraftEditor({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const [p, setP] = useState<DraftProblem>(draft.problem ?? emptyProblem(draft));
  const [note, setNote] = useState(draft.reviewNote ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>(draft.errors);
  const frozen = draft.status === "published";
  const keyChanged = draft.problem && p.correctAnswer !== draft.problem.correctAnswer;

  const set = <K extends keyof DraftProblem>(k: K, v: DraftProblem[K]) =>
    setP((cur) => ({ ...cur, [k]: v }));

  const act = async (action: "save" | "approve" | "reject" | "reopen") => {
    setBusy(action);
    try {
      const res = await authenticatedFetch("/api/admin/content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draft.id,
          action,
          note,
          ...(action === "save" || action === "approve" ? { problem: p } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setErrors(body.errors || [body.error || "Failed"]);
        toast.error(body.error || "Failed");
        return;
      }
      setErrors(body.draft.errors || []);
      onChange(body.draft);
      toast.success(
        action === "approve"
          ? "Approved"
          : action === "reject"
            ? "Rejected"
            : action === "reopen"
              ? "Reopened"
              : "Saved",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div className="space-y-1">
          <CardTitle className="text-base">{apTopicLabel(draft.apTopic)}</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline">{p.type === "numeric" ? "Numeric" : "Multiple choice"}</Badge>
            <Badge variant="outline">{p.difficulty}</Badge>
            <Badge
              variant={
                draft.status === "approved" || draft.status === "published"
                  ? "default"
                  : "secondary"
              }
            >
              {draft.status}
            </Badge>
            {draft.edited && <Badge variant="secondary">edited</Badge>}
            {draft.reviewKind === "ai" && draft.status === "approved" && (
              <Badge
                variant="outline"
                className="border-amber-500/50 text-amber-700 dark:text-amber-400"
              >
                AI-reviewed: needs your check
              </Badge>
            )}
            <span className="text-muted-foreground">{draft.id}</span>
          </CardDescription>
        </div>
        {draft.check && (
          <div
            className={`flex max-w-md items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
              draft.check.agrees
                ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                : "border-amber-500/50 text-amber-700 dark:text-amber-400"
            }`}
          >
            {draft.check.agrees ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            ) : (
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            )}
            <div className="space-y-1">
              <p className="font-medium">
                {draft.check.agrees ? "Independent solve agrees" : "Independent solve disagrees"}:{" "}
                {draft.check.answer || "no answer"}
              </p>
              {keyChanged && <p>You changed the key; this check was against the original.</p>}
              {draft.check.reasoning && (
                <details>
                  <summary className="cursor-pointer">Checker&apos;s working</summary>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                    {draft.check.reasoning}
                  </p>
                </details>
              )}
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="grid gap-5 border-t px-5 py-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`text-${draft.id}`}>Problem</Label>
            <Textarea
              id={`text-${draft.id}`}
              rows={6}
              value={p.text}
              disabled={frozen}
              onChange={(e) => set("text", e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor={`type-${draft.id}`}>Type</Label>
              <Select
                value={p.type}
                disabled={frozen}
                onValueChange={(v) => set("type", v as DraftProblem["type"])}
              >
                <SelectTrigger id={`type-${draft.id}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="numeric">Numeric</SelectItem>
                  <SelectItem value="multiple-choice">Multiple choice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`diff-${draft.id}`}>Difficulty</Label>
              <Select
                value={p.difficulty}
                disabled={frozen}
                onValueChange={(v) => set("difficulty", v as DraftProblem["difficulty"])}
              >
                <SelectTrigger id={`diff-${draft.id}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`pts-${draft.id}`}>Points</Label>
              <Input
                id={`pts-${draft.id}`}
                type="number"
                min={1}
                max={100}
                value={p.points}
                disabled={frozen}
                onChange={(e) => set("points", Number(e.target.value) || 10)}
              />
            </div>
          </div>
          {p.type === "multiple-choice" && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Options (select the right one)</legend>
              {(p.options ?? []).map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="radio"
                    aria-label={`Option ${i + 1} is correct`}
                    name={`correct-${draft.id}`}
                    checked={o === p.correctAnswer}
                    disabled={frozen}
                    onChange={() => set("correctAnswer", o)}
                  />
                  <Input
                    aria-label={`Option ${i + 1}`}
                    value={o}
                    disabled={frozen}
                    onChange={(e) => {
                      const options = [...(p.options ?? [])];
                      const wasKey = options[i] === p.correctAnswer;
                      options[i] = e.target.value;
                      setP((cur) => ({
                        ...cur,
                        options,
                        correctAnswer: wasKey ? e.target.value : cur.correctAnswer,
                        distractors: cur.distractors.map((d) =>
                          d.answer === o ? { ...d, answer: e.target.value } : d,
                        ),
                      }));
                    }}
                  />
                </div>
              ))}
              {!frozen && (p.options?.length ?? 0) < 6 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => set("options", [...(p.options ?? []), ""])}
                >
                  <Plus /> Option
                </Button>
              )}
            </fieldset>
          )}
          {p.type === "numeric" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`key-${draft.id}`}>Answer key (value and unit)</Label>
                <Input
                  id={`key-${draft.id}`}
                  value={p.correctAnswer}
                  disabled={frozen}
                  onChange={(e) => set("correctAnswer", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`tol-${draft.id}`}>Tolerance % (blank = 3)</Label>
                <Input
                  id={`tol-${draft.id}`}
                  type="number"
                  min={0}
                  max={20}
                  value={p.tolerance ?? ""}
                  disabled={frozen}
                  onChange={(e) =>
                    set("tolerance", e.target.value === "" ? undefined : Number(e.target.value))
                  }
                />
              </div>
            </div>
          )}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Common wrong answers → misconception</legend>
            {p.distractors.map((d, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label={`Wrong answer ${i + 1}`}
                  className="w-40"
                  value={d.answer}
                  disabled={frozen}
                  onChange={(e) =>
                    set(
                      "distractors",
                      p.distractors.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)),
                    )
                  }
                />
                <Select
                  value={d.misconception}
                  disabled={frozen}
                  onValueChange={(v) =>
                    set(
                      "distractors",
                      p.distractors.map((x, j) => (j === i ? { ...x, misconception: v } : x)),
                    )
                  }
                >
                  <SelectTrigger
                    aria-label={`Misconception for wrong answer ${i + 1}`}
                    className="min-w-0 flex-1"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAG_OPTIONS.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!frozen && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove"
                    onClick={() =>
                      set(
                        "distractors",
                        p.distractors.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            ))}
            {!frozen && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  set("distractors", [
                    ...p.distractors,
                    { answer: "", misconception: TAG_OPTIONS[0].id },
                  ])
                }
              >
                <Plus /> Wrong answer
              </Button>
            )}
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor={`sol-${draft.id}`}>Worked solution (reviewer only)</Label>
            <Textarea
              id={`sol-${draft.id}`}
              rows={6}
              value={p.solution}
              disabled={frozen}
              onChange={(e) => set("solution", e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Student preview</p>
            <div className="rounded-lg border bg-muted/30 p-4 text-sm">
              <MarkdownRenderer>{p.text || "_No text_"}</MarkdownRenderer>
              {p.type === "multiple-choice" && (
                <ol className="mt-3 list-[upper-alpha] space-y-1 pl-6">
                  {(p.options ?? []).map((o, i) => (
                    <li key={i} className={o === p.correctAnswer ? "font-semibold" : ""}>
                      {o}
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-3 text-xs text-muted-foreground">Key: {p.correctAnswer || "none"}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Solution preview</p>
            <div className="rounded-lg border p-4 text-sm">
              <MarkdownRenderer>{p.solution || "_No solution_"}</MarkdownRenderer>
            </div>
          </div>
          {(errors.length > 0 || draft.warnings.length > 0) && (
            <div className="space-y-1 text-sm">
              {errors.map((e) => (
                <p key={e} className="flex gap-2 text-destructive">
                  <XCircle className="mt-0.5 size-4 shrink-0" />
                  {e}
                </p>
              ))}
              {draft.warnings.map((w) => (
                <p key={w} className="flex gap-2 text-amber-700 dark:text-amber-400">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  {w}
                </p>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`note-${draft.id}`}>Review note</Label>
            <Textarea
              id={`note-${draft.id}`}
              rows={2}
              value={note}
              disabled={frozen}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {frozen ? (
            <p className="text-sm text-muted-foreground">
              Published in assignment {draft.assignmentId}.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => act("approve")} disabled={!!busy}>
                {busy === "approve" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} I
                checked the answer: approve
              </Button>
              <Button variant="outline" onClick={() => act("save")} disabled={!!busy}>
                Save edits
              </Button>
              {draft.status === "draft" ? (
                <Button variant="ghost" onClick={() => act("reject")} disabled={!!busy}>
                  Reject
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => act("reopen")} disabled={!!busy}>
                  Back to draft
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ContentReviewPage() {
  const access = useAdminAccess();
  const [status, setStatus] = useState<DraftStatus>("draft");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(false);
  const [unit, setUnit] = useState("4");
  const [topic, setTopic] = useState("4.1");
  const [count, setCount] = useState(3);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authenticatedFetch(`/api/admin/content?status=${status}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setDrafts(body.drafts);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load drafts");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (access === "admin") load();
  }, [access, load]);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await authenticatedFetch("/api/admin/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apTopic: topic, count }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Generation failed");
      toast.success(`${body.drafts.length} drafts ready for review`);
      if (status === "draft") setDrafts((cur) => [...body.drafts, ...cur]);
      else setStatus("draft");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    try {
      const res = await authenticatedFetch("/api/admin/content/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftIds: selected, title }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Publish failed");
      toast.success("Published to Waypoints");
      setSelected([]);
      setTitle("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const selectedUnits = useMemo(
    () => new Set(drafts.filter((d) => selected.includes(d.id)).map((d) => d.apUnit)),
    [drafts, selected],
  );

  if (access !== "admin") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground">
        {access === "loading" ? "Checking your account…" : "Administrator access is required."}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <div className="space-y-2 border-b pb-5">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Admin
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Content review</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          AI drafts AP Physics 1 problems and a second AI call solves each one without the key. A
          person checks every answer here before it goes live. Solve it yourself; don&apos;t approve
          on the checker&apos;s word alone.
        </p>
      </div>

      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-wrap items-end gap-3 px-5 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="gen-unit">Unit</Label>
            <Select
              value={unit}
              onValueChange={(v) => {
                setUnit(v);
                setTopic(`${v}.1`);
              }}
            >
              <SelectTrigger id="gen-unit" className="w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AP_UNITS.map((u) => (
                  <SelectItem key={u.unit} value={String(u.unit)}>
                    Unit {u.unit}: {u.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gen-topic">Topic</Label>
            <Select value={topic} onValueChange={setTopic}>
              <SelectTrigger id="gen-topic" className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {findUnit(Number(unit))?.topics.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.id} {t.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gen-count">How many</Label>
            <Input
              id="gen-count"
              type="number"
              min={1}
              max={5}
              className="w-20"
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(5, Number(e.target.value) || 1)))}
            />
          </div>
          <Button onClick={generate} disabled={generating}>
            {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {generating ? "Drafting and checking…" : "Draft problems"}
          </Button>
        </CardHeader>
      </Card>

      <Tabs
        value={status}
        onValueChange={(v) => {
          setStatus(v as DraftStatus);
          setSelected([]);
        }}
      >
        <TabsList>
          <TabsTrigger value="draft">To review</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="published">Published</TabsTrigger>
        </TabsList>
      </Tabs>

      {status === "approved" && drafts.length > 0 && (
        <Card className="gap-0 py-0">
          <CardHeader className="flex flex-wrap items-end gap-3 px-5 py-4">
            <div className="min-w-64 flex-1 space-y-1.5">
              <Label htmlFor="pub-title">Publish selected as a Waypoints assignment</Label>
              <Input
                id="pub-title"
                placeholder="e.g. Momentum and impulse practice"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <Button
              onClick={publish}
              disabled={
                publishing || !title.trim() || selected.length === 0 || selectedUnits.size > 1
              }
            >
              {publishing && <Loader2 className="animate-spin" />}
              Publish {selected.length || ""}
            </Button>
            {selectedUnits.size > 1 && (
              <p className="w-full text-xs text-destructive">Select problems from one unit only.</p>
            )}
          </CardHeader>
        </Card>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      ) : drafts.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <ul className="space-y-4">
          {drafts.map((d) => (
            <li key={d.id} className="flex gap-3">
              {status === "approved" && (
                <Checkbox
                  className="mt-5"
                  aria-label={`Select ${d.id}`}
                  checked={selected.includes(d.id)}
                  onCheckedChange={(c) =>
                    setSelected((cur) =>
                      c === true ? [...cur, d.id] : cur.filter((x) => x !== d.id),
                    )
                  }
                />
              )}
              <div className="min-w-0 flex-1">
                <DraftEditor
                  key={`${d.id}-${d.status}`}
                  draft={d}
                  onChange={(next) =>
                    setDrafts((cur) =>
                      next.status !== status
                        ? cur.filter((x) => x.id !== next.id)
                        : cur.map((x) => (x.id === next.id ? next : x)),
                    )
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
