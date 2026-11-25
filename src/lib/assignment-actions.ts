// Browser-side calls for changing an assignment. Every call throws an Error with a readable message.
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { apiError } from "@/lib/undo-toast";

export interface AssignmentPatch {
  title?: string;
  description?: string | null;
  topic?: string | null;
  dueDate?: string | null;
  timeLimit?: number | null;
  gradingType?: string;
  requireWorkSubmission?: boolean;
  enableTabDetection?: boolean;
  lockdownMode?: boolean;
  allowAIHelp?: boolean;
  allowCalculator?: boolean;
  readFirst?: boolean;
  rubric?: string | null;
  questions?: Record<string, unknown>[];
  archived?: boolean;
}

export interface PatchResult {
  ok: true;
  submissions: number;
  regraded: number;
  needsReview: number;
  changed: string[];
}

export async function updateAssignment(id: string, patch: AssignmentPatch): Promise<PatchResult> {
  const res = await authenticatedFetch(`/api/assignments/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await apiError(res, "Could not save the change"));
  return res.json();
}

/** Due date for the API: an ISO string, or null for "no due date". */
export const dueParam = (date: Date | null) => (date ? date.toISOString() : null);

/** Copy an assignment server-side (answer key included); returns the copy's id. */
export async function duplicateAssignment(sourceId: string, title?: string): Promise<string> {
  const res = await authenticatedFetch("/api/assignments/clone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceId, ...(title ? { title } : {}) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || typeof data.id !== "string")
    throw new Error(data.error || "Could not duplicate this assignment");
  return data.id;
}

/** The hub page for an assignment, optionally on a tab. */
export const assignmentHref = (id: string, tab?: "results" | "problems" | "settings") =>
  `/teacher/assignment-view?id=${encodeURIComponent(id)}${tab && tab !== "results" ? `&tab=${tab}` : ""}`;
