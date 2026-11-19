"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import type { UserSummary } from "@/lib/admin/summaries";
import type { TicketSummary } from "@/lib/support/tickets";
import { AdminHeader, StatTile } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Overview {
  users: UserSummary;
  pendingAccessRequests: number;
  tickets: TicketSummary;
  generatedAt: string;
}

const fmt = (n: number) => n.toLocaleString();

export default function AdminOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authenticatedFetch("/api/admin/overview");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not load overview");
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial load; the setState calls happen after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const orgs = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const all = data?.users.organizations ?? [];
    return q ? all.filter((o) => o.name.toLowerCase().includes(q) || o.id.includes(q)) : all;
  }, [data, filter]);

  const u = data?.users;

  return (
    <>
      <AdminHeader
        title="Overview"
        description="How many people use Scorpio, and what is waiting on you."
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

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Users</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Total users"
            value={u ? fmt(u.total) : "—"}
            hint={u ? `+${fmt(u.newLast7d)} this week · +${fmt(u.newLast30d)} in 30 days` : " "}
          />
          <StatTile label="Teachers" value={u ? fmt(u.teachers) : "—"} />
          <StatTile label="Students" value={u ? fmt(u.students) : "—"} />
          <StatTile
            label="Signed in this week"
            value={u ? fmt(u.activeLast7d) : "—"}
            hint={
              u && u.total ? `${Math.round((u.activeLast7d / u.total) * 100)}% of all users` : " "
            }
          />
        </div>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-medium">Waiting on you</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Access requests"
            value={data ? fmt(data.pendingAccessRequests) : "—"}
            hint="pending review"
            tone={data && data.pendingAccessRequests > 0 ? "warn" : undefined}
            href="/admin/access"
          />
          <StatTile
            label="Open tickets"
            value={data ? fmt(data.tickets.open) : "—"}
            hint={data ? `${fmt(data.tickets.newLast24h)} new in 24 hours` : " "}
            href="/admin/feedback"
          />
          <StatTile
            label="Open over 2 days"
            value={data ? fmt(data.tickets.openOverTwoDays) : "—"}
            hint="past the answer target"
            tone={data && data.tickets.openOverTwoDays > 0 ? "danger" : undefined}
            href="/admin/feedback"
          />
          <StatTile
            label="Organizations"
            value={u ? fmt(u.organizations.length) : "—"}
            href="/admin/analytics"
          />
        </div>
      </section>

      <section className="mt-10 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Users by organization</h2>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter organizations"
              aria-label="Filter organizations"
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Organization</th>
                <th className="px-4 py-2 font-medium">Plan</th>
                <th className="px-4 py-2 text-right font-medium">Teachers</th>
                <th className="px-4 py-2 text-right font-medium">Students</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {orgs.map((o) => (
                <tr key={o.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2">
                    <div className="font-medium">{o.name}</div>
                    {o.name !== o.id && (
                      <div className="font-mono text-[11px] text-muted-foreground">{o.id}</div>
                    )}
                  </td>
                  <td className="px-4 py-2 capitalize text-muted-foreground">
                    {o.planId.replace(/[-_]/g, " ")}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(o.teachers)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(o.students)}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">
                    {fmt(o.teachers + o.students)}
                  </td>
                </tr>
              ))}
              {u && !filter && (u.unaffiliated.teachers > 0 || u.unaffiliated.students > 0) && (
                <tr className="text-muted-foreground">
                  <td className="px-4 py-2 italic">No organization</td>
                  <td className="px-4 py-2">—</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {fmt(u.unaffiliated.teachers)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {fmt(u.unaffiliated.students)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {fmt(u.unaffiliated.teachers + u.unaffiliated.students)}
                  </td>
                </tr>
              )}
              {!loading && orgs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    {filter ? "No organization matches that filter." : "No organizations yet."}
                  </td>
                </tr>
              )}
              {loading && !data && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Students without their own organization are counted under their teacher&apos;s.
          {data && ` Updated ${new Date(data.generatedAt).toLocaleTimeString()}.`}
        </p>
      </section>
    </>
  );
}
