"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { db } from "@/lib/firebase";
import { inviteAuthPath } from "@/lib/onboarding-links";

export function InviteActions({
  kind,
  code,
  courseId,
}: {
  kind: "class" | "network";
  code: string;
  courseId?: string;
}) {
  const { user, profile, loading } = useAuth();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [currentClass, setCurrentClass] = useState("");
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const studentInvite = kind === "class";
  const currentCourseId = studentInvite && profile?.role === "student" ? profile.courseId : null;
  const otherCourseId = currentCourseId && currentCourseId !== courseId ? currentCourseId : null;

  useEffect(() => {
    if (!otherCourseId) return;
    let active = true;
    getDoc(doc(db, "courses", otherCourseId))
      .then((snapshot) => {
        if (active) setCurrentClass(snapshot.data()?.name || "");
      })
      .catch(() => {
        if (active) setCurrentClass("");
      });
    return () => {
      active = false;
    };
  }, [otherCourseId]);

  if (loading) return <p role="status">Checking your account…</p>;

  if (!user) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild>
          <Link href={inviteAuthPath("signup", kind, code)}>Create account and join</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={inviteAuthPath("login", kind, code)}>Sign in and join</Link>
        </Button>
      </div>
    );
  }

  if (profile?.role !== (studentInvite ? "student" : "teacher")) {
    return (
      <p className="text-sm">
        Sign in with a {studentInvite ? "student" : "teacher"} account to use this invite.
      </p>
    );
  }

  const destination = studentInvite ? "/student" : "/teacher/network";
  async function join(action: "join" | "switch" = "join") {
    setJoining(true);
    setError("");
    try {
      const response = await authenticatedFetch(
        studentInvite ? "/api/student/enrollment" : "/api/teacher/network/membership",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, code }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not join. Try again.");
      window.location.assign(destination);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not join. Try again.");
      setJoining(false);
    }
  }

  if (currentCourseId && !otherCourseId) {
    return (
      <div className="space-y-3">
        <p className="text-sm">You’re already enrolled in this class.</p>
        <Button asChild>
          <Link href="/student">Go to dashboard</Link>
        </Button>
      </div>
    );
  }

  // A student is in one class at a time. Offer the switch here, with what it changes, instead of
  // sending them to the dashboard to leave and then back to this link.
  if (otherCourseId) {
    const current = currentClass || "your current class";
    return (
      <div className="space-y-3">
        <p className="text-sm">
          You’re enrolled in <strong>{current}</strong>. A student can be in one class at a time.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {confirmSwitch ? (
          <div
            className="space-y-3 rounded-md border p-3"
            role="group"
            aria-label="Confirm switching classes"
          >
            <p className="text-sm">
              If you switch, you’ll stop seeing {current}’s assignments, including work you’ve
              already turned in. That teacher keeps your submitted work and grades, and you can
              rejoin later with their class code.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => join("switch")} disabled={joining}>
                {joining ? "Switching…" : "Switch classes"}
              </Button>
              <Button variant="outline" onClick={() => setConfirmSwitch(false)} disabled={joining}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setConfirmSwitch(true)}>
              Leave {current} and join this class
            </Button>
            <Button asChild variant="outline">
              <Link href="/student">Stay and go to dashboard</Link>
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => join()} disabled={joining}>
          {joining ? "Joining…" : studentInvite ? "Join class" : "Join Network"}
        </Button>
        <Button asChild variant="outline">
          <Link href={destination}>
            {studentInvite ? "Go to dashboard" : "Manage your Network"}
          </Link>
        </Button>
      </div>
    </div>
  );
}
