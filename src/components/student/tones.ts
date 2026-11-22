// The few colours the student's coursework pages (Grades, Assignments) use, all from the theme:
// the brand colour for what to look at, the destructive colour for what went wrong or is late,
// and muted for everything else. No extra palette, so every theme (and high contrast) still fits.

export type Tone = "accent" | "alert" | "quiet";

export const TONE: Record<
  Tone,
  { text: string; pill: string; solid: string; bar: string; tile: string }
> = {
  accent: {
    text: "text-primary",
    pill: "bg-primary/10 text-primary ring-primary/20",
    solid: "bg-primary",
    bar: "border-l-primary",
    tile: "bg-primary/10 text-primary",
  },
  alert: {
    text: "text-destructive",
    pill: "bg-destructive/10 text-destructive ring-destructive/20",
    solid: "bg-destructive",
    bar: "border-l-destructive",
    tile: "bg-destructive/10 text-destructive",
  },
  quiet: {
    text: "text-muted-foreground",
    pill: "bg-muted text-muted-foreground ring-border",
    solid: "bg-muted-foreground/30",
    bar: "border-l-transparent",
    tile: "bg-muted text-muted-foreground",
  },
};

/** A score's colour: below 60 is flagged, anything else is the brand colour; no score is quiet. */
export function scoreTone(score: number | null | undefined): Tone {
  if (typeof score !== "number") return "quiet";
  return score < 60 ? "alert" : "accent";
}

/** A small rounded label in a tone. */
export const pillClass = (tone: Tone) =>
  `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TONE[tone].pill}`;
