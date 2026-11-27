/**
 * The teacher changelog ("What's new" card on teacher pages, src/components/teacher/whats-new.tsx).
 *
 * To announce a change, add an entry at the TOP. Teachers see every entry newer than the one they
 * last dismissed (`preferences.whatsNewSeen`), except entries dated before their account existed.
 * Keep each entry short: a title and a few one-line items.
 */
export interface WhatsNewItem {
  text: string;
  /** Optional in-app link for this line. */
  href?: string;
  linkLabel?: string;
}

export interface WhatsNewEntry {
  /** Stable and unique; never reuse or rename once shipped. */
  id: string;
  /** YYYY-MM-DD, the day it shipped. */
  date: string;
  title: string;
  items: WhatsNewItem[];
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: "2026-11-27-student-raise-off",
    date: "2026-11-27",
    title: "Raise is now off for students unless you turn it on",
    items: [
      {
        text: "Students no longer see Raise, hints or the page-finding assistant by default. Study, lessons, practice and marking never used AI and work as before.",
      },
      {
        text: 'To give a class Raise back, open the class\'s settings and tick "Let students in this class use Raise". Hints on an assignment also need "Allow Raise hints" on that assignment.',
        href: "/teacher/students",
        linkLabel: "Open your classes",
      },
      {
        text: "Written answers now wait for you: Raise drafts a score and feedback, and the student sees them only after you check them and save. Multiple choice and numeric answers are still graded at once.",
        href: "/teacher/grades",
        linkLabel: "Open grading",
      },
      {
        text: "Your other AI tools are unchanged: writing and importing problems, and Raise for teachers.",
      },
    ],
  },
  {
    id: "2026-11-23-free-ai-credits",
    date: "2026-11-23",
    title: "Scorpio is now free",
    items: [
      {
        text: "Everything is included for every teacher, including department sets and sharing.",
      },
      {
        text: "AI features run on your network's balance: $1 free every month, and you can top up from $5 at Google's exact cost.",
        href: "/teacher/network/billing",
        linkLabel: "See your AI balance",
      },
      {
        text: "Invite a colleague: when their class gets its first results, you get $5 of AI credit and they get $2.",
        href: "/teacher",
        linkLabel: "Get your link",
      },
      {
        text: "You can set an optional monthly AI spend cap in Network settings.",
        href: "/teacher/network",
        linkLabel: "Network settings",
      },
    ],
  },
];

function toMillis(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  const v = value as { toMillis?: () => number; seconds?: number };
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  return null;
}

/**
 * Entries this teacher has not dismissed yet, newest first. `seenId` is the newest entry they
 * dismissed; an unknown id (say, an entry removed later) counts as nothing seen. Entries that
 * shipped before the account was created are skipped: a new teacher has nothing to catch up on.
 */
export function unseenWhatsNew(
  seenId: string | null | undefined,
  accountCreatedAt: unknown,
  entries: WhatsNewEntry[] = WHATS_NEW,
): WhatsNewEntry[] {
  const seenIndex = seenId ? entries.findIndex((e) => e.id === seenId) : -1;
  const candidates = seenIndex >= 0 ? entries.slice(0, seenIndex) : entries;
  const created = toMillis(accountCreatedAt);
  if (created === null) return candidates;
  // An entry dated the same day as the account still shows: the account may predate the change.
  return candidates.filter((e) => Date.parse(`${e.date}T23:59:59Z`) >= created);
}
