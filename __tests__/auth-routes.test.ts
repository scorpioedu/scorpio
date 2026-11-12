import { pathNeedsAuth } from "@/lib/auth-routes";

describe("pathNeedsAuth", () => {
  it.each(["/student", "/student/vault", "/teacher", "/teacher/assignments", "/admin", "/login", "/signup", "/join/abc", "/join/class/CODE"])(
    "starts auth on %s",
    (path) => expect(pathNeedsAuth(path)).toBe(true)
  );

  it.each(["/", "/pricing", "/features", "/ai", "/about", "/demos/teacher", "/forgot-password", "/request-access"])(
    "does not start auth on public page %s",
    (path) => expect(pathNeedsAuth(path)).toBe(false)
  );

  it("does not match a sibling that only shares a prefix", () => {
    expect(pathNeedsAuth("/students")).toBe(false);
    expect(pathNeedsAuth("/login-help")).toBe(false);
  });

  it("keeps auth on when the pathname is unknown", () => {
    expect(pathNeedsAuth(null)).toBe(true);
  });
});
