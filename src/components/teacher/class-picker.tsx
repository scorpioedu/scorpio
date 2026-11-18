"use client";

// The class switcher used in every teacher page header. Reads and writes the shared selected class.
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_CLASSES, useSelectedClass } from "@/contexts/selected-class-context";
import { cn } from "@/lib/utils";

export function ClassPicker({
  allowAll = false,
  onBeforeChange,
  className,
}: {
  allowAll?: boolean;
  /** Lets a page with unsaved edits ask first: call `change()` to go ahead. */
  onBeforeChange?: (change: () => void) => void;
  className?: string;
}) {
  const { classes, classId, setClassId } = useSelectedClass({ allowAll });
  if (!classes)
    return <div className={cn("h-9 w-48 animate-pulse rounded-full bg-muted", className)} />;
  if (classes.length === 0) return null;
  return (
    <Select
      value={classId}
      onValueChange={(id) =>
        onBeforeChange ? onBeforeChange(() => setClassId(id)) : setClassId(id)
      }
    >
      <SelectTrigger aria-label="Class" className={cn("w-56 max-w-full", className)}>
        <SelectValue placeholder="Choose a class" />
      </SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value={ALL_CLASSES}>All classes</SelectItem>}
        {classes.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
            {c.period ? ` · ${c.period}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
