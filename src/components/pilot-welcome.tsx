"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useDepartmentPlan } from "@/hooks/use-department-plan";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { CelebrationDialog } from "@/components/invite-celebration";

/**
 * Shown once to each teacher whose network is an active pilot, whether an admin made an existing
 * network a pilot or the teacher signed up with a pilot invite. Dismissal is stored on users/{uid}
 * (server-written), so it does not come back on another device.
 */
export function PilotWelcome() {
  const { profile } = useAuth();
  const { organization } = useDepartmentPlan();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const pilot =
    organization?.planId === "pilot" && organization.pilot?.status === "active"
      ? organization.pilot
      : null;
  const due = Boolean(
    pilot && profile?.role === "teacher" && !profile.pilotWelcomedAt && !dismissed,
  );

  useEffect(() => {
    if (!due) return;
    const t = setTimeout(() => setOpen(true), 500);
    return () => clearTimeout(t);
  }, [due]);

  if (!pilot) return null;

  const budget = `$${((organization?.aiBudgetLimit ?? pilot.budgetCents) / 100).toFixed(0)}`;
  const ends = pilot.endsAt
    ? new Date(pilot.endsAt).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const close = (next: boolean) => {
    setOpen(next);
    if (next) return;
    setDismissed(true);
    void authenticatedFetch("/api/teacher/pilot/welcomed", { method: "POST" }).catch(() => {});
  };

  return (
    <CelebrationDialog
      open={open}
      onOpenChange={close}
      eyebrow="Founding pilot"
      title={`${organization?.name ?? "Your network"} is now a Scorpio pilot`}
      body={
        <>
          You have the full Department License{ends ? <> until {ends}</> : null}: Raise for your
          students, shared department waypoints, and a {budget} AI budget for the pilot.
        </>
      }
      action="Let's go"
    >
      <p className="mx-auto mt-4 max-w-xs text-xs text-muted-foreground">
        Thank you for helping shape Scorpio. Reply to any of our emails with feedback, big or small.
      </p>
    </CelebrationDialog>
  );
}
