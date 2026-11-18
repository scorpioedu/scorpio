"use client";

// How far apart due dates are when several sets are assigned at once (first-run page and Courses).
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function SpacingSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="1">Every school day</SelectItem>
        <SelectItem value="2">Every 2 school days</SelectItem>
        <SelectItem value="3">Every 3 school days</SelectItem>
        <SelectItem value="5">Once a week</SelectItem>
      </SelectContent>
    </Select>
  );
}
