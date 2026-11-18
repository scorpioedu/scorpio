import chatbotConfig from "./chatbot-config.json";

/**
 * Every rate-limit budget in one place (RT-11). Rationale for each number: docs/quality-audit/remediation/RT-11-LIMITS.md.
 * Authenticated routes are keyed by uid (a school can put a whole class behind one IP); the `ip` routes
 * are the unauthenticated ones and are keyed by the platform-trusted client IP.
 *
 * `onError: "closed"` keeps the pre-RT-11 behaviour (limiter failure blocks the request) for the routes that
 * already had a limiter and for brute-force targets; `"open"` lets the request through when Firestore is down.
 */
export interface RateLimitPolicy {
  windowMs: number;
  maxRequests: number;
  onError: "open" | "closed";
  /**
   * Anonymous (IP-keyed) routes only: what to do when no trusted client IP is available (e.g. Firebase Hosting
   * sends no x-vercel-forwarded-for). "skip" = no limit; a number = one generous global cap per window under
   * `anon_<kind>`, which always fails open. Never a small shared bucket, which would lock out every visitor.
   */
  noIp?: "skip" | number;
}

const MINUTE = 60_000;

export const RATE_LIMITS = {
  // Routes that already had a limiter: numbers unchanged.
  chat: {
    windowMs: chatbotConfig.rateLimit.windowMs,
    maxRequests: chatbotConfig.rateLimit.maxRequests,
    onError: "closed",
  },
  generate: { windowMs: MINUTE, maxRequests: 5, onError: "closed" },
  notebook: { windowMs: MINUTE, maxRequests: 20, onError: "closed" },
  landing: { windowMs: MINUTE, maxRequests: 5, onError: "closed" },

  // AI routes, per uid.
  tutor: { windowMs: MINUTE, maxRequests: 20, onError: "open" },
  parse: { windowMs: MINUTE, maxRequests: 10, onError: "open" },
  rubric: { windowMs: MINUTE, maxRequests: 30, onError: "open" },
  title: { windowMs: MINUTE, maxRequests: 30, onError: "open" },
  limitsChat: { windowMs: MINUTE, maxRequests: 20, onError: "open" },
  grade: { windowMs: MINUTE, maxRequests: 30, onError: "open" },
  portfolio: { windowMs: MINUTE, maxRequests: 10, onError: "open" },
  research: { windowMs: MINUTE, maxRequests: 30, onError: "open" },

  // Other authenticated routes, per uid.
  checkout: { windowMs: MINUTE, maxRequests: 10, onError: "open" },
  support: { windowMs: MINUTE, maxRequests: 5, onError: "open" },
  session: { windowMs: MINUTE, maxRequests: 60, onError: "open" },
  register: { windowMs: MINUTE, maxRequests: 20, onError: "open" },
  write: { windowMs: MINUTE, maxRequests: 120, onError: "open" },
  insights: { windowMs: MINUTE, maxRequests: 30, onError: "open" },

  // Unauthenticated routes, per trusted client IP.
  teacherCode: { windowMs: MINUTE, maxRequests: 30, onError: "closed", noIp: 600 },
  requestAccess: { windowMs: MINUTE, maxRequests: 20, onError: "closed", noIp: 600 },
  githubStats: { windowMs: MINUTE, maxRequests: 30, onError: "open", noIp: "skip" },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitKind = keyof typeof RATE_LIMITS;
