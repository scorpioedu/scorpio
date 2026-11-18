/** Pure helpers for the in-app feedback widget (kept apart from React so they can be unit tested). */

export type FeedbackKind = "feature" | "bug";
export type AppArea = "teacher" | "student" | "admin";

/** Returns the app area for a signed-in page, or null where the widget must not appear. */
export function feedbackAreaForPath(pathname: string | null): AppArea | null {
  if (!pathname) return null;
  const area = (["teacher", "student", "admin"] as const).find(
    (a) => pathname === `/${a}` || pathname.startsWith(`/${a}/`),
  );
  if (!area) return null;
  // Full-screen student work (assignments, tutor) hides the Support chat; keep feedback off it too.
  if (
    area === "student" &&
    (pathname.includes("assignment-view") || pathname.includes("/student/tutor"))
  )
    return null;
  return area;
}

export interface FeedbackInput {
  kind: FeedbackKind;
  text: string;
  tryingTo: string;
  pathname: string;
  area: AppArea;
  user: { uid: string; email: string | null; displayName: string | null };
}

/**
 * The request body for /api/support/report. Only the path (no query string, which can hold ids) and
 * the user's own identity are included, never page content.
 */
export function buildFeedbackPayload(input: FeedbackInput) {
  const tryingTo = input.tryingTo.trim();
  return {
    source: "feedback-widget" as const,
    category: input.kind,
    description: input.text.trim(),
    ...(tryingTo ? { context: tryingTo } : {}),
    pageUrl: input.pathname.split(/[?#]/)[0],
    userRole: input.area === "admin" ? "admin" : input.area,
    appContext: input.area,
    userId: input.user.uid,
    userEmail: input.user.email,
    userName: input.user.displayName,
  };
}
