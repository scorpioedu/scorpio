import { NextRequest } from "next/server";
import { MAX_REPORT_BYTES, allowReport, summariseCspReport } from "@/lib/csp-report";

// Receives Content-Security-Policy-Report-Only violation reports (RT-09).
// Always answers 204: browsers ignore the response and callers learn nothing about validation.
// The limiter is per server instance (no Firestore write per report) and only bounds log volume.
export async function POST(req: NextRequest) {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_REPORT_BYTES || !allowReport()) {
    return new Response(null, { status: 204 });
  }
  try {
    const text = await req.text();
    if (text.length <= MAX_REPORT_BYTES) {
      const summary = summariseCspReport(JSON.parse(text));
      if (summary) console.warn(`[csp-report] ${summary}`);
    }
  } catch {
    // Malformed JSON from a client: drop silently.
  }
  return new Response(null, { status: 204 });
}
