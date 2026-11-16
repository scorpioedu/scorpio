import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { releaseStaleReservations } from "./metering";

/**
 * Safety net for AI budget holds: a crashed or timed-out request can leave an ai_reservations
 * document pending forever, permanently inflating organizations.aiUsageReserved.
 */
export const expireStaleReservations = onSchedule({
    schedule: "every 15 minutes",
    timeoutSeconds: 120,
    memory: "256MiB"
}, async () => {
    const expired = await releaseStaleReservations(admin.firestore());
    logger.info("Expired stale AI reservations", { expired });
});
