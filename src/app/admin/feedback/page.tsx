"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAdminAccess } from "@/lib/use-admin-access";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import type { SerialisedTicket, TicketStatus, TicketSummary } from "@/lib/support/tickets";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

const STATUS_FILTERS: Array<{ value: "all" | TicketStatus; label: string }> = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "triaged", label: "Triaged" },
  { value: "done", label: "Done" },
];
const CATEGORY_FILTERS = [
  { value: "all", label: "All types" },
  { value: "bug", label: "Problems" },
  { value: "feature", label: "Feature ideas" },
  { value: "question", label: "Questions" },
];
const NEW_MS = 24 * 60 * 60 * 1000;
const OVERDUE_MS = 2 * NEW_MS;

function formatWhen(iso: string | null): string {
  if (!iso) return "unknown time";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "unknown time" : d.toLocaleString();
}

function TicketCard({
  ticket,
  onSaved,
}: {
  ticket: SerialisedTicket;
  onSaved: (t: SerialisedTicket) => void;
}) {
  const [note, setNote] = useState(ticket.adminNote);
  const [saving, setSaving] = useState(false);
  const created = ticket.createdAt ? Date.parse(ticket.createdAt) : NaN;
  const [now] = useState(() => Date.now());
  const age = Number.isNaN(created) ? 0 : now - created;
  const isNew = age < NEW_MS && !Number.isNaN(created);
  const overdue = ticket.status === "open" && age > OVERDUE_MS;

  async function save(patch: { status?: TicketStatus; note?: string }) {
    setSaving(true);
    try {
      const res = await authenticatedFetch("/api/admin/support", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ticket.id, ...patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save");
      onSaved(data.ticket);
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className={isNew ? "border-primary/60" : undefined}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono text-muted-foreground">{ticket.ticketId}</span>
          <Badge variant="outline">{ticket.category}</Badge>
          <Badge variant={ticket.status === "open" ? "default" : "secondary"}>
            {ticket.status}
          </Badge>
          {isNew && <Badge>New</Badge>}
          {overdue && <Badge variant="destructive">Open over 2 days</Badge>}
          <span className="text-muted-foreground">{formatWhen(ticket.createdAt)}</span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm">{ticket.description}</p>
        {ticket.context && (
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
            Trying to do: {ticket.context}
          </p>
        )}
        <dl className="grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="inline">Page: </dt>
            <dd className="inline break-all">{ticket.pageUrl || "unknown"}</dd>
          </div>
          <div>
            <dt className="inline">Role: </dt>
            <dd className="inline">{ticket.userRole || "unknown"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="inline">From: </dt>
            <dd className="inline break-all">{ticket.userEmail || ticket.userName || "unknown"}</dd>
          </div>
        </dl>
        <div className="space-y-2 border-t pt-3">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Internal note (not shown to the user)"
            aria-label={`Internal note for ${ticket.ticketId}`}
            rows={2}
            maxLength={5000}
          />
          <div className="flex flex-wrap items-center gap-2">
            {(["open", "triaged", "done"] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={ticket.status === s ? "secondary" : "outline"}
                disabled={saving || ticket.status === s}
                onClick={() => save({ status: s })}
              >
                Mark {s}
              </Button>
            ))}
            <Button
              size="sm"
              disabled={saving || note === ticket.adminNote}
              onClick={() => save({ note })}
            >
              Save note
            </Button>
            {ticket.updatedAt && (
              <span className="text-xs text-muted-foreground">
                Updated {formatWhen(ticket.updatedAt)}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FeedbackAdminPage() {
  const access = useAdminAccess();
  const [status, setStatus] = useState<"all" | TicketStatus>("open");
  const [category, setCategory] = useState("all");
  const [tickets, setTickets] = useState<SerialisedTicket[]>([]);
  const [summary, setSummary] = useState<TicketSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status !== "all") params.set("status", status);
      if (category !== "all") params.set("category", category);
      const res = await authenticatedFetch(`/api/admin/support?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load feedback");
      setTickets(data.tickets);
      setSummary(data.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load feedback");
    } finally {
      setLoading(false);
    }
  }, [status, category]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the server when its inputs change; state is set as the request starts and finishes
    if (access === "admin") void load();
  }, [access, load]);

  if (access !== "admin") {
    return (
      <main className="mx-auto max-w-md p-8 text-center text-sm text-muted-foreground">
        {access === "loading"
          ? "Checking your account…"
          : access === "signed-out"
            ? "Sign in with an administrator account to continue."
            : "This account does not have administrator access."}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <div className="space-y-2 border-b pb-5">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Admin
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Feedback</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Feature ideas and problem reports from the Feedback button and the Support chat. Answer
          within two days.
        </p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Summary">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-semibold">{summary.open}</div>
              <div className="text-xs text-muted-foreground">Open</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-semibold">{summary.newLast24h}</div>
              <div className="text-xs text-muted-foreground">New in 24 hours</div>
            </CardContent>
          </Card>
          <Card className={summary.openOverTwoDays > 0 ? "border-destructive/60" : undefined}>
            <CardContent className="p-4">
              <div className="text-2xl font-semibold">{summary.openOverTwoDays}</div>
              <div className="text-xs text-muted-foreground">Open over 2 days</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-semibold">{summary.triaged}</div>
              <div className="text-xs text-muted-foreground">Triaged</div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={status === f.value ? "secondary" : "outline"}
            aria-pressed={status === f.value}
            onClick={() => setStatus(f.value)}
          >
            {f.label}
          </Button>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
        {CATEGORY_FILTERS.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={category === f.value ? "secondary" : "outline"}
            aria-pressed={category === f.value}
            onClick={() => setCategory(f.value)}
          >
            {f.label}
          </Button>
        ))}
        {loading && (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}{" "}
          <button type="button" className="underline" onClick={() => void load()}>
            Try again
          </button>
        </p>
      )}

      {!loading && !error && tickets.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing here. Change the filters to see other tickets.
        </p>
      )}

      <div className="space-y-3">
        {tickets.map((t) => (
          <TicketCard
            key={t.id}
            ticket={t}
            onSaved={(u) => {
              setTickets((prev) => prev.map((p) => (p.id === u.id ? u : p)));
              void load();
            }}
          />
        ))}
      </div>
    </main>
  );
}
