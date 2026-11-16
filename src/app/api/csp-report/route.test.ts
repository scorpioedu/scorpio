import { NextRequest } from "next/server";
import { POST } from "./route";
import { MAX_REPORT_BYTES, resetReportLimiter } from "@/lib/csp-report";

function post(body: string) {
  return new NextRequest("http://localhost/api/csp-report", {
    method: "POST",
    headers: { "content-type": "application/csp-report" },
    body,
  });
}

const report = {
  "csp-report": {
    "document-uri": "https://example.test/login?token=secret#frag",
    "violated-directive": "script-src-elem",
    "effective-directive": "script-src-elem",
    "blocked-uri": "https://evil.test/x.js?email=a@b.c",
    disposition: "report",
  },
};

describe("POST /api/csp-report", () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    resetReportLimiter();
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it("returns 204 and logs a one-line summary without query strings", async () => {
    const res = await POST(post(JSON.stringify(report)));
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain("violated-directive=script-src-elem");
    expect(line).toContain("blocked-uri=https://evil.test/x.js");
    expect(line).not.toContain("secret");
    expect(line).not.toContain("a@b.c");
    expect(line).not.toContain("\n");
  });

  it("returns 204 and logs nothing for malformed JSON", async () => {
    const res = await POST(post("not json"));
    expect(res.status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });

  it("ignores oversized bodies", async () => {
    const res = await POST(post(JSON.stringify({ pad: "x".repeat(MAX_REPORT_BYTES + 1) })));
    expect(res.status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });

  it("stops logging after the per-minute cap", async () => {
    for (let i = 0; i < 70; i++) await POST(post(JSON.stringify(report)));
    expect(warn).toHaveBeenCalledTimes(60);
  });
});
