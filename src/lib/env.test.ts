import { EnvValidationError, missingEnv, requireEnvGroup } from "./env";

describe("requireEnvGroup", () => {
  it("returns values when the group is complete", () => {
    expect(requireEnvGroup("gemini", { GEMINI_API_KEY: "k" })).toEqual({ GEMINI_API_KEY: "k" });
  });

  it("names every missing variable", () => {
    expect(() => requireEnvGroup("polar", {})).toThrow(/POLAR_ACCESS_TOKEN, POLAR_WEBHOOK_SECRET/);
  });

  it("treats blank values as missing", () => {
    expect(missingEnv("gemini", { GEMINI_API_KEY: "   " })).toEqual(["GEMINI_API_KEY"]);
  });

  it("never includes provided values in the error message", () => {
    let message = "";
    try {
      requireEnvGroup("polar", { POLAR_ACCESS_TOKEN: "super-secret-value" });
    } catch (e) {
      expect(e).toBeInstanceOf(EnvValidationError);
      message = (e as Error).message;
    }
    expect(message).toContain("POLAR_WEBHOOK_SECRET");
    expect(message).not.toContain("super-secret-value");
  });

  it("reports an empty list for a complete group", () => {
    expect(missingEnv("email", { RESEND_API_KEY: "x" })).toEqual([]);
  });
});
