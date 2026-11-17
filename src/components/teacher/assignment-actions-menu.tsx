"use client";

// The ⋯ menu used wherever an assignment appears: open, edit problems, duplicate, archive or restore,
// and (only once archived) delete permanently.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteDoc, doc } from "firebase/firestore";
import {
  Archive,
  ArchiveRestore,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { assignmentHref, duplicateAssignment, updateAssignment } from "@/lib/assignment-actions";
import { undoToast } from "@/lib/undo-toast";

export function AssignmentActionsMenu({
  id,
  title,
  archived = false,
  onChanged,
  onDeleted,
  hideOpen = false,
  extraItems,
  align = "end",
}: {
  id: string;
  title: string;
  archived?: boolean;
  /** Called after archive or restore (and after their Undo) with the new state. */
  onChanged?: (archived: boolean) => void;
  onDeleted?: () => void;
  hideOpen?: boolean;
  extraItems?: React.ReactNode;
  align?: "start" | "end";
}) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setArchived = async (next: boolean) => {
    try {
      await updateAssignment(id, { archived: next });
      onChanged?.(next);
      undoToast(
        next ? `"${title}" archived. Students no longer see it.` : `"${title}" restored.`,
        async () => {
          await updateAssignment(id, { archived: !next });
          onChanged?.(!next);
        },
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change the assignment");
    }
  };

  const duplicate = async () => {
    try {
      const copy = await duplicateAssignment(id);
      router.push(`/teacher/create?fork=true&copy=${encodeURIComponent(copy)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not duplicate this assignment");
    }
  };

  const remove = async () => {
    try {
      await deleteDoc(doc(db, "assignments", id));
      toast.success(`"${title}" deleted.`);
      onDeleted?.();
    } catch {
      toast.error("Could not delete this assignment.");
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${title}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-52">
          {!hideOpen && (
            <DropdownMenuItem asChild>
              <Link href={assignmentHref(id)}>
                <ExternalLink /> Open
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href={assignmentHref(id, "problems")}>
              <Pencil /> Edit problems
            </Link>
          </DropdownMenuItem>
          {extraItems}
          <DropdownMenuItem onSelect={duplicate}>
            <Copy /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {archived ? (
            <>
              <DropdownMenuItem onSelect={() => setArchived(false)}>
                <ArchiveRestore /> Restore
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2 /> Delete permanently
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onSelect={() => setArchived(true)}>
              <Archive /> Archive
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete "${title}" permanently?`}
        description="This deletes the assignment, every student submission and uploaded file. It cannot be undone. Archiving already hides it from students."
        confirmText="Delete permanently"
        onConfirm={remove}
      />
    </>
  );
}
