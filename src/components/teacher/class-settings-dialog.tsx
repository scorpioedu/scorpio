"use client";

// Everything about one class in one place, one section per kind of setting: details, course, Raise
// for students, the settings new assignments start with, the join code, and archive or delete.
// Name, period and description save together (Save, in the footer); the assignment settings have
// their own Save; everything else saves at once.
import { useState, type ReactNode } from "react";
import { ArchiveRestore, Loader2 } from "lucide-react";
import { ClickIcon } from "@/components/ui/click-icon";
import { ArchiveIcon as AnimatedArchive } from "@animateicons/react/lucide/archive-icon";
import { RotateCcwIcon as AnimatedRotateCcw } from "@animateicons/react/lucide/rotate-ccw-icon";
import { Trash2Icon as AnimatedTrash2 } from "@animateicons/react/lucide/trash-2-icon";
import { toast } from "sonner";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { apiError, undoToast } from "@/lib/undo-toast";
import { getCurriculum } from "@/data/curricula";
import { AssignmentDefaultsFields } from "@/components/teacher/assignment-defaults-fields";
import { resolveAssignmentDefaults, type AssignmentDefaults } from "@/lib/assignment-defaults";
import { CourseSelect } from "@/components/teacher/course-select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ClassSettingsValue {
  id: string;
  name: string;
  period?: string;
  description?: string;
  code: string;
  archived?: boolean;
  /** The one course the class follows, or null. */
  curriculumId?: string | null;
  /** Raw stored class-wide assignment settings. */
  assignmentDefaults?: unknown;
  /** Whether students in the class may use Raise. Missing means off. */
  studentAi?: boolean;
}

async function call(path: string, method: string, body?: unknown) {
  const res = await authenticatedFetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(await apiError(res, "Could not save the change"));
  return res.json();
}

/** One titled block of the dialog; blocks are separated by a rule. */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 py-5 first:pt-4 last:pb-4">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** What a teacher should weigh before giving a class an AI assistant. Shown once, on turning it on. */
const RAISE_CAUTIONS: { title: string; text: string }[] = [
  {
    title: "It can be wrong.",
    text: "Raise is an AI model, and a hint can be misleading or incorrect.",
  },
  {
    title: "Some students lean on it.",
    text: "A hint can replace the struggle that builds understanding, and some students would rather not use AI at all.",
  },
  {
    title: "It has an environmental cost.",
    text: "Each hint uses about 0.2 Wh of electricity and up to 0.5 mL of cooling water.",
  },
  {
    title: "It spends your network's AI credit.",
    text: "A hint costs about a tenth of a cent.",
  },
  {
    title: "Questions leave Scorpio.",
    text: "What students type is sent to Google's AI model, with names and email addresses removed first.",
  },
];

export function ClassSettingsDialog({
  value,
  open,
  onOpenChange,
  onChanged,
  onDeleted,
}: {
  value: ClassSettingsValue;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: (patch: Partial<ClassSettingsValue>) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(value.name);
  const [period, setPeriod] = useState(value.period ?? "");
  const [description, setDescription] = useState(value.description ?? "");
  const [busy, setBusy] = useState<"" | "save" | "code" | "archive" | "course" | "defaults" | "ai">(
    "",
  );
  const [confirm, setConfirm] = useState<"" | "code" | "delete" | "ai">("");
  const [defaults, setDefaults] = useState<AssignmentDefaults>(() =>
    resolveAssignmentDefaults(value.assignmentDefaults),
  );
  const path = `/api/courses/${encodeURIComponent(value.id)}`;
  const dirty =
    name.trim() !== value.name ||
    period.trim() !== (value.period ?? "") ||
    description.trim() !== (value.description ?? "");

  const reset = (next: boolean) => {
    if (next) {
      setName(value.name);
      setPeriod(value.period ?? "");
      setDescription(value.description ?? "");
    }
    onOpenChange(next);
  };

  const save = async () => {
    if (!name.trim()) return toast.error("A class needs a name.");
    setBusy("save");
    try {
      const patch = {
        name: name.trim(),
        period: period.trim() || null,
        description: description.trim() || null,
      };
      await call(path, "PATCH", patch);
      onChanged({
        name: patch.name,
        period: patch.period ?? "",
        description: patch.description ?? "",
      });
      toast.success("Class saved");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy("");
    }
  };

  /** The class's assignment settings save on their own button; new assignments in the class start from them. */
  const saveDefaults = async () => {
    setBusy("defaults");
    try {
      const result = await call(`${path}/assignment-defaults`, "PATCH", {
        assignmentDefaults: {
          ...defaults,
          allowAIHelp: defaults.allowAIHelp && value.studentAi === true,
        },
      });
      onChanged({ assignmentDefaults: result.assignmentDefaults });
      toast.success("Assignment settings saved. New assignments in this class will use them.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the settings");
    } finally {
      setBusy("");
    }
  };

  /** The course saves at once (like the join code), with Undo. */
  const setCourse = async (curriculumId: string | null) => {
    const before = value.curriculumId ?? null;
    if (curriculumId === before) return;
    const change = async (next: string | null) => {
      await call(`${path}/curriculum`, "PATCH", { curriculumId: next });
      onChanged({ curriculumId: next });
    };
    const label = (id: string | null) => getCurriculum(id)?.name ?? "no course";
    setBusy("course");
    try {
      await change(curriculumId);
      undoToast(
        curriculumId
          ? `"${value.name}" now follows ${label(curriculumId)}. Sets already assigned are kept.`
          : `"${value.name}" follows no course now. Its assignments are unchanged.`,
        () => change(before),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change the course");
    } finally {
      setBusy("");
    }
  };

  /** Raise for the class's students saves at once, with Undo. */
  const setStudentAi = async (studentAi: boolean) => {
    const change = async (next: boolean) => {
      await call(path, "PATCH", { studentAi: next });
      onChanged({ studentAi: next });
      // Hints cannot stay allowed in a class without Raise; the server clears the stored setting too.
      if (!next) setDefaults((cur) => ({ ...cur, allowAIHelp: false }));
    };
    setBusy("ai");
    try {
      await change(studentAi);
      undoToast(
        studentAi
          ? `Raise is on for students in "${value.name}".`
          : `Raise is off for students in "${value.name}".`,
        () => change(!studentAi),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change the setting");
    } finally {
      setBusy("");
    }
  };

  const regenerate = async () => {
    setBusy("code");
    try {
      const { code } = await call(`${path}/code`, "POST");
      onChanged({ code });
      toast.success(`New join code: ${code}. Students already in the class stay in it.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not make a new code");
    } finally {
      setBusy("");
    }
  };

  const setArchived = async (archived: boolean) => {
    setBusy("archive");
    try {
      await call(path, "PATCH", { archived });
      onChanged({ archived });
      onOpenChange(false);
      undoToast(archived ? `"${value.name}" archived` : `"${value.name}" restored`, async () => {
        await call(path, "PATCH", { archived: !archived });
        onChanged({ archived: !archived });
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change the class");
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    try {
      await call(path, "DELETE");
      toast.success(`"${value.name}" deleted`);
      onOpenChange(false);
      onDeleted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the class");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={reset}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0 sm:max-w-xl">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Class settings</DialogTitle>
            <DialogDescription>{value.name}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 divide-y overflow-y-auto px-6">
            <Section title="Details">
              <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                <div className="space-y-1.5">
                  <Label htmlFor="class-name">Name</Label>
                  <Input
                    id="class-name"
                    value={name}
                    maxLength={120}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="class-period">Period</Label>
                  <Input
                    id="class-period"
                    value={period}
                    maxLength={40}
                    placeholder="e.g. 5"
                    onChange={(e) => setPeriod(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="class-description">
                  Description <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="class-description"
                  rows={2}
                  maxLength={2000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </Section>

            <Section
              title="Course"
              description="A class follows one course, or none. Changing it saves at once and keeps every assignment; sets from the old course show under Other assignments."
            >
              <CourseSelect
                id="class-course"
                value={value.curriculumId ?? null}
                onChange={(id) => void setCourse(id)}
                disabled={busy !== ""}
              />
            </Section>

            <Section title="Raise for students">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="class-student-ai">Let students in this class use Raise</Label>
                  <p id="class-student-ai-help" className="text-xs text-muted-foreground">
                    Off unless you turn it on. When on, students can ask Raise, an AI assistant, for
                    hints and explanations. Study, lessons and marking never use AI.
                  </p>
                </div>
                <Switch
                  id="class-student-ai"
                  checked={value.studentAi === true}
                  disabled={busy !== ""}
                  // Turning it on asks first; turning it off is immediate.
                  onCheckedChange={(on) => (on ? setConfirm("ai") : void setStudentAi(false))}
                  aria-describedby="class-student-ai-help"
                  className="mt-0.5"
                />
              </div>
            </Section>

            <Section
              title="New assignments start with"
              description="Settings for assignments you make in this class from now on. You can still change one assignment, and existing ones are not touched."
            >
              <AssignmentDefaultsFields
                idPrefix="class-defaults"
                value={defaults}
                onChange={setDefaults}
                raiseOn={value.studentAi === true}
              />
              <div className="flex justify-end">
                <Button variant="outline" size="sm" disabled={!!busy} onClick={saveDefaults}>
                  {busy === "defaults" && <Loader2 className="animate-spin" />} Save assignment
                  settings
                </Button>
              </div>
            </Section>

            <Section
              title="Join code"
              description="Students join the class with this code. A new code stops the old one working; students already in the class stay in it."
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-sm font-semibold tracking-wide">{value.code}</p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!!busy}
                  onClick={() => setConfirm("code")}
                >
                  {busy === "code" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <ClickIcon icon={AnimatedRotateCcw} />
                  )}{" "}
                  New code
                </Button>
              </div>
            </Section>

            <Section
              title={value.archived ? "Restore or delete" : "Archive or delete"}
              description="Archiving hides the class from your lists and keeps everything. Deleting cannot be undone."
            >
              <div className="flex flex-wrap gap-2">
                {value.archived ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!busy}
                    onClick={() => setArchived(false)}
                  >
                    <ArchiveRestore /> Restore class
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!busy}
                    onClick={() => setArchived(true)}
                  >
                    <ClickIcon icon={AnimatedArchive} /> Archive class
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={!!busy}
                  onClick={() => setConfirm("delete")}
                >
                  <ClickIcon icon={AnimatedTrash2} /> Delete class
                </Button>
              </div>
            </Section>
          </div>
          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" onClick={() => reset(false)}>
              Close
            </Button>
            <Button onClick={save} disabled={!dirty || !!busy}>
              {busy === "save" && <Loader2 className="animate-spin" />} Save details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirm === "ai"} onOpenChange={(o) => !o && setConfirm("")}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Turn on Raise for this class?</DialogTitle>
            <DialogDescription>
              Students in &ldquo;{value.name}&rdquo; will be able to ask an AI assistant for hints
              and explanations. Before you turn it on:
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2.5 text-sm">
            {RAISE_CAUTIONS.map(({ title, text }) => (
              <li key={title} className="flex gap-2.5">
                <span
                  aria-hidden
                  className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/60"
                />
                <span>
                  <span className="font-medium text-foreground">{title}</span>{" "}
                  <span className="text-muted-foreground">{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Raise stays optional for students, and you can turn it off here at any time.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm("")}>
              Keep it off
            </Button>
            <Button
              onClick={() => {
                setConfirm("");
                void setStudentAi(true);
              }}
            >
              Turn on Raise
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirm === "code"}
        onOpenChange={(o) => !o && setConfirm("")}
        variant="default"
        title="Make a new join code?"
        description={`The code ${value.code} and its invite link stop working. Students already in the class stay in it.`}
        confirmText="Make a new code"
        onConfirm={regenerate}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm("")}
        title={`Delete "${value.name}"?`}
        description="Students lose the class and its join code stops working. Assignments and student work are kept. This cannot be undone; archiving hides the class instead."
        confirmText="Delete class"
        onConfirm={remove}
      />
    </>
  );
}
