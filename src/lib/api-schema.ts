import { NextRequest, NextResponse } from "next/server";
import type { ZodError, ZodType } from "zod";

/** Matches the ceiling enforced by withAuthorizedRequest so unwrapped routes behave the same. */
export const DEFAULT_MAX_BODY_BYTES = 500_000;

export type FieldIssue = { path: string; message: string };
export type ParseResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

type MessageFor = string | ((issues: FieldIssue[]) => string);
interface ParseOptions {
  maxBytes?: number;
  /** The top-level `error` string. Pass the route's existing message to keep its client contract. */
  message?: MessageFor;
}

/** Only field paths and zod's short messages are exposed, never the received values or zod internals. */
export function fieldIssues(error: ZodError): FieldIssue[] {
  return error.issues.map(issue => ({ path: issue.path.map(String).join("."), message: issue.message }));
}

function reject(status: number, error: string, fields?: FieldIssue[]): ParseResult<never> {
  return { ok: false, response: NextResponse.json(fields ? { error, fields } : { error }, { status }) };
}

/** Validates an already-parsed value. Unknown keys are stripped by the schemas (zod default). */
export function parseValue<T>(value: unknown, schema: ZodType<T>, message: MessageFor = "Invalid request body"): ParseResult<T> {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  const fields = fieldIssues(result.error);
  return reject(400, typeof message === "function" ? message(fields) : message, fields);
}

/**
 * Reads, size-checks, JSON-parses and validates a request body.
 * 413 for oversize, 400 for invalid JSON or schema failure. An empty body is treated as `{}`.
 */
export async function parseJsonBody<T>(req: NextRequest, schema: ZodType<T>, options: ParseOptions = {}): Promise<ParseResult<T>> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BODY_BYTES;
  let raw: string;
  try { raw = await req.text(); } catch { return reject(400, "Invalid request body"); }
  if (Buffer.byteLength(raw) > maxBytes) return reject(413, "Request too large");
  let json: unknown = {};
  if (raw.trim()) {
    try { json = JSON.parse(raw); } catch { return reject(400, "Invalid JSON"); }
  }
  return parseValue(json, schema, options.message);
}
