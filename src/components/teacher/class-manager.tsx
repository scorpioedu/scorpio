"use client";

import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Copy, Link2, PlusCircle, RotateCcw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useSelectedClass } from "@/contexts/selected-class-context";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { classInvitePath } from "@/lib/onboarding-links";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AssignmentDefaultsFields } from "@/components/teacher/assignment-defaults-fields";
import { BASE_ASSIGNMENT_DEFAULTS, type AssignmentDefaults } from "@/lib/assignment-defaults";
import { ClassSettingsDialog } from "@/components/teacher/class-settings-dialog";
import { CourseSelect } from "@/components/teacher/course-select";

export interface TeacherClass {
  id: string;
  name: string;
  code: string;
  teacherId: string;
  period?: string;
  description?: string;
  archivedAt?: string | null;
  /** The one course (roadmap) the class follows, if any. */
  curriculumId?: string | null;
  /** Raw stored class-wide assignment settings; read with parseAssignmentDefaults. */
  assignmentDefaults?: unknown;
  /** Whether students in the class may use Raise. Missing means off. */
  studentAi?: boolean;
}

export async function copyClassInvite(course: Pick<TeacherClass, "code">, link: boolean) {
  const text = link
    ? new URL(classInvitePath(course.code), window.location.origin).href
    : course.code;
  try {
    await navigator.clipboard.writeText(text);
    toast.success(link ? "Student invite link copied." : "Class code copied.");
  } catch {
    toast.error(
      link
        ? "Could not copy the link. You can still share the class code."
        : "Could not copy the class code.",
    );
  }
}

function newClassCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

/**
 * Creating, listing, archiving and editing a teacher's classes. Home and the Classes page both use it,
 * so a class made or changed on one shows the same way on the other.
 *
 * The caller owns the class list (it loads it with its other data) and renders the pieces:
 * `createButton` (the New class button and its dialog), `rows` (one <li> per class, plus the
 * archived toggle) and `dialogs` (class settings).
 */
export function useClassManager({
  classes,
  setClasses,
  canCreate,
}: {
  classes: TeacherClass[];
  setClasses: Dispatch<SetStateAction<TeacherClass[]>>;
  canCreate: boolean;
}): { createButton: ReactNode; rows: ReactNode[]; dialogs: ReactNode; openCreate: () => void } {
  const { user } = useAuth();
  const { refreshClasses } = useSelectedClass({ mirror: false });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [curriculum, setCurriculum] = useState<string | null>(null);
  const [newDefaults, setNewDefaults] = useState<AssignmentDefaults | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  function changeDialog(open: boolean) {
    if (open && !code) setCode(newClassCode());
    if (!open) setError("");
    setDialogOpen(open);
  }

  async function create() {
    if (!user || !name.trim() || !code.trim()) return;
    setError("");
    setCreating(true);
    const trimmedCode = code.trim();
    try {
      const response = await authenticatedFetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          code: trimmedCode,
          ...(curriculum ? { curriculumId: curriculum } : {}),
          ...(newDefaults ? { assignmentDefaults: newDefaults } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not create the class.");

      const created: TeacherClass = {
        id: result.id,
        name: name.trim().slice(0, 120),
        code: trimmedCode,
        teacherId: user.uid,
        curriculumId: curriculum,
        ...(newDefaults ? { assignmentDefaults: newDefaults } : {}),
      };
      setClasses((current) => [created, ...current]);
      setName("");
      setCode("");
      setCurriculum(null);
      setNewDefaults(null);
      toast.success("Class created.");
      refreshClasses().catch(() => undefined);
      setDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the class. Try again.");
    } finally {
      setCreating(false);
    }
  }

  const createButton = (
    <Dialog open={dialogOpen} onOpenChange={changeDialog}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-7 text-xs" disabled={!canCreate}>
          <PlusCircle className="size-3.5" />
          New class
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New class</DialogTitle>
          <DialogDescription>
            Students join with the class code or the invite link.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="new-class-name">Class name</Label>
            <Input
              id="new-class-name"
              placeholder="e.g. AP Physics 1 - Period 3"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-class-code">Class code</Label>
            <Input
              id="new-class-code"
              placeholder="e.g. PHYS101"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setError("");
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCode(newClassCode());
                setError("");
              }}
              className="cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              Generate code
            </Button>
            <p className="text-xs text-muted-foreground">
              Use 6–64 letters, numbers, dashes, or underscores.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-class-course">Course</Label>
            <CourseSelect id="new-class-course" value={curriculum} onChange={setCurriculum} />
            <p className="text-xs text-muted-foreground">
              Optional. A class follows one course; you can change it later in the class settings.
            </p>
          </div>
          <div className="space-y-2">
            {newDefaults ? (
              <>
                <Label>Assignment settings</Label>
                <AssignmentDefaultsFields
                  idPrefix="new-class"
                  value={newDefaults}
                  onChange={setNewDefaults}
                />
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  onClick={() => setNewDefaults(null)}
                >
                  Use the usual settings instead
                </button>
              </>
            ) : (
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                onClick={() => setNewDefaults(BASE_ASSIGNMENT_DEFAULTS)}
              >
                Set assignment settings for this class (optional)
              </button>
            )}
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            onClick={create}
            disabled={creating || !name.trim() || !code.trim()}
            className="cursor-pointer"
          >
            {creating ? "Creating…" : "Create class"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const archivedCount = classes.filter((c) => c.archivedAt).length;
  const rows: ReactNode[] = [
    ...classes
      .filter((c) => !!c.archivedAt === showArchived)
      .map((c) => (
        <li
          key={c.id}
          className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-muted/30"
        >
          <div className="min-w-0">
            <p className="break-words text-sm font-medium text-foreground">
              {c.name}
              {c.period ? (
                <span className="font-normal text-muted-foreground"> · Period {c.period}</span>
              ) : null}
            </p>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-mono font-medium text-foreground/80">{c.code}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6 text-muted-foreground hover:text-foreground"
                aria-label={`Copy class code for ${c.name}`}
                onClick={() => copyClassInvite(c, false)}
              >
                <Copy className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6 text-muted-foreground hover:text-foreground"
                aria-label={`Copy student invite link for ${c.name}`}
                onClick={() => copyClassInvite(c, true)}
              >
                <Link2 className="size-3" />
              </Button>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
            aria-label={`Settings for ${c.name}`}
            onClick={() => setSettingsFor(c.id)}
          >
            <Settings2 className="size-3.5" /> Settings
          </Button>
        </li>
      )),
    ...(archivedCount > 0 || showArchived
      ? [
          <li key="archived-toggle" className="px-5 py-2.5">
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => setShowArchived(!showArchived)}
            >
              {showArchived ? "Back to active classes" : `Archived classes (${archivedCount})`}
            </button>
          </li>,
        ]
      : []),
  ];

  const editing = classes.find((c) => c.id === settingsFor);
  const dialogs = editing ? (
    <ClassSettingsDialog
      key={editing.id}
      value={{ ...editing, archived: !!editing.archivedAt }}
      open
      onOpenChange={(open) => !open && setSettingsFor(null)}
      onChanged={({ archived, ...patch }) => {
        setClasses((cur) =>
          cur.map((c) =>
            c.id === editing.id
              ? {
                  ...c,
                  ...patch,
                  ...(archived === undefined
                    ? {}
                    : { archivedAt: archived ? new Date().toISOString() : null }),
                }
              : c,
          ),
        );
        refreshClasses().catch(() => undefined);
      }}
      onDeleted={() => {
        setClasses((cur) => cur.filter((c) => c.id !== editing.id));
        refreshClasses().catch(() => undefined);
      }}
    />
  ) : null;

  return { createButton, rows, dialogs, openCreate: () => changeDialog(true) };
}
