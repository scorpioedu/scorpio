"use client";

// The student app's Study progress hook. The display pieces the Study pages share live in the
// Firebase-free `./study-display` and are re-exported here, so pages can import both from one place.
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { loadProgress, type ProgressReply } from "@/lib/study/client";

export {
  Eyebrow,
  InReviewMark,
  LEVEL_LABEL,
  LevelMeter,
  ReadMark,
  ReviewTopicLabel,
  TopicStrip,
  plural,
  reviewDay,
  topicIndex,
  topicPracticeHref,
  topicStudyHref,
  unitPracticeHref,
} from "./study-display";

export type StudyProgressState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; progress: ProgressReply };

/** The signed-in student's Study progress, loaded once the account is ready, with a reload. */
export function useStudyProgress(): StudyProgressState & {
  reload: () => void;
  setProgress: (p: ProgressReply) => void;
} {
  const { user } = useAuth();
  const [state, setState] = useState<StudyProgressState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!user) return;
    let active = true;
    loadProgress(authenticatedFetch)
      .then((progress) => active && setState({ status: "ready", progress }))
      .catch(
        (e: unknown) =>
          active &&
          setState({
            status: "error",
            message: e instanceof Error ? e.message : "Could not load your progress.",
          }),
      );
    return () => {
      active = false;
    };
  }, [user, attempt]);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);
  const setProgress = useCallback(
    (progress: ProgressReply) => setState({ status: "ready", progress }),
    [],
  );
  return { ...state, reload, setProgress };
}
