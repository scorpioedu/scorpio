"use client";

import { useState } from "react";
import { toast } from "sonner";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The class-code box. On Home it is the whole first step; on the other student pages it replaces an
 * empty list that would otherwise say nothing about why it is empty. The profile is live
 * (auth-context), so the page fills in by itself once the join goes through.
 */
export function JoinClassForm({ onJoined }: { onJoined?: () => void }) {
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  async function join() {
    if (!code.trim()) return;
    setJoining(true);
    setError("");
    try {
      const response = await authenticatedFetch("/api/student/enrollment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Could not join. Try again.");
      }
      setCode("");
      toast.success("You’re in. Your class is loading.");
      onJoined?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join. Try again.");
    } finally {
      setJoining(false);
    }
  }

  return (
    <form
      className="max-w-md space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        void join();
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Class code from your teacher"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label="Class code"
          aria-invalid={!!error}
          autoCapitalize="characters"
          autoComplete="off"
        />
        <Button type="submit" disabled={joining || !code.trim()}>
          {joining ? "Joining…" : "Join class"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

/** For pages that have nothing to show a student who is not in a class yet. */
export function JoinClassPrompt({ what }: { what: string }) {
  return (
    <div className="space-y-3 p-6">
      <div>
        <p className="text-sm font-medium">Join your class to see {what}</p>
        <p className="text-sm text-muted-foreground">
          Your teacher has a class code, or an invite link that does this for you.
        </p>
      </div>
      <JoinClassForm />
    </div>
  );
}
