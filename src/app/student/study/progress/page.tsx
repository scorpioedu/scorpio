"use client";

// Study > Progress: every course the student has read or practised in, unit by unit (lessons read
// and topics strong), the mix-ups they make most, and a read-only link they can hand a teacher (no account needed to open it; it can be
// replaced or turned off at any time).
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Link2, RefreshCw, Unlink } from "lucide-react";
import { WorkspaceHeader, WorkspaceSummary } from "@/components/ui/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  InReviewMark,
  LEVEL_LABEL,
  LevelMeter,
  ReadMark,
  plural,
  topicStudyHref,
  useStudyProgress,
} from "@/components/student/study-ui";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { createShareLink, shareUrl, stopSharing, type ProgressReply } from "@/lib/study/client";
import type { StudyCourse } from "@/lib/study/catalog";

export default function StudyProgressPage() {
  const state = useStudyProgress();

  return (
    <div className="space-y-8">
      <WorkspaceHeader
        title="Progress"
        description="What you have read and practised in Study, topic by topic, and the mix-ups that come up most in your answers."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/student/study">
            <ArrowLeft aria-hidden />
            Back to Study
          </Link>
        </Button>
      </WorkspaceHeader>

      {state.status === "loading" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading your progress…
        </p>
      ) : state.status === "error" ? (
        <div role="alert" className="space-y-3 rounded-2xl border border-border p-5">
          <p className="text-sm text-muted-foreground">{state.message}</p>
          <Button variant="outline" size="sm" onClick={state.reload}>
            Try again
          </Button>
        </div>
      ) : (
        <ProgressBody
          progress={state.progress}
          onShareToken={(shareToken) => state.setProgress({ ...state.progress, shareToken })}
        />
      )}
    </div>
  );
}

function ProgressBody({
  progress,
  onShareToken,
}: {
  progress: ProgressReply;
  onShareToken: (token: string | null) => void;
}) {
  const started = progress.courses.filter(
    (c) => c.attempted > 0 || c.units.some((u) => u.read > 0),
  );
  return (
    <>
      <WorkspaceSummary
        label="Your Study totals"
        items={[
          { label: "Answered", value: progress.answered },
          { label: "Right", value: progress.correct },
          { label: "Streak", value: plural(progress.streak, "day") },
          { label: "To review", value: plural(progress.dueCount, "topic") },
        ]}
      />

      {started.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-dashed border-border p-6">
          <p className="text-sm text-muted-foreground">
            Nothing yet. Read a lesson or answer a few problems on any topic and your progress shows
            up here.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/student/study">Pick a topic</Link>
          </Button>
        </div>
      ) : (
        started.map((course) => <CourseProgress key={course.id} course={course} />)
      )}

      <section aria-labelledby="study-mixups" className="space-y-3">
        <h2 id="study-mixups" className="text-sm font-semibold tracking-tight">
          Common mix-ups in your answers
        </h2>
        {progress.misconceptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None yet. When a wrong answer matches a common mix-up, it is named here.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {progress.misconceptions.map((m) => (
              <li key={m.id} className="space-y-1 px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-sm font-medium">{m.label}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {m.count === 1 ? "Once" : `${m.count} times`}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">{m.description}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ShareCard token={progress.shareToken} onToken={onShareToken} />
    </>
  );
}

function CourseProgress({ course }: { course: StudyCourse }) {
  const headingId = `progress-${course.id}`;
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="text-sm font-semibold tracking-tight">
        {course.name}
      </h2>
      <div className="divide-y divide-border rounded-2xl border border-border">
        {course.units
          .filter((u) => u.practisable > 0 || u.lessons > 0)
          .map((unit) => {
            const touched = unit.topics.filter((t) => t.attempted > 0 || t.read);
            const counts = [
              unit.lessons > 0 && `${unit.read} of ${unit.lessons} read`,
              unit.practisable > 0 && `${unit.strong} of ${unit.practisable} strong`,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <div key={unit.unit} className="space-y-3 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <h3 className="text-sm font-medium">
                    Unit {unit.unit} · {unit.title}
                  </h3>
                  <div className="flex items-center gap-3">
                    <span className="text-xs tabular-nums text-muted-foreground">{counts}</span>
                    {unit.practisable > 0 && (
                      <Progress
                        value={(unit.strong / unit.practisable) * 100}
                        aria-label={`Unit ${unit.unit}: ${unit.strong} of ${unit.practisable} topics strong`}
                        className="w-24"
                      />
                    )}
                  </div>
                </div>
                {touched.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Not started</p>
                ) : (
                  <ul className="space-y-1.5">
                    {touched.map((topic) => {
                      const href = topicStudyHref(course.id, topic);
                      const name = (
                        <>
                          <span className="mr-1.5 tabular-nums text-muted-foreground">
                            {topic.id}
                          </span>
                          {topic.title}
                        </>
                      );
                      return (
                        <li
                          key={topic.id}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                        >
                          <ReadMark read={topic.read} />
                          <LevelMeter level={topic.level} />
                          {href ? (
                            <Link
                              href={href}
                              className="min-w-0 flex-1 basis-48 underline-offset-4 hover:underline"
                            >
                              {name}
                            </Link>
                          ) : (
                            <span className="min-w-0 flex-1 basis-48">{name}</span>
                          )}
                          {topic.inReview && <InReviewMark />}
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {topic.attempted > 0
                              ? `${topic.correct}/${topic.attempted} right · ${LEVEL_LABEL[topic.level]}`
                              : topic.problems > 0
                                ? "Not practised yet"
                                : "Lesson only"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
      </div>
    </section>
  );
}

function ShareCard({
  token,
  onToken,
}: {
  token: string | null;
  onToken: (token: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const url = token ? shareUrl(token) : null;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setStatus(null);
    try {
      await action();
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : "Something went wrong.", error: true });
    } finally {
      setBusy(false);
    }
  };

  const create = (fresh: boolean) =>
    run(async () => {
      onToken(await createShareLink(authenticatedFetch));
      setStatus({
        text: fresh
          ? "New link made. The old one no longer works."
          : "Link made. Copy it to share.",
      });
    });

  const stop = () =>
    run(async () => {
      await stopSharing(authenticatedFetch);
      onToken(null);
      setStatus({ text: "Sharing is off. The link no longer works." });
    });

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setStatus({ text: "Link copied." });
    } catch {
      setStatus({ text: "Could not copy. Select the link and copy it yourself.", error: true });
    }
  };

  return (
    <section
      aria-labelledby="study-share"
      className="space-y-4 rounded-2xl border border-border p-5"
    >
      <div className="space-y-1">
        <h2 id="study-share" className="text-sm font-semibold tracking-tight">
          Share with your teacher
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Make a read-only link to your Study progress, with your name on it. Anyone with the link
          can open it, no account needed, so send it only to people you want to see it. You can make
          a new link or turn sharing off at any time.
        </p>
      </div>

      {url ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="study-share-url" className="text-xs font-medium text-muted-foreground">
              Your link
            </label>
            <Input
              id="study-share-url"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="max-w-xl font-mono text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={copy} disabled={busy}>
              <Copy aria-hidden />
              Copy link
            </Button>
            <Button size="sm" variant="outline" onClick={() => create(true)} disabled={busy}>
              <RefreshCw aria-hidden />
              Make a new link
            </Button>
            <Button size="sm" variant="ghost" onClick={stop} disabled={busy}>
              <Unlink aria-hidden />
              Stop sharing
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" onClick={() => create(false)} disabled={busy}>
          <Link2 aria-hidden />
          {busy ? "Making link…" : "Create link"}
        </Button>
      )}

      <p
        aria-live="polite"
        className={status?.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
      >
        {status?.text}
      </p>
    </section>
  );
}
