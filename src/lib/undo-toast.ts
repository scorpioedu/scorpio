import { toast } from "sonner";

/**
 * A success toast with an Undo button. `undo` runs the reverse change; its own failure is reported
 * as an error toast, so callers never need a second try/catch.
 */
export function undoToast(
  message: string,
  undo: () => Promise<unknown> | unknown,
  undoneMessage = "Undone",
) {
  toast.success(message, {
    duration: 8000,
    action: {
      label: "Undo",
      onClick: async () => {
        try {
          await undo();
          toast.success(undoneMessage);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not undo");
        }
      },
    },
  });
}

/** Read an API error body ({ error }) into a sentence for a toast. */
export async function apiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    return typeof body.error === "string" && body.error ? body.error : fallback;
  } catch {
    return fallback;
  }
}
