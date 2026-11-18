"use client";

// Every assignment the teacher owns. Rename, change a due date, share or archive right on the row;
// select several to move their due dates together. Open one for its results, problems and settings.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { Archive, Globe, Lock, PlusCircle, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/auth-context";
import { ALL_CLASSES, useSelectedClass } from "@/contexts/selected-class-context";
import { getAssignmentPoints } from "@/lib/assignment-points";
import { parseDueDate } from "@/lib/due-date";
import { addDays, dueState } from "@/lib/teacher-edit";
import { assignmentHref, dueParam, updateAssignment } from "@/lib/assignment-actions";
import { undoToast } from "@/lib/undo-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TeacherPageHeader } from "@/components/teacher/workspace";
import { ClassPicker } from "@/components/teacher/class-picker";
import { InlineTitle } from "@/components/teacher/inline-title";
import { DueDateChip } from "@/components/teacher/due-date-chip";
import { AssignmentActionsMenu } from "@/components/teacher/assignment-actions-menu";

type Visibility = "private" | "network" | "global";

interface Row {
  id: string;
  title: string;
  dueDate: Date | null;
  questions?: { points?: number }[];
  createdAt: Date | null;
  courseId: string | null;
  visibility: Visibility;
  lockdownMode?: boolean;
  archived: boolean;
  curriculumSetKey?: string;
}

const STATUS = [
  { value: "open", label: "Open (not yet due)" },
  { value: "pastDue", label: "Past due" },
  { value: "noDate", label: "No due date" },
  { value: "all", label: "All but archived" },
  { value: "archived", label: "Archived" },
] as const;
type Status = (typeof STATUS)[number]["value"];

const time = (d: Date | null, missing: number) => (d ? d.getTime() : missing);

export default function AssignmentsPage() {
  const { user } = useAuth();
  const { classes, classId } = useSelectedClass({ allowAll: true });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [status, setStatus] = useState<Status>("all");
  const [sort, setSort] = useState("dueDateAsc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shiftBy, setShiftBy] = useState("1");

  const uid = user?.uid;
  const load = useCallback(async () => {
    if (!uid) return;
    const snap = await getDocs(query(collection(db, "assignments"), where("teacherId", "==", uid)));
    // Published course sets (the library every teacher assigns from) belong to the admin who published
    // them and are managed in Admin → Content. They are not that teacher's own assignments, so they
    // stay out of this list; the copies assigned to a class have a courseId and are listed.
    const own = snap.docs.filter((d) => {
      const a = d.data();
      return !(a.visibility === "global" && a.curriculumSetKey && typeof a.courseId !== "string");
    });
    return own.map((d) => {
      const a = d.data();
      return {
        id: d.id,
        title: String(a.title || "Untitled assignment"),
        dueDate: parseDueDate(a.dueDate),
        questions: a.questions,
        createdAt: parseDueDate(a.createdAt),
        courseId: typeof a.courseId === "string" ? a.courseId : null,
        visibility: (a.visibility as Visibility) || "private",
        lockdownMode: a.lockdownMode,
        archived: a.archivedAt != null,
        curriculumSetKey: a.curriculumSetKey,
      } satisfies Row;
    });
  }, [uid]);

  useEffect(() => {
    let active = true;
    load()
      .then((list) => active && list && setRows(list))
      .catch(() => {
        if (!active) return;
        setRows([]);
        toast.error("Could not load your assignments.");
      });
    return () => {
      active = false;
    };
  }, [load]);

  const patchRow = (id: string, patch: Partial<Row>) =>
    setRows((cur) => (cur ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const classNames = useMemo(() => new Map((classes ?? []).map((c) => [c.id, c.name])), [classes]);

  const visible = useMemo(() => {
    const now = new Date();
    const list = (rows ?? []).filter((r) => {
      if (classId !== ALL_CLASSES && r.courseId !== classId) return false;
      if (status === "archived") return r.archived;
      if (r.archived) return false;
      const state = dueState(r.dueDate, now);
      if (status === "open") return state === "soon" || state === "later";
      if (status === "pastDue") return state === "past";
      if (status === "noDate") return state === "none";
      return true;
    });
    return list.sort((a, b) => {
      if (sort === "dueDateAsc") return time(a.dueDate, Infinity) - time(b.dueDate, Infinity);
      if (sort === "dueDateDesc") return time(b.dueDate, -Infinity) - time(a.dueDate, -Infinity);
      if (sort === "titleAsc") return a.title.localeCompare(b.title, undefined, { numeric: true });
      return b.title.localeCompare(a.title, undefined, { numeric: true });
    });
  }, [rows, classId, status, sort]);

  const selectedRows = visible.filter((r) => selected.has(r.id));
  const toggle = (id: string, on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  async function rename(row: Row, title: string) {
    try {
      await updateAssignment(row.id, { title });
      patchRow(row.id, { title });
      undoToast("Renamed", async () => {
        await updateAssignment(row.id, { title: row.title });
        patchRow(row.id, { title: row.title });
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rename");
      throw error;
    }
  }

  async function changeDue(row: Row, dueDate: Date | null) {
    try {
      await updateAssignment(row.id, { dueDate: dueParam(dueDate) });
      patchRow(row.id, { dueDate });
      undoToast(dueDate ? "Due date changed" : "Due date removed", async () => {
        await updateAssignment(row.id, { dueDate: dueParam(row.dueDate) });
        patchRow(row.id, { dueDate: row.dueDate });
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change the due date");
      throw error;
    }
  }

  async function updateVisibility(row: Row, visibility: Visibility) {
    try {
      await updateDoc(doc(db, "assignments", row.id), { visibility });
      patchRow(row.id, { visibility });
      undoToast(`Sharing set to ${visibility}`, async () => {
        await updateDoc(doc(db, "assignments", row.id), { visibility: row.visibility });
        patchRow(row.id, { visibility: row.visibility });
      });
    } catch {
      toast.error("Could not change sharing. Please try again.");
    }
  }

  /** Move every selected due date by the same number of days (rows without a date are skipped). */
  async function shiftSelected() {
    const days = Number(shiftBy);
    const targets = selectedRows.filter((r) => r.dueDate);
    if (!targets.length) return toast.error("None of the selected assignments has a due date.");
    const moves = targets.map((r) => ({ row: r, next: addDays(r.dueDate!, days) }));
    const apply = async (list: { id: string; date: Date | null }[]) => {
      const results = await Promise.allSettled(
        list.map((m) => updateAssignment(m.id, { dueDate: dueParam(m.date) })),
      );
      list.forEach(
        (m, i) => results[i].status === "fulfilled" && patchRow(m.id, { dueDate: m.date }),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed)
        throw new Error(`${failed} due date${failed === 1 ? "" : "s"} could not be changed`);
    };
    try {
      await apply(moves.map((m) => ({ id: m.row.id, date: m.next })));
      undoToast(
        `Moved ${moves.length} due date${moves.length === 1 ? "" : "s"} ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ${days > 0 ? "later" : "earlier"}`,
        () => apply(moves.map((m) => ({ id: m.row.id, date: m.row.dueDate }))),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not move the due dates");
    }
  }

  async function archiveSelected() {
    const targets = selectedRows;
    const setAll = async (archived: boolean) => {
      await Promise.all(targets.map((r) => updateAssignment(r.id, { archived })));
      targets.forEach((r) => patchRow(r.id, { archived }));
    };
    try {
      await setAll(true);
      setSelected(new Set());
      undoToast(`Archived ${targets.length} assignment${targets.length === 1 ? "" : "s"}`, () =>
        setAll(false),
      );
    } catch {
      toast.error("Could not archive every assignment. Please try again.");
    }
  }

  const allChecked = visible.length > 0 && visible.every((r) => selected.has(r.id));

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        title="Assignments"
        description="Rename, re-date, share or archive right here. Open one to see results or edit its problems."
      >
        <ClassPicker allowAll />
        <Button asChild>
          <Link href="/teacher/create">
            <PlusCircle /> Create assignment
          </Link>
        </Button>
      </TeacherPageHeader>

      <Card className="min-w-0 gap-0 py-0">
        <CardHeader className="flex flex-wrap items-end justify-between gap-3 px-4 py-4 sm:px-5">
          <div className="grid w-full max-w-md gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <label
                htmlFor="assignment-status"
                className="block text-xs font-medium text-muted-foreground"
              >
                Show
              </label>
              <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                <SelectTrigger id="assignment-status" className="w-full cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <label
                htmlFor="assignment-sort"
                className="block text-xs font-medium text-muted-foreground"
              >
                Sort by
              </label>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger id="assignment-sort" className="w-full cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dueDateAsc">Due date (soonest)</SelectItem>
                  <SelectItem value="dueDateDesc">Due date (latest)</SelectItem>
                  <SelectItem value="titleAsc">Title (A–Z)</SelectItem>
                  <SelectItem value="titleDesc">Title (Z–A)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {rows && (
            <p className="text-sm text-muted-foreground">
              {visible.length} assignment{visible.length === 1 ? "" : "s"}
            </p>
          )}
        </CardHeader>

        {selectedRows.length > 0 && (
          <div
            role="region"
            aria-label="Selected assignments"
            className="flex flex-wrap items-center gap-3 border-t bg-primary/5 px-4 py-2.5 text-sm sm:px-5"
          >
            <span className="font-medium">{selectedRows.length} selected</span>
            <span className="text-muted-foreground">Move due dates</span>
            <Select value={shiftBy} onValueChange={setShiftBy}>
              <SelectTrigger size="sm" aria-label="Move by" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[-7, -3, -2, -1, 1, 2, 3, 7].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {Math.abs(n)} day{Math.abs(n) === 1 ? "" : "s"} {n > 0 ? "later" : "earlier"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={shiftSelected}>
              Move
            </Button>
            {status !== "archived" && (
              <Button size="sm" variant="ghost" onClick={archiveSelected}>
                <Archive /> Archive
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => setSelected(new Set())}
            >
              <X /> Clear
            </Button>
          </div>
        )}

        <CardContent className="border-t p-0">
          {!rows || visible.length === 0 ? (
            <div role="status" className="px-5 py-10 text-center text-sm text-muted-foreground">
              {!rows
                ? "Loading assignments…"
                : status === "archived"
                  ? "Nothing archived. Archived assignments are hidden from students and can be restored."
                  : "No assignments match. Try another class or “All but archived”."}
            </div>
          ) : (
            <Table aria-label="Assignments">
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="w-10 pl-4 sm:pl-5">
                    <Checkbox
                      aria-label="Select all"
                      checked={allChecked}
                      onCheckedChange={(on) =>
                        setSelected(on === true ? new Set(visible.map((r) => r.id)) : new Set())
                      }
                    />
                  </TableHead>
                  <TableHead>Assignment</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Sharing</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => (
                  <TableRow key={row.id} data-state={selected.has(row.id) ? "selected" : undefined}>
                    <TableCell className="pl-4 sm:pl-5">
                      <Checkbox
                        aria-label={`Select ${row.title}`}
                        checked={selected.has(row.id)}
                        onCheckedChange={(on) => toggle(row.id, on === true)}
                      />
                    </TableCell>
                    <TableCell className="max-w-96 whitespace-normal py-3">
                      <InlineTitle
                        value={row.title}
                        href={assignmentHref(row.id)}
                        label="Rename assignment"
                        className="font-medium"
                        onSave={(title) => rename(row, title)}
                      />
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          {row.courseId
                            ? (classNames.get(row.courseId) ?? "Archived class")
                            : "Not in a class"}
                        </span>
                        <span>
                          {row.questions?.length || 0} problems ·{" "}
                          {getAssignmentPoints(row.questions)} pts
                        </span>
                        {row.lockdownMode && (
                          <span className="inline-flex items-center gap-1">
                            <ShieldAlert aria-hidden="true" className="size-3" /> Lockdown
                          </span>
                        )}
                        {row.archived && <span>Archived</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DueDateChip due={row.dueDate} onChange={(d) => changeDue(row, d)} />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={row.visibility}
                        onValueChange={(value: Visibility) => updateVisibility(row, value)}
                      >
                        <SelectTrigger
                          size="sm"
                          aria-label={`Sharing for ${row.title}`}
                          className="cursor-pointer text-xs"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="private">
                            <Lock /> Private
                          </SelectItem>
                          <SelectItem value="network">
                            <ShieldCheck /> Network
                          </SelectItem>
                          <SelectItem value="global">
                            <Globe /> Global
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="pr-3">
                      <AssignmentActionsMenu
                        id={row.id}
                        title={row.title}
                        archived={row.archived}
                        onChanged={(archived) => patchRow(row.id, { archived })}
                        onDeleted={() =>
                          setRows((cur) => (cur ?? []).filter((r) => r.id !== row.id))
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
