/**
 * Narrowing helpers for `catch (e: unknown)`. They return `undefined` instead of throwing when the
 * thrown value is not an object with a string `message` / `code`, mirroring what `e?.message` and
 * `e?.code` evaluated to when the catch variable was typed `any`.
 */

function readStringField(e: unknown, field: "message" | "code"): string | undefined {
  if (typeof e !== "object" || e === null) return undefined;
  const value = (e as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

/** The `message` of a thrown value, or undefined when it has none. */
export function errorMessage(e: unknown): string | undefined {
  return readStringField(e, "message");
}

/** The `code` of a thrown value (for example a Firebase `auth/...` code), or undefined. */
export function errorCode(e: unknown): string | undefined {
  return readStringField(e, "code");
}
