import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { AiError } from "./ai/errors";
import { ClientError } from "./client-error";

/**
 * The one place a caught error becomes an HTTP response (RT-17, C-009, F-003). Details go to the
 * server log with a request id; the body only ever holds text written for the client plus that id,
 * so no stack trace, provider message or upstream body can leak.
 */
export function errorResponse(error: unknown, tag: string, requestId: string = randomUUID()): NextResponse {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[${tag}] requestId=${requestId}`, detail);
  if (error instanceof ClientError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof AiError) return NextResponse.json({ error: error.publicMessage, requestId }, { status: error.status });
  return NextResponse.json({ error: "Internal server error", requestId }, { status: 500 });
}
