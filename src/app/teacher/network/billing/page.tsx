"use client";

import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { db } from "@/lib/firebase";
import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { Loader2, ChevronLeft, Building2, Cpu, Gift, HandCoins, Sparkles, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Organization } from "@/lib/types";
import { errorMessage } from "@/lib/error-utils";
import {
  FREE_MONTHLY_CENTS,
  MAX_DEPOSIT_CENTS,
  MIN_DEPOSIT_CENTS,
  depositCreditCents,
  estimateHints,
  summarizeBalance,
} from "../../../../../functions/src/budget-policy";

interface LedgerEntry {
  id: string;
  kind: string;
  bucket: string;
  cents: number;
  reason: string;
  createdAt: Date | null;
}

const PRESET_AMOUNTS_CENTS = [500, 1000, 2500, 5000];

const KIND_LABELS: Record<string, string> = {
  deposit: "Deposit",
  refund: "Refund",
  invoice: "Invoice",
  referral: "Referral",
  welcome: "Welcome",
  migration: "Moved from plan",
  admin: "Adjustment",
  expire: "Expired",
};

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const signedDollars = (cents: number) =>
  `${cents < 0 ? "-" : "+"}$${(Math.abs(cents) / 100).toFixed(2)}`;
const formatDate = (d: Date | number) =>
  new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const v = value as { toDate?: () => Date };
  return typeof v.toDate === "function" ? v.toDate() : null;
}

export default function BillingPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");

  const organizationId = profile?.organizationId;

  // Live balance and history, so the page updates when the payment webhook lands.
  useEffect(() => {
    if (authLoading) return;
    if (!user || !organizationId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to subscribe to without a network
      setLoading(false);
      return;
    }
    const unsubOrg = onSnapshot(
      doc(db, "organizations", organizationId),
      (snap) => {
        setOrganization(snap.exists() ? ({ id: snap.id, ...snap.data() } as Organization) : null);
        setLoading(false);
      },
      (e) => {
        console.error(e);
        toast.error("Failed to load AI credit info.");
        setLoading(false);
      },
    );
    const unsubLedger = onSnapshot(
      query(
        collection(db, "organizations", organizationId, "credit_ledger"),
        orderBy("createdAt", "desc"),
        limit(25),
      ),
      (snap) => {
        setLedger(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              kind: String(data.kind ?? ""),
              bucket: String(data.bucket ?? ""),
              cents: typeof data.cents === "number" ? data.cents : 0,
              reason: String(data.reason ?? ""),
              createdAt: toDate(data.createdAt),
            };
          }),
        );
      },
      (e) => console.error("credit_ledger", e),
    );
    return () => {
      unsubOrg();
      unsubLedger();
    };
  }, [user, organizationId, authLoading]);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("success") === "true") {
        toast.success("Payment received. Your balance updates in a few seconds.");
        window.history.replaceState(null, "", window.location.pathname);
      }
    } catch {
      // Ignore
    }
  }, []);

  const handleDeposit = async (amountCents: number) => {
    if (!user || !organization) return;
    if (
      !Number.isInteger(amountCents) ||
      amountCents < MIN_DEPOSIT_CENTS ||
      amountCents > MAX_DEPOSIT_CENTS
    ) {
      toast.error(
        `Enter an amount between ${dollars(MIN_DEPOSIT_CENTS)} and ${dollars(MAX_DEPOSIT_CENTS)}.`,
      );
      return;
    }
    setCheckingOut(amountCents);
    try {
      const response = await authenticatedFetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.uid,
          organizationId: organization.id,
          amountCents,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.message || data.error || "Failed to start checkout.");
      }
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      throw new Error("No checkout URL returned.");
    } catch (e: unknown) {
      console.error(e);
      toast.error(errorMessage(e) || "Failed to start checkout.");
      setCheckingOut(null);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground">Loading AI credit...</p>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center max-w-md mx-auto space-y-4">
        <div className="p-3 rounded-xl bg-muted border border-border/60">
          <Building2 className="h-8 w-8 text-muted-foreground mx-auto" />
        </div>
        <h2 className="text-xl font-bold tracking-tight">No Network Found</h2>
        <p className="text-sm text-muted-foreground">
          You must be part of a Scorpio Network to view or add AI credit.
        </p>
        <Button variant="outline" asChild size="sm">
          <Link href="/teacher/network">Return to Network</Link>
        </Button>
      </div>
    );
  }

  const isOwner =
    user?.uid === organization.ownerId || (profile?.role as string) === "school_admin";
  const balance = summarizeBalance(organization);
  const hints = estimateHints(balance.availableCents);

  const customDollars = parseFloat(customAmount);
  const customCents = Number.isFinite(customDollars) ? Math.round(customDollars * 100) : 0;
  const customValid = customCents >= MIN_DEPOSIT_CENTS && customCents <= MAX_DEPOSIT_CENTS;

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 border-b border-border/60 pb-6">
        <div>
          <Link
            href="/teacher/network"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ChevronLeft className="h-4 w-4" /> Back to Network
          </Link>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            AI credit
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Scorpio is free. AI runs on a prepaid balance, charged at Google&apos;s exact cost.
          </p>
        </div>
      </div>

      {/* ── Balance ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <Card className="lg:col-span-5 border-primary/40 shadow-md ring-1 ring-primary/20">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider">
              Available balance
            </CardDescription>
            <CardTitle className="text-4xl sm:text-5xl font-extrabold tracking-tight">
              {dollars(balance.availableCents)}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              About {hints.toLocaleString()} Raise hint{hints === 1 ? "" : "s"}
            </p>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>Spent this month: {dollars(balance.monthSpendCents)}</p>
            {balance.monthlyCapCents > 0 && (
              <p>
                Monthly spend cap: {dollars(balance.monthlyCapCents)}.{" "}
                <Link href="/teacher/network" className="text-primary hover:underline">
                  Change
                </Link>
              </p>
            )}
            {balance.availableCents <= 0 && (
              <p className="font-medium text-amber-600 dark:text-amber-400">
                Raise and AI grading are paused until the balance is topped up or the free credit
                resets on the 1st.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-7 border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Where it comes from</CardTitle>
            <CardDescription className="text-xs">
              Spent in this order: free, then bonus, then paid.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 p-3">
              <div className="flex items-start gap-2.5">
                <Sparkles className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Free this month</p>
                  <p className="text-xs text-muted-foreground">Resets on the 1st</p>
                </div>
              </div>
              <p className="font-mono font-semibold text-foreground text-right">
                {dollars(balance.freeLeftCents)}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  of {dollars(FREE_MONTHLY_CENTS)} left
                </span>
              </p>
            </div>
            <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 p-3">
              <div className="flex items-start gap-2.5">
                <Gift className="h-4 w-4 text-purple-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Bonus</p>
                  <p className="text-xs text-muted-foreground">
                    {balance.bonusCents > 0 && balance.bonusExpiresAt
                      ? `Expires ${formatDate(balance.bonusExpiresAt)}`
                      : "Referral, welcome and pilot credit"}
                  </p>
                </div>
              </div>
              <p className="font-mono font-semibold text-foreground">
                {dollars(balance.bonusCents)}
              </p>
            </div>
            <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 p-3">
              <div className="flex items-start gap-2.5">
                <HandCoins className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Paid</p>
                  <p className="text-xs text-muted-foreground">Never expires</p>
                </div>
              </div>
              <p
                className={cn(
                  "font-mono font-semibold",
                  balance.paidCents < 0 ? "text-red-500" : "text-foreground",
                )}
              >
                {balance.paidCents < 0 ? "-" : ""}
                {dollars(Math.abs(balance.paidCents))}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Add credit ── */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Add credit</CardTitle>
          <CardDescription className="text-xs">
            Pay once with a card through Polar. Between {dollars(MIN_DEPOSIT_CENTS)} and{" "}
            {dollars(MAX_DEPOSIT_CENTS)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!isOwner && (
            <p className="text-xs text-muted-foreground">
              Only the network owner can add credit. Ask them to top it up.
            </p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PRESET_AMOUNTS_CENTS.map((cents) => (
              <div
                key={cents}
                className="rounded-xl border border-border/60 p-3 flex flex-col gap-2"
              >
                <Button
                  onClick={() => handleDeposit(cents)}
                  disabled={!isOwner || checkingOut !== null}
                  className="h-10 font-bold cursor-pointer"
                >
                  {checkingOut === cents ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    dollars(cents).replace(".00", "")
                  )}
                </Button>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  You&apos;ll get {dollars(depositCreditCents(cents))} of AI credit after
                  Polar&apos;s fee
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border/60 p-3 space-y-2 max-w-md">
            <Label htmlFor="custom-deposit" className="text-xs font-bold text-muted-foreground">
              Custom amount (USD)
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-2.5 text-sm font-bold text-muted-foreground font-mono">
                  $
                </span>
                <Input
                  id="custom-deposit"
                  type="number"
                  inputMode="decimal"
                  step="1"
                  min={MIN_DEPOSIT_CENTS / 100}
                  max={MAX_DEPOSIT_CENTS / 100}
                  placeholder="5 to 500"
                  className="h-10 pl-7 font-mono font-bold text-sm bg-background"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  disabled={!isOwner}
                />
              </div>
              <Button
                className="h-10 px-4 font-bold cursor-pointer"
                onClick={() => handleDeposit(customCents)}
                disabled={!isOwner || !customValid || checkingOut !== null}
              >
                {checkingOut !== null && checkingOut === customCents ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Add credit"
                )}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {customValid
                ? `You'll get ${dollars(depositCreditCents(customCents))} of AI credit after Polar's fee`
                : `Minimum ${dollars(MIN_DEPOSIT_CENTS)}, maximum ${dollars(MAX_DEPOSIT_CENTS)}.`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── History ── */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">History</CardTitle>
          <CardDescription className="text-xs">Your latest 25 credit changes.</CardDescription>
        </CardHeader>
        <CardContent>
          {ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing yet. Deposits, bonuses and refunds will show up here.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {ledger.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {KIND_LABELS[entry.kind] ?? entry.kind}
                      {entry.bucket && (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {entry.bucket}
                        </span>
                      )}
                    </p>
                    {entry.reason && (
                      <p className="text-xs text-muted-foreground break-words">{entry.reason}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground/80">
                      {entry.createdAt ? formatDate(entry.createdAt) : "Just now"}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "font-mono text-sm font-semibold shrink-0",
                      entry.cents < 0
                        ? "text-red-500"
                        : "text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    {signedDollars(entry.cents)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── How it works ── */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">How AI pricing works</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Building2 className="h-4 w-4 text-primary" />
              <span>Scorpio is free</span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Courses, assignments, grading tools and students cost nothing. Only AI features use
              credit.
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Cpu className="h-4 w-4 text-emerald-500" />
              <span>At Google&apos;s exact cost</span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              AI is charged at what Google charges Scorpio, with no markup. Polar&apos;s payment
              fee comes out of each deposit.
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <span>$1 free every month</span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Every network gets {dollars(FREE_MONTHLY_CENTS)} of AI each month. It resets on the
              1st and does not roll over.
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Info className="h-4 w-4 text-primary" />
              <span>Paid and bonus credit</span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Paid credit never expires, and unused paid credit is refundable on request: reply to
              any Scorpio email. Bonus credit expires 12 months after your last bonus.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
