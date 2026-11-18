# Pilot feedback

## How it flows

1. Any signed-in user (teacher, student, admin) sees a small **Feedback** button, bottom right above the Support chat button. It is hidden on public pages and on full-screen student work (assignment view, tutor).
2. The dialog asks for **Suggest a feature** or **Report a problem**, a message, and optionally what they were trying to do.
3. It posts to `POST /api/support/report` with `source: "feedback-widget"`. "Suggest a feature" is stored as category `feature`, "Report a problem" as `bug`. The page path (no query string), role, app area and the user's own id, email and name are recorded. No page content or student data is sent.
4. The route writes a document to `support_tickets` with the ticket id (`SC-FEAT-…` / `SC-BUG-…`) and status `open`. The user sees the ticket id on success. If the ticket could not be stored the route returns 503 and the dialog shows an error, never a success.

The Support chat (navigation chatbot) writes to the same collection with `source: "navigation-chatbot"`, so both land in one list.

## Reading it daily

Open **/admin/feedback** (admin claim required; linked from the admin sidebar). Tickets are newest first. Filter by status and type. The strip at the top shows open tickets, tickets new in the last 24 hours, and **open over 2 days**, which is the answer target from the launch plan. New tickets (under 24 hours) have a highlighted border.

## Statuses

| Status | Meaning |
|---|---|
| `open` | Not looked at yet (default). |
| `triaged` | Read, replied to or added to the build list. |
| `done` | Answered and shipped or closed. |

Each change records `updatedAt` and `updatedBy`. The internal note is for us only and is never shown to the user.

## Access

`support_tickets` has no client rules, so Firestore denies all client reads and writes (pinned in `tests/security/rules-rt14.test.ts`). Only the server, through the Admin SDK, reads and writes it, via `/api/support/report` (any signed-in user, create only) and `/api/admin/support` (GET list, PATCH triage; admin claim only).
