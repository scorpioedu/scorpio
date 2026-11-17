"use client";

// Everything about one class in one place: name, period, description, join code, archive, delete.
// Name, period and description save together; the other actions save at once.
import { useState } from "react";
import { Archive, ArchiveRestore, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { apiError, undoToast } from "@/lib/undo-toast";
import { Button } from "@/components/ui/button";
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
  const [busy, setBusy] = useState<"" | "save" | "code" | "archive">("");
  const [confirm, setConfirm] = useState<"" | "code" | "delete">("");
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Class settings</DialogTitle>
            <DialogDescription>
              Rename the class, change its join code, or archive it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/30 px-3 py-2.5">
              <div>
                <p className="text-xs text-muted-foreground">Join code</p>
                <p className="font-mono text-sm font-semibold">{value.code}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!!busy}
                onClick={() => setConfirm("code")}
              >
                {busy === "code" ? <Loader2 className="animate-spin" /> : <RotateCcw />} New code
              </Button>
            </div>
          </div>
          <DialogFooter className="flex-wrap gap-2 sm:justify-between">
            <div className="flex gap-2">
              {value.archived ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!!busy}
                  onClick={() => setArchived(false)}
                >
                  <ArchiveRestore /> Restore
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!!busy}
                  onClick={() => setArchived(true)}
                >
                  <Archive /> Archive
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={!!busy}
                onClick={() => setConfirm("delete")}
              >
                <Trash2 /> Delete
              </Button>
            </div>
            <Button onClick={save} disabled={!dirty || !!busy}>
              {busy === "save" && <Loader2 className="animate-spin" />} Save
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
