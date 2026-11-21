"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import type { OrganizationPilot } from "@/lib/types";
import { AdminHeader, StatTile } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Teacher {
  uid: string;
  name: string;
  email: string;
}
interface PilotNetwork {
  id: string;
  name: string;
  planId: string;
  ownerEmail: string | null;
  teachers: Teacher[];
  students: number;
  pilot: OrganizationPilot & { endedAt?: string; convertedAt?: string };
  subscriptionStatus: string;
  aiBudgetLimit: number;
  aiUsageCurrent: number;
  lastAiUsageAt: string | null;
}
interface Candidate {
  id: string;
  name: string;
  ownerEmail: string | null;
  teachers: Teacher[];
  students: number;
}
interface PilotInvite {
  code: string;
  contactEmail: string | null;
  contactName: string | null;
  pilot: { cohort: string; budgetCents: number; endsAt: string | null } | null;
  isUsed: boolean;
  usedByEmail: string | null;
  expiresAt: string | null;
  link: string;
}
interface PilotsData {
  pilots: PilotNetwork[];
  candidates: Candidate[];
  invites: PilotInvite[];
  defaults: { budgetCents: number; cohort: string; capCents: number };
  generatedAt: string;
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const day = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
/** <input type="date"> value → ISO at the end of that day (UTC), or null when empty. */
const isPast = (iso: string | null | undefined) => !!iso && Date.parse(iso) <= Date.now();
const endOfDay = (v: string) => (v ? new Date(`${v}T23:59:59Z`).toISOString() : null);

async function post(body: Record<string, unknown>) {
  const res = await authenticatedFetch("/api/admin/pilots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

function statusOf(p: PilotNetwork): { label: string; tone: string } {
  if (p.pilot.status === "converted")
    return { label: "Converted to paid", tone: "bg-emerald-500/10 text-emerald-600" };
  if (p.pilot.status === "ended") return { label: "Ended", tone: "bg-muted text-muted-foreground" };
  if (isPast(p.pilot.endsAt)) return { label: "Past end date", tone: "bg-red-500/10 text-red-600" };
  return { label: "Active", tone: "bg-violet-500/10 text-violet-600" };
}

export default function AdminPilotsPage() {
  const [data, setData] = useState<PilotsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authenticatedFetch("/api/admin/pilots");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not load pilots");
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load pilots");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const act = useCallback(
    async (key: string, body: Record<string, unknown>, done: string) => {
      setBusy(key);
      try {
        await post(body);
        toast.success(done);
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Request failed");
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const active = data?.pilots.filter((p) => p.pilot.status === "active") ?? [];
  const spent = active.reduce((s, p) => s + p.aiUsageCurrent, 0);
  const granted = active.reduce((s, p) => s + p.aiBudgetLimit, 0);
  const lowBudget = active.filter(
    (p) => p.aiBudgetLimit > 0 && p.aiUsageCurrent / p.aiBudgetLimit >= 0.8,
  ).length;

  return (
    <>
      <AdminHeader
        title="Pilots"
        description="Networks on the pilot plan: their AI budget, end date and who's in them."
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
        <StatTile label="Active pilots" value={data ? active.length : "—"} />
        <StatTile
          label="Teachers in pilots"
          value={data ? active.reduce((s, p) => s + p.teachers.length, 0) : "—"}
          hint={data ? `${active.reduce((s, p) => s + p.students, 0)} students` : " "}
        />
        <StatTile
          label="AI spent"
          value={data ? dollars(spent) : "—"}
          hint={data ? `of ${dollars(granted)} granted` : " "}
        />
        <StatTile
          label="Budget above 80%"
          value={data ? lowBudget : "—"}
          hint="top these up"
          tone={lowBudget > 0 ? "warn" : undefined}
        />
      </div>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-medium">Pilot networks</h2>
        {data && data.pilots.length === 0 && (
          <p className="rounded-lg border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
            No pilots yet. Start one below, or send a pilot invite.
          </p>
        )}
        <div className="grid gap-3 lg:grid-cols-2">
          {data?.pilots.map((p) => (
            <PilotCard key={p.id} p={p} busy={busy} act={act} capCents={data.defaults.capCents} />
          ))}
        </div>
      </section>

      {data && (
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <StartPilot data={data} busy={busy} act={act} />
          <InvitePilot data={data} onCreated={load} />
        </div>
      )}

      {data && data.invites.length > 0 && (
        <section className="mt-10 space-y-3">
          <h2 className="text-sm font-medium">Pilot invites</h2>
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Teacher</th>
                  <th className="px-4 py-2 font-medium">Pilot</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data.invites.map((i) => {
                  const expired = !i.isUsed && isPast(i.expiresAt);
                  return (
                    <tr key={i.code}>
                      <td className="px-4 py-2">
                        <div className="font-medium">{i.contactName || i.contactEmail || "—"}</div>
                        {i.contactName && (
                          <div className="text-xs text-muted-foreground">{i.contactEmail}</div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {i.pilot ? `${i.pilot.cohort} · ${dollars(i.pilot.budgetCents)}` : "—"}
                        {i.pilot?.endsAt && ` · ends ${day(i.pilot.endsAt)}`}
                      </td>
                      <td className="px-4 py-2">
                        {i.isUsed ? (
                          <span className="text-emerald-600">
                            Signed up{i.usedByEmail ? ` as ${i.usedByEmail}` : ""}
                          </span>
                        ) : expired ? (
                          <span className="text-red-600">Expired {day(i.expiresAt)}</span>
                        ) : (
                          <span className="text-muted-foreground">
                            Waiting · expires {day(i.expiresAt)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">{!i.isUsed && <CopyLink path={i.link} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data && (
        <p className="mt-6 text-xs text-muted-foreground">
          Pilot budgets don&apos;t reset monthly; they cover the whole pilot. A pilot can hold at
          most {dollars(data.defaults.capCents)}. Updated{" "}
          {new Date(data.generatedAt).toLocaleTimeString()}.
        </p>
      )}
    </>
  );
}

function CopyLink({ path }: { path: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(`${window.location.origin}${path}`);
        toast.success("Invite link copied");
      }}
    >
      <Copy className="size-3.5" />
      Copy link
    </Button>
  );
}

type Act = (key: string, body: Record<string, unknown>, done: string) => Promise<void>;

function PilotCard({
  p,
  busy,
  act,
  capCents,
}: {
  p: PilotNetwork;
  busy: string | null;
  act: Act;
  capCents: number;
}) {
  const [endsAt, setEndsAt] = useState(p.pilot.endsAt ? p.pilot.endsAt.slice(0, 10) : "");
  const [topup, setTopup] = useState("5");
  const status = statusOf(p);
  const pct =
    p.aiBudgetLimit > 0
      ? Math.min(100, Math.round((p.aiUsageCurrent / p.aiBudgetLimit) * 100))
      : 100;
  const isActive = p.pilot.status === "active";
  const key = (a: string) => `${p.id}:${a}`;

  return (
    <article className="space-y-4 rounded-lg border border-border/60 p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-medium">{p.name}</h3>
          <p className="text-xs text-muted-foreground">
            {p.pilot.cohort} · started {day(p.pilot.startedAt)}
            {p.pilot.source === "invite" && " · from invite"}
          </p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", status.tone)}>
          {status.label}
        </span>
      </header>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">AI budget</span>
          <span className="tabular-nums">
            {dollars(p.aiUsageCurrent)} of {dollars(p.aiBudgetLimit)} ({pct}%)
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full",
              pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-violet-500",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Last AI use {p.lastAiUsageAt ? new Date(p.lastAiUsageAt).toLocaleString() : "never"} ·
          ends {p.pilot.endsAt ? day(p.pilot.endsAt) : "when you end it"}
        </p>
      </div>

      <div className="text-sm">
        <div className="text-xs text-muted-foreground">
          {p.teachers.length} teacher{p.teachers.length === 1 ? "" : "s"} · {p.students} student
          {p.students === 1 ? "" : "s"}
        </div>
        <ul className="mt-1 space-y-0.5">
          {p.teachers.map((t) => (
            <li key={t.uid} className="truncate">
              {t.name || "(no name)"} <span className="text-muted-foreground">{t.email}</span>
            </li>
          ))}
        </ul>
      </div>

      {isActive && (
        <div className="grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={key("topup")} className="text-xs">
              Top up ($)
            </Label>
            <div className="flex gap-2">
              <Input
                id={key("topup")}
                type="number"
                min={1}
                max={capCents / 100}
                value={topup}
                onChange={(e) => setTopup(e.target.value)}
                className="h-8"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null || !(Number(topup) > 0)}
                onClick={() =>
                  void act(
                    key("topup"),
                    {
                      action: "topup",
                      organizationId: p.id,
                      addCents: Math.round(Number(topup) * 100),
                    },
                    `Added $${topup}`,
                  )
                }
              >
                Add
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={key("ends")} className="text-xs">
              End date
            </Label>
            <div className="flex gap-2">
              <Input
                id={key("ends")}
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="h-8"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() =>
                  void act(
                    key("extend"),
                    { action: "extend", organizationId: p.id, endsAt: endOfDay(endsAt) },
                    "End date saved",
                  )
                }
              >
                Save
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              onClick={() => {
                if (
                  confirm(
                    `Reset ${p.name}'s AI usage to $0? This gives them their full budget back.`,
                  )
                )
                  void act(
                    key("reset"),
                    { action: "reset_usage", organizationId: p.id },
                    "Usage reset",
                  );
              }}
            >
              Reset usage
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={busy !== null}
              onClick={() => {
                if (
                  confirm(
                    `End the pilot for ${p.name}? It goes back to the free plan (50¢ AI budget). The pilot record is kept.`,
                  )
                )
                  void act(key("end"), { action: "end", organizationId: p.id }, "Pilot ended");
              }}
            >
              End pilot
            </Button>
          </div>
        </div>
      )}
      {p.pilot.status === "ended" && (
        <div className="border-t border-border/60 pt-4">
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() =>
              void act(
                key("restart"),
                {
                  action: "start",
                  organizationId: p.id,
                  budgetCents: p.pilot.budgetCents,
                  cohort: p.pilot.cohort,
                },
                "Pilot restarted",
              )
            }
          >
            Restart pilot
          </Button>
        </div>
      )}
    </article>
  );
}

function StartPilot({ data, busy, act }: { data: PilotsData; busy: string | null; act: Act }) {
  const [q, setQ] = useState("");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [budget, setBudget] = useState(String(data.defaults.budgetCents / 100));
  const [endsAt, setEndsAt] = useState("");
  const [cohort, setCohort] = useState(data.defaults.cohort);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data.candidates.slice(0, 8);
    return data.candidates
      .filter(
        (c) =>
          c.name.toLowerCase().includes(s) ||
          c.ownerEmail?.toLowerCase().includes(s) ||
          c.teachers.some(
            (t) => t.name.toLowerCase().includes(s) || t.email.toLowerCase().includes(s),
          ),
      )
      .slice(0, 8);
  }, [q, data.candidates]);
  const chosen = data.candidates.find((c) => c.id === orgId);

  return (
    <section className="space-y-3 rounded-lg border border-border/60 p-4">
      <div>
        <h2 className="text-sm font-medium">Start a pilot on an existing network</h2>
        <p className="text-xs text-muted-foreground">
          For teachers who already signed up. They see a welcome popup the next time they open
          Scorpio.
        </p>
      </div>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search free networks, teachers or emails"
        className="h-8"
      />
      <ul className="max-h-56 divide-y divide-border/60 overflow-y-auto rounded-md border border-border/60">
        {matches.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setOrgId(c.id)}
              className={cn(
                "w-full px-3 py-2 text-left text-sm hover:bg-muted/40",
                orgId === c.id && "bg-muted",
              )}
            >
              <div className="font-medium">{c.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {c.teachers.map((t) => t.email).join(", ") || c.ownerEmail || "no teachers"} ·{" "}
                {c.students} students
              </div>
            </button>
          </li>
        ))}
        {matches.length === 0 && (
          <li className="px-3 py-4 text-center text-xs text-muted-foreground">
            No free network matches.
          </li>
        )}
      </ul>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="start-budget">
            Budget ($)
          </Label>
          <Input
            id="start-budget"
            type="number"
            min={1}
            max={data.defaults.capCents / 100}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="start-ends">
            Ends (optional)
          </Label>
          <Input
            id="start-ends"
            type="date"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="start-cohort">
            Cohort
          </Label>
          <Input
            id="start-cohort"
            value={cohort}
            onChange={(e) => setCohort(e.target.value)}
            className="h-8"
          />
        </div>
      </div>
      <Button
        size="sm"
        disabled={!chosen || busy !== null || !(Number(budget) > 0)}
        onClick={() =>
          chosen &&
          void act(
            `start:${chosen.id}`,
            {
              action: "start",
              organizationId: chosen.id,
              budgetCents: Math.round(Number(budget) * 100),
              endsAt: endOfDay(endsAt),
              cohort: cohort.trim(),
            },
            `${chosen.name} is now a pilot`,
          ).then(() => setOrgId(null))
        }
      >
        {chosen ? `Make "${chosen.name}" a pilot` : "Pick a network"}
      </Button>
    </section>
  );
}

function InvitePilot({ data, onCreated }: { data: PilotsData; onCreated: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [budget, setBudget] = useState(String(data.defaults.budgetCents / 100));
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const create = async () => {
    setSaving(true);
    try {
      const res = await post({
        action: "invite",
        email: email.trim(),
        name: name.trim() || undefined,
        budgetCents: Math.round(Number(budget) * 100),
        endsAt: endOfDay(endsAt),
        cohort: data.defaults.cohort,
      });
      const url = `${window.location.origin}${res.link}`;
      setLink(url);
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success(
        res.reused
          ? "This teacher already had a pilot invite; link copied"
          : "Pilot invite created; link copied",
      );
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the invite");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-3 rounded-lg border border-border/60 p-4">
      <div>
        <h2 className="text-sm font-medium">Invite a new pilot teacher</h2>
        <p className="text-xs text-muted-foreground">
          For teachers who haven&apos;t signed up. Their network is a pilot from their first login,
          with nothing to do by hand.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs" htmlFor="invite-email">
            Email
          </Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs" htmlFor="invite-name">
            Name (optional)
          </Label>
          <Input
            id="invite-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="invite-budget">
            Budget ($)
          </Label>
          <Input
            id="invite-budget"
            type="number"
            min={1}
            max={data.defaults.capCents / 100}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="invite-ends">
            Ends (optional)
          </Label>
          <Input
            id="invite-ends"
            type="date"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="h-8"
          />
        </div>
      </div>
      <Button
        size="sm"
        disabled={saving || !email.includes("@") || !(Number(budget) > 0)}
        onClick={() => void create()}
      >
        Create pilot invite
      </Button>
      {link && (
        <p className="break-all rounded-md bg-muted/50 px-3 py-2 font-mono text-xs">{link}</p>
      )}
    </section>
  );
}
