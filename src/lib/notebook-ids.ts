/** Deterministic id for a student's auto-created first notebook, so repeated snapshots cannot create duplicates (H-001). */
export function defaultNotebookId(uid: string): string {
  return `${uid}_default`;
}
