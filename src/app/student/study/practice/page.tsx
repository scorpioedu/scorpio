"use client";

// Study > a practice run: five problems from one topic (?course=…&topic=3.4) or a whole unit
// (?course=…&unit=3), each checked as soon as it is answered. The end of the run offers five more.
// A topic's practice also sits under its lesson in the course reader; this page stays for deep links
// (sign-up returns here) and whole-unit runs, and links back to the topic's lesson.
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ClickIcon } from "@/components/ui/click-icon";
import { ArrowLeftIcon as AnimatedArrowLeft } from "@animateicons/react/lucide/arrow-left-icon";
import { BookOpenIcon as AnimatedBookOpen } from "@animateicons/react/lucide/book-open-icon";
import { WorkspaceHeader } from "@/components/ui/workspace";
import { Button } from "@/components/ui/button";
import { PracticeAgain, PracticeSession } from "@/components/study/practice-session";
import { topicIndex, useStudyProgress } from "@/components/student/study-ui";
import { useAuth } from "@/contexts/auth-context";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { loadProblems, type PublicProblem } from "@/lib/study/client";

const COUNT = 5;

export default function StudyPracticePage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="text-sm text-muted-foreground">
          Loading practice…
        </p>
      }
    >
      <PracticeRun />
    </Suspense>
  );
}

type Loaded =
  | { status: "ready"; problems: PublicProblem[]; total: number }
  | { status: "error"; message: string };

function PracticeRun() {
  const params = useSearchParams();
  const course = params.get("course") ?? "";
  const topicParam = params.get("topic");
  const unitParam = params.get("unit");
  const topic = topicParam && /^\d{1,2}\.\d{1,2}$/.test(topicParam) ? topicParam : null;
  const unit = !topic && unitParam && /^\d{1,2}$/.test(unitParam) ? Number(unitParam) : null;
  const valid = /^[a-z0-9-]{1,40}$/.test(course) && (topic !== null || unit !== null);

  const { user } = useAuth();
  const progress = useStudyProgress();
  const [round, setRound] = useState(0);
  // Kept with the request it answers, so a new round or a new topic reads as loading.
  const requestKey = `${course}|${topic ?? ""}|${unit ?? ""}|${round}`;
  const [loaded, setLoaded] = useState<{ key: string; result: Loaded } | null>(null);

  useEffect(() => {
    if (!user || !valid) return;
    let active = true;
    loadProblems(
      { course, topic: topic ?? undefined, unit: unit ?? undefined, count: COUNT },
      authenticatedFetch,
    )
      .then(
        ({ problems, total }) =>
          active && setLoaded({ key: requestKey, result: { status: "ready", problems, total } }),
      )
      .catch(
        (e: unknown) =>
          active &&
          setLoaded({
            key: requestKey,
            result: {
              status: "error",
              message: e instanceof Error ? e.message : "Could not load practice problems.",
            },
          }),
      );
    return () => {
      active = false;
    };
  }, [user, valid, course, topic, unit, requestKey]);

  const summary = progress.status === "ready" ? progress.progress : null;
  const index = useMemo(() => (summary ? topicIndex(summary.courses) : null), [summary]);
  const courseInfo = summary?.courses.find((c) => c.id === course);
  const topicInfo = topic ? index?.get(`${course}:${topic}`)?.topic : undefined;
  const unitInfo = unit !== null ? courseInfo?.units.find((u) => u.unit === unit) : undefined;

  const title = topic
    ? topicInfo
      ? `${topic} ${topicInfo.title}`
      : `Topic ${topic}`
    : unit !== null
      ? unitInfo
        ? `Unit ${unit} · ${unitInfo.title}`
        : `Unit ${unit}`
      : "Practice";

  const backButton = (
    <Button asChild variant="outline" size="sm">
      <Link href="/student/study">
        <ClickIcon icon={AnimatedArrowLeft} aria-hidden />
        Back to Study
      </Link>
    </Button>
  );

  const label = (problem: PublicProblem) => {
    const t = index?.get(`${problem.courseId}:${problem.topicId}`)?.topic;
    return t ? `${problem.topicId} ${t.title}` : `Topic ${problem.topicId}`;
  };

  const current = loaded?.key === requestKey ? loaded.result : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <WorkspaceHeader title={title} description={courseInfo?.name}>
        {topicInfo?.lessonHref && (
          <Button asChild variant="outline" size="sm">
            <Link href={topicInfo.lessonHref}>
              <ClickIcon icon={AnimatedBookOpen} aria-hidden />
              Read the lesson
            </Link>
          </Button>
        )}
        {backButton}
      </WorkspaceHeader>

      {!valid ? (
        <EmptyState message="This practice link is missing its course or topic. Pick a topic on Study." />
      ) : !current ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading problems…
        </p>
      ) : current.status === "error" ? (
        <div role="alert" className="space-y-3 rounded-2xl border border-border p-5">
          <p className="text-sm text-muted-foreground">{current.message}</p>
          <Button variant="outline" size="sm" onClick={() => setRound((r) => r + 1)}>
            Try again
          </Button>
        </div>
      ) : current.problems.length === 0 && summary && (topic ? !topicInfo : !unitInfo) ? (
        // The catalog is loaded and has no such course, topic or unit: a broken link, not a lack of
        // problems.
        <EmptyState
          message={`Study has no ${topic ? `topic ${topic}` : `unit ${unit}`} in ${courseInfo?.name ?? "that course"}. Pick a topic on Study.`}
        />
      ) : current.problems.length === 0 ? (
        <EmptyState
          message={
            topic
              ? "There are no practice problems for this topic right now. Problems from a set a class has open as homework are held back until it is due."
              : "There are no practice problems for this unit right now. Problems from a set a class has open as homework are held back until it is due."
          }
        />
      ) : (
        <PracticeSession
          key={round}
          problems={current.problems}
          fetcher={authenticatedFetch}
          label={label}
          renderEnd={(results) => {
            const missed = results.some((r) => !r.reply.correct);
            return (
              <div className="space-y-4 border-t border-border pt-4">
                {missed && (
                  <p className="text-sm text-muted-foreground">
                    Topics you missed come back for review on Study tomorrow.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <PracticeAgain onClick={() => setRound((r) => r + 1)}>
                    {current.total > current.problems.length
                      ? `Practice ${Math.min(COUNT, current.total)} more`
                      : "Practice again"}
                  </PracticeAgain>
                  {topicInfo?.lessonHref && (
                    <Button asChild variant="outline">
                      <Link href={topicInfo.lessonHref}>
                        <ClickIcon icon={AnimatedBookOpen} aria-hidden />
                        Read the lesson
                      </Link>
                    </Button>
                  )}
                  <Button asChild variant="ghost">
                    <Link href="/student/study">Back to Study</Link>
                  </Button>
                </div>
              </div>
            );
          }}
        />
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="space-y-3 rounded-2xl border border-dashed border-border p-6">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button asChild variant="outline" size="sm">
        <Link href="/student/study">Pick another topic</Link>
      </Button>
    </div>
  );
}
