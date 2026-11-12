import { buildCsp, securityHeaders } from "./security-headers.cjs";

function header(name: string, options?: Parameters<typeof securityHeaders>[0]) {
  return securityHeaders(options).find((h) => h.key === name)?.value;
}

describe("security headers", () => {
  it("sets X-Frame-Options to SAMEORIGIN so the same-origin PDF preview keeps working", () => {
    expect(header("X-Frame-Options")).toBe("SAMEORIGIN");
  });
  it("sets X-Content-Type-Options nosniff", () => {
    expect(header("X-Content-Type-Options")).toBe("nosniff");
  });
  it("sets the Referrer-Policy", () => {
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
  it("sets HSTS for two years with subdomains and no preload", () => {
    expect(header("Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains");
  });
  it("keeps microphone, fullscreen and clipboard for features the app uses", () => {
    const policy = header("Permissions-Policy") ?? "";
    expect(policy).toContain("microphone=(self)");
    expect(policy).toContain("fullscreen=(self)");
    expect(policy).toContain('clipboard-write=(self "https://www.desmos.com")');
  });
  it("disables camera, geolocation and payment", () => {
    const policy = header("Permissions-Policy") ?? "";
    expect(policy).toContain("camera=()");
    expect(policy).toContain("geolocation=()");
    expect(policy).toContain("payment=()");
  });
});

describe("content security policy", () => {
  it("is report-only and not enforcing", () => {
    const keys = securityHeaders().map((h) => h.key);
    expect(keys).toContain("Content-Security-Policy-Report-Only");
    expect(keys).not.toContain("Content-Security-Policy");
  });
  it("reports to /api/csp-report", () => {
    expect(buildCsp()).toContain("report-uri /api/csp-report");
  });
  it("blocks plugins and framing by other origins", () => {
    const csp = buildCsp();
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
  });
  it("allows the Firebase, reCAPTCHA and Desmos origins the app uses", () => {
    const csp = buildCsp();
    expect(csp).toContain("https://*.googleapis.com");
    expect(csp).toContain("https://www.gstatic.com/recaptcha/");
    expect(csp).toContain("https://www.desmos.com");
  });
  it("does not allow eval or localhost in production", () => {
    const csp = buildCsp({ development: false });
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain("localhost");
  });
  it("allows eval and localhost in development", () => {
    const csp = buildCsp({ development: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("http://localhost:*");
  });
  it("allows local emulators when they are enabled", () => {
    expect(buildCsp({ emulators: true })).toContain("http://127.0.0.1:*");
  });
});
