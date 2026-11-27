"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { ClickIcon } from "@/components/ui/click-icon";
import { DownloadIcon as AnimatedDownload } from "@animateicons/react/lucide/download-icon";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import type { UsageSummary } from "@/lib/admin/summaries";
import { AdminHeader, StatTile } from "@/components/admin/admin-shell";
import { AICostCalculator } from "@/components/admin/ai-cost-calculator";
import CostComparisonChart from "@/components/admin/cost-comparison-chart";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface Org {
  id: string;
  name: string;
  planId: string;
}

const dollars = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: cents < 100 ? 4 : 2,
  })}`;
const compact = (n: number) =>
  n.toLocaleString(undefined, {
    notation: n >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  });
const shortDate = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

function DailyChart({ daily }: { daily: UsageSummary["daily"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...daily.map((d) => d.events));
  const shown = hover != null ? daily[hover] : null;
  const labelEvery = Math.ceil(daily.length / 8);

  return (
    <div>
      <div className="mb-3 h-5 text-xs text-muted-foreground" aria-live="polite">
        {shown ? (
          <>
            <span className="font-medium text-foreground">{shortDate(shown.date)}</span> ·{" "}
            {shown.events.toLocaleString()} interactions · {dollars(shown.costCents)}
          </>
        ) : (
          "Hover a bar for that day's numbers."
        )}
      </div>
      <div
        className="flex h-44 items-end gap-[2px] border-b border-border/60"
        onMouseLeave={() => setHover(null)}
      >
        {daily.map((d, i) => (
          <div
            key={d.date}
            className="group flex h-full flex-1 items-end"
            onMouseEnter={() => setHover(i)}
            aria-label={`${shortDate(d.date)}: ${d.events} interactions`}
          >
            <div
              className={cn(
                "w-full rounded-t-[4px] bg-primary/70 transition-colors",
                hover === i && "bg-primary",
                d.events === 0 && "bg-transparent",
              )}
              style={{ height: `${(d.events / max) * 100}%`, minHeight: d.events ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[2px] text-[10px] text-muted-foreground">
        {daily.map((d, i) => (
          <div key={d.date} className="flex-1 overflow-visible whitespace-nowrap">
            {i % labelEvery === 0 ? shortDate(d.date) : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
  total,
  emptyText,
}: {
  title: string;
  rows: Array<{ key: string; label: string; events: number; costCents: number }>;
  total: number;
  emptyText: string;
}) {
  return (
    <div className="rounded-lg border border-border/60">
      <div className="border-b border-border/60 px-4 py-2.5 text-sm font-medium">{title}</div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map((r) => (
            <li key={r.key} className="px-4 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate capitalize">{r.label}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {r.events.toLocaleString()} · {dollars(r.costCents)}
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${total ? (r.events / total) * 100 : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UsagePanel() {
  const [org, setOrg] = useState("all");
  const [days, setDays] = useState("30");
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ org, days });
      const res = await authenticatedFetch(`/api/admin/usage?${params}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not load usage");
      setOrgs(body.organizations);
      setUsage(body.usage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load usage");
    } finally {
      setLoading(false);
    }
  }, [org, days]);

  useEffect(() => {
    // Initial load; the setState calls happen after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const exportCsv = () => {
    if (!usage) return;
    const lines = [
      "date,interactions,cost_usd",
      ...usage.daily.map((d) => `${d.date},${d.events},${(d.costCents / 100).toFixed(6)}`),
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `scorpio-usage-${org}-${days}d-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const orgName =
    org === "all" ? "All organizations" : (orgs.find((o) => o.id === org)?.name ?? org);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={org} onValueChange={setOrg}>
          <SelectTrigger className="h-9 w-full sm:w-64" aria-label="Organization">
            <SelectValue placeholder="Organization" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All organizations</SelectItem>
            {orgs.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
                <span className="ml-1 text-xs capitalize text-muted-foreground">
                  · {o.planId.replace(/[-_]/g, " ")}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="h-9 w-36" aria-label="Time range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={!usage || usage.events === 0}
          >
            <ClickIcon icon={AnimatedDownload} className="size-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} /> Refresh
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div
        className={cn(
          "grid grid-cols-2 gap-3 lg:grid-cols-4 transition-opacity",
          loading && "opacity-60",
        )}
      >
        <StatTile label="AI spend" value={usage ? dollars(usage.costCents) : "—"} hint={orgName} />
        <StatTile label="AI interactions" value={usage ? compact(usage.events) : "—"} />
        <StatTile
          label="Tokens"
          value={usage ? compact(usage.inputTokens + usage.outputTokens) : "—"}
          hint={
            usage ? `${compact(usage.inputTokens)} in · ${compact(usage.outputTokens)} out` : " "
          }
        />
        <StatTile label="Users using AI" value={usage ? compact(usage.activeUsers) : "—"} />
      </div>

      <div
        className={cn(
          "rounded-lg border border-border/60 p-4 transition-opacity",
          loading && "opacity-60",
        )}
      >
        <div className="mb-1 text-sm font-medium">Interactions per day</div>
        {usage && <DailyChart daily={usage.daily} />}
        {!usage && <div className="h-52" />}
      </div>

      {usage?.truncated && (
        <p className="text-xs text-muted-foreground">
          Only the newest 10,000 events were read, so these totals undercount this range.
        </p>
      )}

      <div className={cn("grid gap-4 lg:grid-cols-2", loading && "opacity-60")}>
        <BreakdownTable
          title="By feature"
          total={usage?.events ?? 0}
          emptyText="No AI usage in this range."
          rows={(usage?.byType ?? []).map((t) => ({
            key: t.type,
            label: t.type,
            events: t.events,
            costCents: t.costCents,
          }))}
        />
        {org === "all" && (
          <BreakdownTable
            title="By organization"
            total={usage?.events ?? 0}
            emptyText="No AI usage in this range."
            rows={(usage?.byOrganization ?? []).map((o) => ({
              key: o.id,
              label: o.name,
              events: o.events,
              costCents: o.costCents,
            }))}
          />
        )}
      </div>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  return (
    <>
      <AdminHeader
        title="Analytics"
        description="AI usage and spend for any organization, or all of them together."
      />
      <Tabs defaultValue="usage" className="space-y-6">
        <TabsList>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="estimator">Cost estimator</TabsTrigger>
          <TabsTrigger value="comparison">Market comparison</TabsTrigger>
        </TabsList>
        <TabsContent value="usage" className="outline-none">
          <UsagePanel />
        </TabsContent>
        <TabsContent value="estimator" className="outline-none">
          <AICostCalculator />
        </TabsContent>
        <TabsContent value="comparison" className="outline-none">
          <CostComparisonChart />
        </TabsContent>
      </Tabs>
    </>
  );
}
