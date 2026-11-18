import { SUPPORT_TICKET_STATUSES } from "@/lib/schemas/api-bodies";

export const SUPPORT_TICKETS = "support_tickets";
export type TicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];
export const TICKET_CATEGORIES = ["bug", "feature", "question"] as const;

/** Feedback should be answered within two days (docs/launch-plan.md, Pilot). */
export const ANSWER_TARGET_MS = 2 * 24 * 60 * 60 * 1000;
export const NEW_TICKET_MS = 24 * 60 * 60 * 1000;

export interface SerialisedTicket {
  id: string;
  ticketId: string;
  title: string;
  description: string;
  context: string | null;
  category: string;
  status: TicketStatus;
  source: string;
  pageUrl: string;
  userRole: string;
  appContext: string | null;
  userEmail: string | null;
  userName: string | null;
  screenshotCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  adminNote: string;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

function iso(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  if (v && typeof (v as { toDate?: unknown }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

/** Drops screenshots (large data URLs) and normalises legacy tickets that have no status. */
export function serialiseTicket(id: string, data: Record<string, unknown>): SerialisedTicket {
  const status = SUPPORT_TICKET_STATUSES.includes(data.status as TicketStatus)
    ? (data.status as TicketStatus)
    : "open";
  return {
    id,
    ticketId: str(data.ticketId) || id,
    title: str(data.title),
    description: str(data.description),
    context: strOrNull(data.context),
    category: str(data.category) || "bug",
    status,
    source: str(data.source) || "navigation-chatbot",
    pageUrl: str(data.pageUrl),
    userRole: str(data.userRole),
    appContext: strOrNull(data.appContext),
    userEmail: strOrNull(data.userEmail),
    userName: strOrNull(data.userName),
    screenshotCount: Array.isArray(data.screenshots) ? data.screenshots.length : 0,
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
    updatedBy: strOrNull(data.updatedBy),
    adminNote: str(data.adminNote),
  };
}

export interface TicketSummary {
  total: number;
  open: number;
  triaged: number;
  done: number;
  /** Created in the last 24 hours. */
  newLast24h: number;
  /** Still `open` after more than two days: the answer target has been missed. */
  openOverTwoDays: number;
}

export function summariseTickets(
  tickets: SerialisedTicket[],
  now: number = Date.now(),
): TicketSummary {
  const summary: TicketSummary = {
    total: tickets.length,
    open: 0,
    triaged: 0,
    done: 0,
    newLast24h: 0,
    openOverTwoDays: 0,
  };
  for (const t of tickets) {
    summary[t.status] += 1;
    const created = t.createdAt ? Date.parse(t.createdAt) : NaN;
    if (Number.isNaN(created)) continue;
    if (now - created < NEW_TICKET_MS) summary.newLast24h += 1;
    if (t.status === "open" && now - created > ANSWER_TARGET_MS) summary.openOverTwoDays += 1;
  }
  return summary;
}
