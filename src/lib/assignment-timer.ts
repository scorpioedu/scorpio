// Pure decision logic for the assignment countdown (H-002). Kept free of React so it can be unit tested.

export const GRACE_PERIOD_SECONDS = 300;

export type TimerExpiryAction = "none" | "start-grace" | "submit";

/**
 * What to do on a countdown tick.
 * - time remaining: nothing
 * - main timer hit zero and the assignment requires uploaded work: start the 5 minute grace period
 * - otherwise (main timer without work upload, or the grace period itself ran out): auto-submit
 */
export function getTimerExpiryAction(
  timeLeft: number | null,
  inGracePeriod: boolean,
  hasGraceOption: boolean
): TimerExpiryAction {
  if (timeLeft === null || timeLeft > 0) return "none";
  if (inGracePeriod) return "submit";
  return hasGraceOption ? "start-grace" : "submit";
}
