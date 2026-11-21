"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { AdminHeader, StatTile } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TeacherRow {
  uid: string;
  name: string;
  email: string;
  organizationId: string | null;
  networkName: string | null;
  isOwner: boolean;
  planId: string | null;
  pilotStatus: string | null;
  students: number;
  inviteLabel: string | null;
  signedUpAt: string | null;
  lastSignInAt: string | null;
  lastActiveAt: string | null;
  hasAuthAccount: boolean;
  disabled: boolean;
}
interface IncompleteRow {
  uid: string;
  email: string;
  name: string;
  createdAt: string | null;
  lastSignInAt: string | null;
  lastActiveAt: string | null;
}
interface TeachersData {
  teachers: TeacherRow[];
  incomplete: IncompleteRow[];
  generatedAt: string;
}
type Lookup =
  | {
      email: string;
      status: "no_account";
      invites: { code: string; isUsed: boolean; isPilot: boolean; expiresAt: string | null }[];
    }
  | {
      email: string;
      status: "no_profile";
      createdAt: string | null;
      lastSignInAt: string | null;
      lastActiveAt: string | null;
    }
  | { email: string; status: "no_network"; role: string; lastActiveAt: string | null }
  | {
      email: string;
      status: "teacher" | "other_role";
      role: string;
      networkName: string | null;
      planId: string;
      pilotStatus: string | null;
      lastActiveAt: string | null;
    };

const DAY = 24 * 60 * 60 * 1000;

const isPast = (iso: string | null) => !!iso && Date.parse(iso) <= Date.now();
const withinDays = (iso: string | null, days: number) =>
  !!iso && Date.now() - Date.parse(iso) < days * DAY;

/** "3h ago", "5d ago", or a date for anything older than a month. */
function ago(iso: string | null) {
  if (!iso) return "never";
  const ms = Date.now() - Date.parse(iso);
  if (ms < 60 * 60 * 1000) return `${Math.max(1, Math.round(ms / 60000))}m ago`;
  if (ms < DAY) return `${Math.round(ms / 3600000)}h ago`;
  if (ms < 30 * DAY) return `${Math.round(ms / DAY)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function PlanBadge({ planId, pilotStatus }: { planId: string | null; pilotStatus: string | null }) {
  if (!planId) return <span className="text-muted-foreground">—</span>;
  const pilot = planId === "pilot";
  const free = planId === "free";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        pilot
          ? "bg-violet-500/10 text-violet-600"
          : free
            ? "bg-muted text-muted-foreground"
            : "bg-emerald-500/10 text-emerald-600",
      )}
    >
      {pilot ? "Pilot" : free ? "Free" : "Paid"}
      {!pilot && pilotStatus === "converted" && " · ex-pilot"}
      {!pilot && pilotStatus === "ended" && " · pilot ended"}
    </span>
  );
}

export default function AdminTeachersPage() {
  const [data, setData] = useState<TeachersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [pilotsOnly, setPilotsOnly] = useState(false);
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authenticatedFetch("/api/admin/teachers");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not load teachers");
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load teachers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const runLookup = async () => {
    setLookup(null);
    setLookupError(null);
    try {
      const res = await authenticatedFetch(
        `/api/admin/teachers?${new URLSearchParams({ email: lookupEmail.trim() })}`,
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Lookup failed");
      setLookup(body);
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : "Lookup failed");
    }
  };

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (data?.teachers ?? []).filter(
      (t) =>
        (!pilotsOnly || t.planId === "pilot" || t.pilotStatus) &&
        (!q ||
          t.name.toLowerCase().includes(q) ||
          t.email.toLowerCase().includes(q) ||
          t.networkName?.toLowerCase().includes(q)),
    );
  }, [data, filter, pilotsOnly]);

  const teachers = data?.teachers ?? [];
  const activeWeek = teachers.filter((t) => withinDays(t.lastActiveAt, 7)).length;
  const pilots = teachers.filter((t) => t.planId === "pilot").length;

  return (
    <>
      <AdminHeader
        title="Teachers"
        description="Everyone teaching on Scorpio, their network and plan, and when they were last in the app."
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      {error && (
        <p role="alert" className="mb-6 text-sm text-destructive">
          {error}{" "}
          <button type="button" className="underline" onClick={() => void load()}>
            Try again
          </button>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Teachers" value={data ? teachers.length : "—"} />
        <StatTile
          label="Active this week"
          value={data ? activeWeek : "—"}
          hint="from sign-in sessions"
        />
        <StatTile label="In a pilot" value={data ? pilots : "—"} href="/admin/pilots" />
        <StatTile
          label="Never finished signup"
          value={data ? data.incomplete.length : "—"}
          hint="signed in, no profile"
          tone={data && data.incomplete.length > 0 ? "warn" : undefined}
        />
      </div>

      <section className="mt-8 space-y-3 rounded-lg border border-border/60 p-4">
        <div>
          <h2 className="text-sm font-medium">Look up a person</h2>
          <p className="text-xs text-muted-foreground">
            Has this person signed in? Did they finish signup? Which network are they in?
          </p>
        </div>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void runLookup();
          }}
        >
          <Input
            type="email"
            value={lookupEmail}
            onChange={(e) => setLookupEmail(e.target.value)}
            placeholder="teacher@school.org"
            aria-label="Email to look up"
            className="h-8 sm:w-80"
          />
          <Button size="sm" type="submit" disabled={!lookupEmail.includes("@")}>
            Look up
          </Button>
        </form>
        {lookupError && <p className="text-sm text-destructive">{lookupError}</p>}
        {lookup && <LookupResult r={lookup} />}
      </section>

      <section className="mt-8 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium">All teachers</h2>
          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={pilotsOnly}
                onChange={(e) => setPilotsOnly(e.target.checked)}
              />
              Pilots only
            </label>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by name, email or network"
                aria-label="Filter teachers"
                className="h-8 pl-8 text-sm"
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Teacher</th>
                <th className="px-4 py-2 font-medium">Network</th>
                <th className="px-4 py-2 font-medium">Plan</th>
                <th className="px-4 py-2 text-right font-medium">Students</th>
                <th className="px-4 py-2 font-medium">Signed up</th>
                <th className="px-4 py-2 font-medium">Last active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((t) => (
                <tr key={t.uid} className="hover:bg-muted/20">
                  <td className="px-4 py-2">
                    <div className="font-medium">{t.name || "(no name)"}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.email}
                      {t.disabled && " · disabled"}
                      {!t.hasAuthAccount && " · no login account"}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {t.networkName ?? <span className="text-amber-600">No network</span>}
                    {t.isOwner && (
                      <span className="ml-1 text-xs text-muted-foreground">(owner)</span>
                    )}
                    {t.inviteLabel && (
                      <div className="text-xs text-muted-foreground">via {t.inviteLabel}</div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <PlanBadge planId={t.planId} pilotStatus={t.pilotStatus} />
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{t.students}</td>
                  <td className="px-4 py-2 text-muted-foreground">{ago(t.signedUpAt)}</td>
                  <td
                    className="px-4 py-2"
                    title={
                      t.lastSignInAt
                        ? `Last sign-in ${new Date(t.lastSignInAt).toLocaleString()}`
                        : undefined
                    }
                  >
                    {ago(t.lastActiveAt)}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    {filter || pilotsOnly ? "No teacher matches." : "No teachers yet."}
                  </td>
                </tr>
              )}
              {loading && !data && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {data && data.incomplete.length > 0 && (
        <section className="mt-10 space-y-3">
          <div>
            <h2 className="text-sm font-medium">Signed in but never finished signup</h2>
            <p className="text-xs text-muted-foreground">
              These accounts exist in Firebase Auth with no Scorpio profile, usually because they
              had no invite or class code.
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Account</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2 font-medium">Last active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data.incomplete.map((a) => (
                  <tr key={a.uid}>
                    <td className="px-4 py-2">
                      <div className="font-medium">{a.name || a.email || a.uid}</div>
                      {a.name && <div className="text-xs text-muted-foreground">{a.email}</div>}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{ago(a.createdAt)}</td>
                    <td className="px-4 py-2">{ago(a.lastActiveAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data && (
        <p className="mt-6 text-xs text-muted-foreground">
          Last active comes from Firebase Auth session refreshes. Updated{" "}
          {new Date(data.generatedAt).toLocaleTimeString()}.
        </p>
      )}
    </>
  );
}

function LookupResult({ r }: { r: Lookup }) {
  const box = "rounded-md bg-muted/40 px-3 py-2 text-sm";
  switch (r.status) {
    case "no_account":
      return (
        <div className={box}>
          <p>
            <strong>{r.email}</strong> has never signed in to Scorpio.
          </p>
          {r.invites.length > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Invites sent to this email:{" "}
              {r.invites
                .map(
                  (i) =>
                    `${i.code}${i.isPilot ? " (pilot)" : ""}${i.isUsed ? ", used" : isPast(i.expiresAt) ? ", expired" : ", unused"}`,
                )
                .join("; ")}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              No invite code has been sent to this email. Create a pilot invite under Pilots.
            </p>
          )}
        </div>
      );
    case "no_profile":
      return (
        <div className={box}>
          <p>
            <strong>{r.email}</strong> signed in ({ago(r.lastActiveAt)}) but never finished signup,
            so they have no profile or network.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Send them an invite link (a pilot invite, if they&apos;re a pilot teacher).
          </p>
        </div>
      );
    case "no_network":
      return (
        <div className={box}>
          <strong>{r.email}</strong> is a {r.role} with no network. Last active{" "}
          {ago(r.lastActiveAt)}.
        </div>
      );
    default:
      return (
        <div className={box}>
          <strong>{r.email}</strong> is a {r.role} in{" "}
          <strong>{r.networkName ?? "an unnamed network"}</strong>{" "}
          <PlanBadge planId={r.planId} pilotStatus={r.pilotStatus} />. Last active{" "}
          {ago(r.lastActiveAt)}.
        </div>
      );
  }
}
