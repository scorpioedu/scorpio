/** Copy for the credits launch email (scripts/send-credits-announcement.mjs). Pure; type-only import. */
import type { MigrationGroup } from "./credit-migration";

export interface AnnouncementInput {
  name?: unknown;
  /** null: the teacher has no network. */
  group: MigrationGroup | null;
  /** Credit the migration put on the network, in cents (ledger amount). */
  grantCents: number;
  /** ISO expiry of the bonus bucket. */
  expiresAt?: string | null;
  /** Rounded hint count for the $1 monthly allowance, e.g. 850. */
  hints: number;
}

export const ANNOUNCEMENT_SUBJECT = "Scorpio is now free, with AI you top up";

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function formatDate(iso?: string | null): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "12 months from now";
  return new Date(t).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Round to the nearest 50 so the copy says "about 850", not "853". */
export const roundHints = (n: number) => Math.max(50, Math.round(n / 50) * 50);

export function thankYouFor(group: MigrationGroup | null): string | null {
  if (group === "free" || group === "other") return "$5";
  if (group === "yearly") return "$10";
  return null;
}

export function planParagraphFor(i: AnnouncementInput): string {
  if (i.group === null) return "Create or join a network on Teacher Home to start using your free $1 a month.";
  if (i.group === "pilot")
    return `Your pilot's remaining AI (${dollars(i.grantCents)}) is now credit on your balance and lasts until ${formatDate(i.expiresAt)}.`;
  if (i.group === "yearly" && i.grantCents > 1000)
    return `Your yearly plan's unused AI budget (${dollars(i.grantCents - 1000)}) also moved to your balance, so it now holds ${dollars(i.grantCents)} of bonus credit, lasting until ${formatDate(i.expiresAt)}.`;
  return "";
}

export function firstNameOf(name: unknown): string {
  const first = typeof name === "string" ? (name.trim().split(/\s+/)[0] ?? "") : "";
  // Placeholder display names read badly in a greeting; fall back to "Hi,".
  return /^(unknown|user|teacher|test)$/i.test(first) ? "" : first;
}

export function buildAnnouncement(i: AnnouncementInput): { subject: string; text: string; html: string } {
  const thank = thankYouFor(i.group);
  const hello = firstNameOf(i.name) ? `Hi ${firstNameOf(i.name)},` : "Hi,";
  const ai =
    `AI features like Raise and written-answer grading now run on an AI balance. Every network gets $1 of AI free each month (about ${i.hints.toLocaleString("en-US")} Raise hints at today's rates)` +
    (thank ? `, and we've added ${thank} to your balance as a thank-you for being early` : "") +
    ". If you ever need more, you can top up from $5. We charge exactly what Google charges us, and Polar's processing fee is shown before you pay.";
  const paragraphs = [
    "From today, everything in Scorpio is free for every teacher, including department sets and sharing that used to need a Department License.",
    ai,
    planParagraphFor(i),
    "Invite a colleague: when they get their first class results, you get $5 of AI credit and they get $2. Your link is on Teacher Home.",
    "Nothing else changes: your classes, assignments and student limits stay as they are.",
    "Reply to this email with any questions. I read every one.",
  ].filter(Boolean);
  const text = `${hello}\n\n${paragraphs.join("\n\n")}\n\nRushil`;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111">` +
    [hello, ...paragraphs, "Rushil"].map((p) => `<p style="margin:0 0 14px">${esc(p)}</p>`).join("") +
    `</div>`;
  return { subject: ANNOUNCEMENT_SUBJECT, text, html };
}
