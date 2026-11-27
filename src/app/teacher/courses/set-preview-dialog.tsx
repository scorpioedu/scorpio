"use client";

// Shows a course set's problems before (or after) it is assigned. Students' view of the questions:
// the published set is read straight from Firestore, which never holds the answer key. For the
// class's own copy the teacher can also load the key through the API.
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { loadSetPool } from "@/lib/set-pool";
import { apTopicLabel, misconceptionTag } from "@/data/ap";
import { DEFAULT_SET_SIZE, getCurriculum, type CurriculumSet } from "@/data/curricula";
import { shownProfile, typeSummary } from "@/data/curricula/profiles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ClickIcon } from "@/components/ui/click-icon";
import { PencilIcon as AnimatedPencil } from "@animateicons/react/lucide/pencil-icon";
import { PlusIcon as AnimatedPlus } from "@animateicons/react/lucide/plus-icon";
import { assignmentHref } from "@/lib/assignment-actions";
import { Maths } from "./maths";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PreviewQuestion {
  id: string;
  text?: string;
  type?: string;
  options?: string[];
  points?: number;
  correctAnswer?: string;
}

export interface PreviewTarget {
  curriculumId: string;
  set: CurriculumSet;
  /** The published global set, if it is published in this project. */
  publishedId: string | null;
  /** The class's own copy, if assigned: its answer key can be shown. */
  assignmentId: string | null;
}

const TYPE: Record<string, string> = { "multiple-choice": "Multiple choice", numeric: "Numeric" };

export function SetPreviewDialog({
  target,
  onClose,
  onAssign,
  assignLabel = "Assign this set",
  assignBusy = false,
  keyNote = "Answers are shown once the set is assigned to your class.",
  canShowKey = false,
}: {
  target: PreviewTarget | null;
  onClose: () => void;
  /** Assign this set to the chosen class (shown when it is published and not assigned yet). */
  onAssign?: () => void;
  /** The main button's words where it does something else (the Library copies the set). */
  assignLabel?: string;
  assignBusy?: boolean;
  /** Where the answers can be seen, for a set that is not the class's own copy. */
  keyNote?: string;
  /** A teacher may read a published course set's answers before assigning it (the Courses pages). */
  canShowKey?: boolean;
}) {
  const [questions, setQuestions] = useState<PreviewQuestion[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const sourceId = target?.assignmentId ?? target?.publishedId ?? null;

  useEffect(() => {
    if (!sourceId) return;
    let active = true;
    getDoc(doc(db, "assignments", sourceId))
      .then((snap) => {
        if (!active) return;
        const list = snap.data()?.questions;
        setQuestions(Array.isArray(list) ? (list as PreviewQuestion[]) : []);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [sourceId]);

  function close() {
    setQuestions(null);
    setFailed(false);
    setShowKey(false);
    onClose();
  }

  async function loadKey() {
    if (!target) return;
    setKeyBusy(true);
    try {
      // Not assigned yet: the published set's own problems and answers.
      if (!target.assignmentId) {
        if (!target.publishedId) return;
        const pool = await loadSetPool(target.publishedId);
        setQuestions(pool.map((q, i) => ({ ...q, id: `pool-${i}` })));
        setShowKey(true);
        return;
      }
      const res = await authenticatedFetch(
        `/api/assignments?id=${encodeURIComponent(target.assignmentId)}`,
      );
      const body = await res.json();
      if (!res.ok || !Array.isArray(body.questions)) throw new Error();
      setQuestions(body.questions as PreviewQuestion[]);
      setShowKey(true);
    } catch {
      setFailed(true);
    } finally {
      setKeyBusy(false);
    }
  }

  if (!target) return null;
  const { set } = target;
  // The class's copy is described by its own size (known once its problems load); a set that is not
  // assigned, by what a class gets by default.
  const profile =
    target.assignmentId && questions === null
      ? undefined
      : shownProfile(target.curriculumId, set.key, target.assignmentId ? questions?.length : null);
  // Problems past the default are only assigned when the teacher chooses more.
  const extraFrom =
    !target.assignmentId && profile && profile.pool > DEFAULT_SET_SIZE ? DEFAULT_SET_SIZE : null;
  const course = getCurriculum(target.curriculumId)?.apCourse;
  const planned = set.draftIds.length === 0;

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="break-words">
            {set.key ? `${set.key} · ${set.title}` : set.title}
          </DialogTitle>
          <DialogDescription>{set.description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {target.assignmentId ? (
            <>
              <Button size="sm" asChild>
                <Link href={assignmentHref(target.assignmentId, "problems")}>
                  <ClickIcon icon={AnimatedPencil} aria-hidden /> Edit problems
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={assignmentHref(target.assignmentId)}>Results</Link>
              </Button>
            </>
          ) : (
            target.publishedId &&
            onAssign && (
              <Button size="sm" onClick={onAssign} disabled={assignBusy}>
                <ClickIcon icon={AnimatedPlus} aria-hidden />{" "}
                {assignBusy ? "Copying…" : assignLabel}
              </Button>
            )
          )}
        </div>

        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            {set.topics.map((t) => apTopicLabel(t, course)).join(" · ")}
            {profile
              ? ` · ${profile.count} (${typeSummary(profile)}) · about ${profile.minutes} min`
              : ""}
          </p>
          {profile && profile.misconceptions.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-medium">Misconceptions the wrong answers catch</p>
              <ul className="flex flex-wrap gap-1.5">
                {profile.misconceptions.map((m) => (
                  <li key={m.tag}>
                    <Badge variant="outline" className="whitespace-normal text-left font-normal">
                      {misconceptionTag(m.tag)?.label ?? m.tag}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!sourceId ? (
            <p className="rounded-xl border border-border bg-muted/40 p-4 text-muted-foreground">
              {planned
                ? "This set is planned: its problems are not written yet."
                : "This set is not published in this workspace yet, so its problems cannot be shown here."}
            </p>
          ) : failed ? (
            <p role="alert" className="text-destructive">
              Could not load the problems. Close this and try again.
            </p>
          ) : questions === null ? (
            <p role="status" className="text-muted-foreground">
              Loading problems…
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">What students see</p>
                {!showKey &&
                  (target.assignmentId || canShowKey ? (
                    <Button variant="outline" size="sm" onClick={loadKey} disabled={keyBusy}>
                      {keyBusy ? "Loading…" : "Show answers"}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">{keyNote}</span>
                  ))}
              </div>
              <ol className="space-y-3">
                {questions.map((q, i) => (
                  <li key={q.id ?? i} className="space-y-2 rounded-xl border border-border p-4">
                    {extraFrom !== null && i === extraFrom && (
                      <p className="-mx-4 -mt-4 mb-2 rounded-t-xl border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                        Problems {extraFrom + 1} to {questions.length} are extra: assigned only when
                        you choose more than {extraFrom}.
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Problem {i + 1}</span>
                      <span>{TYPE[q.type ?? ""] ?? q.type ?? "Question"}</span>
                      {typeof q.points === "number" && <span>{q.points} pts</span>}
                    </div>
                    <Maths>{q.text ?? ""}</Maths>
                    {Array.isArray(q.options) && q.options.length > 0 && (
                      <ol className="space-y-1 pl-1">
                        {q.options.map((option, j) => (
                          <li
                            key={j}
                            className={`flex items-baseline gap-1.5 ${
                              showKey && option === q.correctAnswer
                                ? "font-medium text-green-700 dark:text-green-400"
                                : ""
                            }`}
                          >
                            <span className="shrink-0">{String.fromCharCode(65 + j)}.</span>
                            <Maths inline>{option}</Maths>
                            {showKey && option === q.correctAnswer && (
                              <span className="shrink-0">(correct)</span>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                    {showKey && !(Array.isArray(q.options) && q.options.length > 0) && (
                      <div className="flex items-baseline gap-1.5 font-medium text-green-700 dark:text-green-400">
                        <span className="shrink-0">Answer:</span>
                        {q.correctAnswer ? <Maths inline>{q.correctAnswer}</Maths> : "not set"}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
