"use client";

import { useEffect, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { toast } from "sonner";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ReferralInfo {
  link: string;
  stats: { invited: number; activated: number; earnedCents: number };
}

/** Set once the teacher closes the card; it stays closed in this browser. */
const CLOSED_KEY = "scorpio.home.invite-colleague-closed";

function isClosed() {
  try {
    return typeof window !== "undefined" && !!localStorage.getItem(CLOSED_KEY);
  } catch {
    return false; // Storage blocked: the card shows, and closing it lasts for this visit.
  }
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/** Teacher Home card: a personal request-access link and how the invitations are going. */
export function InviteColleagueCard() {
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [copied, setCopied] = useState(false);
  // Read once on mount; the card itself only appears after its link loads, so the server's
  // render (nothing) always matches.
  const [closed, setClosed] = useState(isClosed);

  useEffect(() => {
    if (isClosed()) return;
    let active = true;
    authenticatedFetch("/api/teacher/referral")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ReferralInfo | null) => {
        if (active && data?.link) setInfo(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!info || closed) return null;

  const remember = (value: boolean) => {
    try {
      if (value) localStorage.setItem(CLOSED_KEY, "1");
      else localStorage.removeItem(CLOSED_KEY);
    } catch {
      // Private window: closed for this visit only.
    }
    setClosed(value);
  };
  const close = () => {
    remember(true);
    toast("Invite card closed", { action: { label: "Undo", onClick: () => remember(false) } });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(info.link);
      setCopied(true);
      toast.success("Invite link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy. Select the link and copy it by hand.");
    }
  };

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Invite a colleague</CardTitle>
        <CardDescription>
          When a colleague you invite gets their first class results, you get $5 of AI credit and
          they get $2.
        </CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="icon"
            className="-mr-2 -mt-1 size-8 text-muted-foreground"
            onClick={close}
            aria-label="Close the invite card"
            title="Close"
          >
            <X />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border border-border/60 px-2.5 py-1.5 text-sm">
            {info.link}
          </code>
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            Copy link
          </Button>
        </div>
        <p className="text-sm text-muted-foreground tabular-nums">
          {info.stats.invited} requested access · {info.stats.activated} got results ·{" "}
          {dollars(info.stats.earnedCents)} earned
        </p>
      </CardContent>
    </Card>
  );
}
