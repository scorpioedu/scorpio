/**
 * Route prefixes whose pages read the Firebase auth session (via `useAuth`) or sign users in.
 * Every other page (landing, pricing, docs, demos, ...) renders without starting the auth
 * listener, so it does not download Firestore or initialise App Check/reCAPTCHA. (I-019)
 */
export const AUTH_ROUTE_PREFIXES = ["/student", "/teacher", "/admin", "/login", "/signup", "/join"] as const;

/** An unknown pathname (null) keeps the previous behaviour of starting auth. */
export function pathNeedsAuth(pathname: string | null): boolean {
  if (pathname === null) return true;
  return AUTH_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
