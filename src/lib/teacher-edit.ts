// Small, pure helpers shared by the teacher's editing controls (due-date chip, class picker, undo toasts).

/** A due date on `day`, keeping the time of day of `previous`, else 23:59 local (the app's default). */
export function dueOnDay(day: Date, previous: Date | null = null): Date {
  const next = new Date(day);
  if (previous) next.setHours(previous.getHours(), previous.getMinutes(), 0, 0);
  else next.setHours(23, 59, 0, 0);
  return next;
}

/** Same calendar day in local time. */
export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export type DueState = "none" | "past" | "soon" | "later";

/** How a due date reads on a row: no date, past due, within two days, or later. */
export function dueState(due: Date | null, now: Date = new Date()): DueState {
  if (!due) return "none";
  const ms = due.getTime() - now.getTime();
  if (ms < 0) return "past";
  return ms <= 2 * 24 * 60 * 60 * 1000 ? "soon" : "later";
}

/** "Tue, Nov 18" (adds the year when it is not this year's). */
export function shortDue(due: Date, now: Date = new Date()): string {
  return due.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(due.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

/**
 * Which class a teacher page starts on: the one in the URL, else the remembered one, else the first.
 * Only ids in `ids` count, so a stale or foreign id falls through.
 */
export function chooseClass(
  ids: string[],
  { fromUrl, remembered }: { fromUrl?: string | null; remembered?: string | null },
): string {
  if (fromUrl && ids.includes(fromUrl)) return fromUrl;
  if (remembered && ids.includes(remembered)) return remembered;
  return ids[0] ?? "";
}

/** Shift a date by whole local days (DST-safe: keeps the wall-clock time). */
export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
