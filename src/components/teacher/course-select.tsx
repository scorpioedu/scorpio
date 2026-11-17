"use client";

// Picks the course a class follows: one of the course roadmaps, or none. A class has at most one.
import { CURRICULA, hasContent } from "@/data/curricula";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NONE = "none";

export function CourseSelect({
  id,
  value,
  onChange,
  disabled,
  className,
}: {
  id?: string;
  /** The course's id, or null for a class with no course. */
  value: string | null;
  onChange: (curriculumId: string | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label="Course" className={className ?? "w-full"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No course</SelectItem>
        {CURRICULA.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
            <span className="text-xs text-muted-foreground">
              {hasContent(c) ? `${c.sets.length} sets` : "Planned"}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
