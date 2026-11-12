/**
 * Lazy, group-based validation of server-side environment variables (RT-22 / L-005).
 *
 * Nothing runs at import time, so `next build` (which only has dummy NEXT_PUBLIC_FIREBASE_* values)
 * is unaffected. Call `requireEnvGroup("gemini")` (etc.) at the point a feature first needs its
 * configuration. Error messages name the missing variables and never include their values.
 */
import { z } from "zod";

const nonEmpty = z.string().trim().min(1);

/** Variables a feature needs in order to work at all. Optional tuning variables are not listed. */
const GROUPS = {
  gemini: ["GEMINI_API_KEY"],
  polar: ["POLAR_ACCESS_TOKEN", "POLAR_WEBHOOK_SECRET"],
  polarCheckout: ["POLAR_ACCESS_TOKEN", "POLAR_MONTHLY_ID", "POLAR_YEARLY_ID", "POLAR_PRODUCT_ID"],
  landingChat: ["GEMINI_API_KEY", "LANDING_ORG_ID", "LANDING_VISITOR_COOKIE_SECRET"],
  email: ["RESEND_API_KEY"],
} as const;

export type EnvGroupName = keyof typeof GROUPS;
type EnvSource = Record<string, string | undefined>;

export class EnvValidationError extends Error {
  readonly missing: string[];
  constructor(group: string, missing: string[]) {
    super(
      `Missing or empty environment variable(s) for "${group}": ${missing.join(", ")}. ` +
        "See .env.example for the full list of names.",
    );
    this.name = "EnvValidationError";
    this.missing = missing;
  }
}

/** Returns the validated values for the group, or throws EnvValidationError naming what is missing. */
export function requireEnvGroup<G extends EnvGroupName>(
  group: G,
  env: EnvSource = process.env,
): Record<(typeof GROUPS)[G][number], string> {
  const names: readonly string[] = GROUPS[group];
  const shape: Record<string, typeof nonEmpty> = {};
  for (const n of names) shape[n] = nonEmpty;
  const result = z.object(shape).safeParse(env);
  if (!result.success) {
    const missing = [...new Set(result.error.issues.map((i) => String(i.path[0])))];
    throw new EnvValidationError(group, missing);
  }
  return result.data as Record<(typeof GROUPS)[G][number], string>;
}

/** Non-throwing variant for diagnostics: names of missing variables, [] when the group is complete. */
export function missingEnv(group: EnvGroupName, env: EnvSource = process.env): string[] {
  try {
    requireEnvGroup(group, env);
    return [];
  } catch (e) {
    if (e instanceof EnvValidationError) return e.missing;
    throw e;
  }
}
