"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ReferralInfo {
  link: string;
  stats: { invited: number; activated: number; earnedCents: number };
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/** Teacher Home card: a personal request-access link and how the invitations are going. */
export function InviteColleagueCard() {
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
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

  if (!info) return null;

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
