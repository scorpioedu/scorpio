// Class-wide assignment settings. A class stores them as `assignmentDefaults` on its doc (written only
// by POST /api/courses and PATCH /api/courses/{id}/assignment-defaults). Every assignment made in the
// class starts from them — the editor prefills them and /api/assignments/clone applies them to
// assignments assigned from a course roadmap. A teacher can still change a single assignment afterwards.

export interface AssignmentDefaults {
  /** Minutes; null means untimed. */
  timeLimit: number | null;
  gradingType: "ai" | "manual";
  allowCalculator: boolean;
  allowAIHelp: boolean;
  requireWorkSubmission: boolean;
  enableTabDetection: boolean;
  lockdownMode: boolean;
}

export const MAX_TIME_LIMIT_MINUTES = 600;

/**
 * Stored beside the settings but not one of them: the number of problems the teacher last chose in
 * the assign dialog, so the dialog opens on it next time. Nothing else reads it.
 */
export const PROBLEMS_PER_SET = "problemsPerSet";

/** The class's remembered "Problems per set" (3 to 10), or null when there is none. */
export function parseProblemsPerSet(value: unknown): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const n = (value as Record<string, unknown>)[PROBLEMS_PER_SET];
  return typeof n === "number" && Number.isInteger(n) && n >= 3 && n <= 10 ? n : null;
}

/** What the assignment editor starts with when a class has no saved defaults. */
export const BASE_ASSIGNMENT_DEFAULTS: AssignmentDefaults = {
  timeLimit: null,
  gradingType: "ai",
  allowCalculator: false,
  allowAIHelp: false,
  requireWorkSubmission: false,
  enableTabDetection: true,
  lockdownMode: false,
};

/**
 * Reads whatever is stored (or sent) as class defaults. Returns null when there are none, and keeps
 * only well-typed known fields so a bad stored value never reaches an assignment.
 */
export function parseAssignmentDefaults(value: unknown): AssignmentDefaults | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  // A class that only has a remembered "Problems per set" has no settings of its own.
  const keys = Object.keys(v);
  if (keys.length === 1 && keys[0] === PROBLEMS_PER_SET) return null;
  const flag = (key: keyof AssignmentDefaults) =>
    typeof v[key] === "boolean" ? (v[key] as boolean) : (BASE_ASSIGNMENT_DEFAULTS[key] as boolean);
  const minutes = v.timeLimit;
  return {
    timeLimit:
      typeof minutes === "number" && Number.isInteger(minutes) && minutes > 0
        ? Math.min(minutes, MAX_TIME_LIMIT_MINUTES)
        : null,
    gradingType: v.gradingType === "manual" ? "manual" : "ai",
    allowCalculator: flag("allowCalculator"),
    allowAIHelp: flag("allowAIHelp"),
    requireWorkSubmission: flag("requireWorkSubmission"),
    enableTabDetection: flag("enableTabDetection"),
    lockdownMode: flag("lockdownMode"),
  };
}

/** Defaults for a class: its saved ones, or the editor's built-in starting point. */
export function resolveAssignmentDefaults(value: unknown): AssignmentDefaults {
  return parseAssignmentDefaults(value) ?? BASE_ASSIGNMENT_DEFAULTS;
}
