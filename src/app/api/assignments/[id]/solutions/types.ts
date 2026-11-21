/** What GET /api/assignments/{id}/solutions returns. */
export interface QuestionSolution {
  /** The correct answer, from the answer key. */
  answer: string;
  /** The worked solution (Markdown), when the assignment has one for this question. */
  solution?: string;
}

export interface SolutionsResponse {
  /** By question id. Empty until the caller may see them, and for assignments with none. */
  solutions: Record<string, QuestionSolution>;
  /**
   * Set only when the assignment has worked solutions the caller cannot see yet:
   * "due" until the due date has passed, then "graded" until their own work is graded.
   */
  pending?: "due" | "graded";
  /** With `pending: "due"`: the due date (ISO). */
  availableAt?: string;
}
