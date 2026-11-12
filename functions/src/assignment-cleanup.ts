/** Pure helpers for removing a deleted assignment's uploaded files (K-003). */

export interface WorkFileRef {
  url?: unknown;
}

/**
 * Maps a stored work-file download URL to its Storage object path, or null when the
 * file must NOT be deleted. Only objects under `submissions/{studentId}/` are eligible,
 * which mirrors /api/teacher/students/cleanup. Data URLs, malformed URLs and anything
 * outside the student's prefix (e.g. teacher `resources/`) are rejected.
 */
export function storageObjectForWorkFile(file: WorkFileRef, studentId: unknown): string | null {
  if (typeof file?.url !== "string" || typeof studentId !== "string" || !studentId || studentId.includes("/")) {
    return null;
  }
  let object: string;
  try {
    object = decodeURIComponent(new URL(file.url).pathname.split("/o/")[1] || "");
  } catch {
    return null;
  }
  const prefix = `submissions/${studentId}/`;
  if (!object.startsWith(prefix) || object.length === prefix.length || object.includes("..")) {
    return null;
  }
  return object;
}

/** Unique, in-prefix object paths for a batch of submission documents. */
export function collectSubmissionObjects(submissions: Array<Record<string, unknown> | undefined>): string[] {
  const objects = new Set<string>();
  for (const data of submissions) {
    const files = Array.isArray(data?.workFiles) ? (data?.workFiles as WorkFileRef[]) : [];
    for (const file of files) {
      const object = storageObjectForWorkFile(file, data?.studentId);
      if (object) objects.add(object);
    }
  }
  return [...objects];
}

export interface DeletableBucket {
  file(name: string): { delete(options: { ignoreNotFound: boolean }): Promise<unknown> };
}

/** Deletes the given objects; a failed delete is reported, not thrown, so Firestore cleanup still runs. */
export async function deleteStorageObjects(bucket: DeletableBucket, objects: string[]): Promise<string[]> {
  const failed: string[] = [];
  for (const object of objects) {
    try {
      await bucket.file(object).delete({ ignoreNotFound: true });
    } catch (err) {
      console.error(`Failed to delete storage object ${object}`, err);
      failed.push(object);
    }
  }
  return failed;
}
