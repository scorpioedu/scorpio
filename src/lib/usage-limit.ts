import { adminDb } from "./firebase-admin";
import { evaluateBudget } from "../../functions/src/budget-policy";

/**
 * Cheap pre-check before an AI request. The rules live in evaluateBudget (functions/src/budget-policy.ts),
 * shared with reserveBudget, which is the transactional enforcement point.
 */
export async function checkBudget(
  organizationId: string | undefined | null,
  type?: string,
  userId?: string,
): Promise<{ allowed: boolean; error?: string }> {
  if (!organizationId) {
    return { allowed: false, error: "AI Features require a Department License." };
  }

  if (!adminDb) return { allowed: false, error: "Database not initialized" };

  try {
    const orgDoc = await adminDb.collection("organizations").doc(organizationId).get();
    if (!orgDoc.exists) return { allowed: false, error: "Scorpio Network not found." };

    const data = orgDoc.data();
    const userData = userId ? (await adminDb.collection("users").doc(userId).get()).data() : null;

    const decision = evaluateBudget(data, userData, type);
    if (decision.allowed) return { allowed: true };

    const budgetLimit = data?.aiBudgetLimit || 0;
    const isFree = !data?.planId || data.planId === "free";
    const isPilot = data?.planId === "pilot";
    switch (decision.reason) {
      case "subscription_inactive":
        return {
          allowed: false,
          error: isPilot
            ? "Your Scorpio pilot has ended. Contact the Scorpio team to extend it or continue on a Department License."
            : "Your subscription is no longer active.",
        };
      case "budget_exhausted":
        return {
          allowed: false,
          error: isPilot
            ? "Your pilot AI budget is used up. Contact the Scorpio team and we'll top it up."
            : isFree
              ? "Free starter AI budget reached. Upgrade to a Department License in Network settings for unlimited AI access."
              : `Monthly AI budget ($${(budgetLimit / 100).toFixed(2)}) reached. Please increase your limit in Network settings.`,
        };
      case "user_allowance_reached":
        return {
          allowed: false,
          error:
            type === "tutor"
              ? `You have used all ${data?.aiTutorLimitPerStudent || 0} of your Raise messages for this period. Contact your teacher to increase your allowance.`
              : `You have reached your limit of ${data?.aiNotebookLimitPerStudent || 0} AI notebook interactions for this period.`,
        };
    }
  } catch (error) {
    console.error("Error in checkBudget:", error);
    return { allowed: false, error: "System check failed" };
  }
}

/**
 * Records exact token usage after an AI request is completed.
 * This is called from the backend API routes using 'usageMetadata' returned from the model.
 */
export async function recordUsage(
  _organizationId: string | undefined | null,
  _type: string,
  _inputTokens: number,
  _outputTokens: number,
  _userId?: string,
): Promise<{ success: boolean; overLimit?: boolean }> {
  // Provider calls settle usage transactionally, even when downstream parsing fails.
  return { success: true };
}
