"use client";

// The body of a public lesson: the app's topic guide, with Markdown rendered on the server (so the
// text is in the page for readers without JavaScript and for search engines) and section anchors.
import { useEffect } from "react";
import type { ApCourseId } from "@/data/ap";
import type { TopicGuide as TopicGuideData } from "@/lib/guides/schema";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { GuideMarkdown, TopicGuide } from "@/components/guide/topic-guide";

/** Topics read on this device, shared with the reader in the app (guide-reader.tsx). */
const READ_EVENT = "guide-read";
const readKey = (curriculumId: string) => `guide-read:${curriculumId}`;

export function readTopics(curriculumId: string): Set<string> {
  try {
    return new Set(
      (window.localStorage.getItem(readKey(curriculumId)) ?? "").split(",").filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

export function subscribeRead(onChange: () => void) {
  window.addEventListener(READ_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(READ_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function markRead(curriculumId: string, topicId: string) {
  try {
    const now = readTopics(curriculumId);
    if (now.has(topicId)) return;
    now.add(topicId);
    window.localStorage.setItem(readKey(curriculumId), [...now].join(","));
    window.dispatchEvent(new Event(READ_EVENT));
  } catch {
    // Blocked storage: the marks are only a convenience.
  }
}

const renderMarkdown = (markdown: string, className?: string) => (
  <MarkdownRenderer className={className}>{markdown}</MarkdownRenderer>
);

export function LessonTopic({
  curriculumId,
  course,
  guide,
  prerequisites,
}: {
  curriculumId: string;
  course: ApCourseId;
  guide: TopicGuideData;
  /** Topic id -> its public lesson, for the "Builds on" links. */
  prerequisites: Record<string, string>;
}) {
  // A topic counts as read once it has been open for a few seconds, as in the app.
  useEffect(() => {
    const t = window.setTimeout(() => markRead(curriculumId, guide.topic), 4000);
    return () => window.clearTimeout(t);
  }, [curriculumId, guide.topic]);

  return (
    <GuideMarkdown renderer={renderMarkdown}>
      <TopicGuide
        guide={guide}
        course={course}
        headingLevel={2}
        prerequisiteHref={(id) => prerequisites[id]}
        className="space-y-10 [&_section[id]>h2]:text-xl [&_section[id]>h2]:font-medium [&_section[id]>h2]:tracking-[-0.02em] [&_.prose]:text-[15.5px] [&_.prose]:leading-relaxed"
      />
    </GuideMarkdown>
  );
}
