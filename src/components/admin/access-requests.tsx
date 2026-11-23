"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Copy, Mail, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { errorMessage } from "@/lib/error-utils";
import { inviteAuthPath } from "@/lib/onboarding-links";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface AccessRequest {
  id: string;
  name: string;
  email: string;
  institution: string;
  role: string;
  message: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string | null;
  reviewedAt: string | null;
  generatedCode: string | null;
  approvalEmailSentAt?: string | null;
}

type Filter = "pending" | "approved" | "rejected" | "all";

const ROLE_LABELS: Record<string, string> = {
  professor: "Professor",
  instructor: "Instructor / Lecturer",
  high_school_teacher: "High school teacher",
  department_head: "Department head",
  dean: "Dean / Admin",
  ta: "Teaching assistant",
  other: "Other",
};

/** Approved in the last five minutes: the automatic email may still be on its way. */
function justReviewed(iso: string | null): boolean {
  return !!iso && Date.now() - Date.parse(iso) < 5 * 60 * 1000;
}

function ago(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 60) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Opens the admin's mail app with the invite code filled in. Scorpio emails the code itself on
 * approval (onAccessRequestApproved); this is for resending or adding a personal note.
 */
function inviteMailto(r: AccessRequest): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const first = r.name.split(/\s+/)[0] || r.name;
  const body = [
    `Hi ${first},`,
    "",
    `Thanks for your interest in Scorpio. Your access request for ${r.institution} is approved.`,
    "",
    "Create your teacher account here (your access code is already filled in):",
    "",
    `    ${origin}${inviteAuthPath("signup", "network", r.generatedCode ?? "")}`,
    "",
    `If the link doesn't open, go to ${origin}/signup, choose Teacher and enter this code: ${r.generatedCode}`,
    "",
    "The code works once and expires in 60 days. Reply to this email if anything gets in the way.",
    "",
  ].join("\n");
  return `mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent(
    "Your Scorpio access code",
  )}&body=${encodeURIComponent(body)}`;
}

const STATUS_STYLE: Record<AccessRequest["status"], string> = {
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  approved: "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400",
  rejected: "border-border bg-muted text-muted-foreground",
};

function RequestRow({
  r,
  busy,
  onApprove,
  onReject,
}: {
  r: AccessRequest;
  busy: boolean;
  onApprove: (pilot: boolean) => void;
  onReject: () => void;
}) {
  const [open, setOpen] = useState(r.status === "pending");
  const [confirmReject, setConfirmReject] = useState(false);

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success("Code copied");
  };

  return (
    <li className="px-4 py-3">
      <button
        type="button"
        className="flex w-full items-start gap-3 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{r.name}</span>
            <Badge
              variant="outline"
              className={cn("text-[11px] capitalize", STATUS_STYLE[r.status])}
            >
              {r.status}
            </Badge>
          </div>
          <div className="mt-0.5 truncate text-sm text-muted-foreground">
            {r.institution} · {ROLE_LABELS[r.role] ?? r.role}
          </div>
        </div>
        <span
          className="shrink-0 pt-0.5 text-xs text-muted-foreground"
          title={r.createdAt ?? undefined}
        >
          {ago(r.createdAt)}
        </span>
        <ChevronDown
          className={cn(
            "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="mt-3 space-y-3 pl-0 text-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
            <span>
              Email:{" "}
              <a
                className="text-foreground underline-offset-2 hover:underline"
                href={`mailto:${r.email}`}
              >
                {r.email}
              </a>
            </span>
            <span>Submitted: {r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}</span>
            {r.reviewedAt && <span>Reviewed: {new Date(r.reviewedAt).toLocaleString()}</span>}
          </div>

          {r.message ? (
            <p className="whitespace-pre-wrap break-words rounded-md bg-muted/40 px-3 py-2 leading-relaxed">
              {r.message}
            </p>
          ) : (
            <p className="text-muted-foreground italic">No message.</p>
          )}

          {r.generatedCode && (
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-md border border-border/60 px-2.5 py-1 font-mono text-sm tracking-widest">
                {r.generatedCode}
              </code>
              <Button variant="outline" size="sm" onClick={() => copy(r.generatedCode!)}>
                <Copy className="size-3.5" /> Copy
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={inviteMailto(r)}>
                  <Mail className="size-3.5" />{" "}
                  {r.approvalEmailSentAt ? "Email again" : "Email code"}
                </a>
              </Button>
              <span className="text-xs text-muted-foreground">
                {r.approvalEmailSentAt
                  ? `Code emailed automatically ${ago(r.approvalEmailSentAt)}.`
                  : justReviewed(r.reviewedAt)
                    ? "Emailing the code now. Refresh in a minute."
                    : "No automatic email on record. If you haven’t sent the code, use Email code."}
              </span>
            </div>
          )}

          {r.status === "pending" && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => onApprove(false)} disabled={busy}>
                {busy ? (
                  <RefreshCw className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Approve and create code
              </Button>
              <Button size="sm" variant="outline" onClick={() => onApprove(true)} disabled={busy}>
                Approve as pilot
              </Button>
              {confirmReject ? (
                <>
                  <Button size="sm" variant="destructive" onClick={onReject} disabled={busy}>
                    Yes, reject
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmReject(false)}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmReject(true)}
                  disabled={busy}
                >
                  <X className="size-3.5" /> Reject
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function AccessRequests() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  const [search, setSearch] = useState("");

  const call = useCallback(async (body: Record<string, unknown>) => {
    const res = await authenticatedFetch("/api/auth/request-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }, []);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await call({ action: "list" });
      setRequests(data.requests ?? []);
    } catch (e: unknown) {
      setError(errorMessage(e) ?? "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    // Initial load; the setState calls happen after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchRequests();
  }, [fetchRequests]);

  const act = async (r: AccessRequest, action: "approve" | "reject", pilot = false) => {
    setProcessing(r.id);
    setError(null);
    try {
      const data = await call(
        action === "approve" && pilot ? { action, id: r.id, pilot: true } : { action, id: r.id },
      );
      if (action === "approve") {
        // Keep the approved row on screen so the code can be copied or emailed right away.
        setRequests((prev) =>
          prev.map((p) =>
            p.id === r.id
              ? {
                  ...p,
                  status: "approved",
                  generatedCode: data.code,
                  reviewedAt: new Date().toISOString(),
                }
              : p,
          ),
        );
        toast.success(
          `Approved ${r.name}${pilot ? " as a pilot" : ""}. Code ${data.code} is ready to send.`,
        );
      } else {
        setRequests((prev) =>
          prev.map((p) =>
            p.id === r.id ? { ...p, status: "rejected", reviewedAt: new Date().toISOString() } : p,
          ),
        );
        toast.success(`Rejected ${r.name}`);
      }
    } catch (e: unknown) {
      setError(errorMessage(e) ?? `Failed to ${action} request`);
    } finally {
      setProcessing(null);
    }
  };

  const counts = useMemo(
    () => ({
      pending: requests.filter((r) => r.status === "pending").length,
      approved: requests.filter((r) => r.status === "approved").length,
      rejected: requests.filter((r) => r.status === "rejected").length,
      all: requests.length,
    }),
    [requests],
  );

  // Rows approved or rejected in this visit stay under "Pending" until refresh, so the code stays at hand.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      const inFilter =
        filter === "all" || r.status === filter || (filter === "pending" && touched.has(r.id));
      if (!inFilter) return false;
      if (!q) return true;
      return [r.name, r.email, r.institution].some((v) => v?.toLowerCase().includes(q));
    });
  }, [requests, filter, search, touched]);

  const FILTERS: Array<{ value: Filter; label: string }> = [
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
    { value: "all", label: "All" },
  ];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Status">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={filter === f.value ? "secondary" : "ghost"}
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
              <span className="ml-1 tabular-nums text-muted-foreground">{counts[f.value]}</span>
            </Button>
          ))}
        </div>
        <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-60">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, school"
              aria-label="Search access requests"
              className="h-8 pl-8 text-sm"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setTouched(new Set());
              void fetchRequests();
            }}
            disabled={loading}
            aria-label="Refresh"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <div className="rounded-lg border border-border/60">
        {loading && requests.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Loading requests…</p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {search
              ? "Nothing matches that search."
              : filter === "pending"
                ? "No pending requests. You are all caught up."
                : "Nothing here yet."}
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {visible.map((r) => (
              <RequestRow
                key={r.id}
                r={r}
                busy={processing === r.id}
                onApprove={(pilot) => {
                  setTouched((s) => new Set(s).add(r.id));
                  void act(r, "approve", pilot);
                }}
                onReject={() => {
                  setTouched((s) => new Set(s).add(r.id));
                  void act(r, "reject");
                }}
              />
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Approving creates a single-use teacher code that lasts 60 days. &ldquo;Email code&rdquo;
        opens your mail app with a ready message; nothing is sent until you send it.
      </p>
    </section>
  );
}
