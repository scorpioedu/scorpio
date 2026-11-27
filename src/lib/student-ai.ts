// Student AI is off unless a teacher turns it on for a class. The class doc stores `studentAi: true`
// (written by PATCH /api/courses/{id}); a missing field means off, so every class that existed
// before the setting starts off. It covers what a student can ask a model for: the Raise page,
// hints on an assignment and Raise help in the notebook. Study, lessons and marking never use AI.

/** The field on courses/{id}. */
export const STUDENT_AI_FIELD = "studentAi";

/** What a refused student request is told, and what the pages show in place of Raise. */
export const STUDENT_AI_OFF_MESSAGE = "Raise is off for your class. Your teacher can turn it on.";

/**
 * "Allow Raise hints" on an assignment or in a class's assignment settings only means something
 * when Raise is on for the class, so it is never stored as on for a class that has Raise off.
 */
export function hintsAllowedFor(course: unknown, allowAIHelp: unknown): boolean {
  return allowAIHelp === true && classStudentAiOn(course);
}

/** Whether a class doc (raw, as stored) has student AI on. Only a literal `true` counts. */
export function classStudentAiOn(course: unknown): boolean {
  return (
    !!course &&
    typeof course === "object" &&
    (course as Record<string, unknown>)[STUDENT_AI_FIELD] === true
  );
}
