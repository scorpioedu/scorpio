/**
 * The student lesson reader as a lesson + practice page: Study status in the sidebar and under the
 * topic's title, the practice and unit check slots, the inline practice's states and ends, and the
 * one-time move of this browser's read marks into Study. The jest environment has no DOM, so the
 * components are rendered to static markup.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@/components/lazy-markdown-renderer", () => ({
  LazyMarkdownRenderer: ({ children }: { children: string }) => <div data-md>{children}</div>,
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
jest.mock("@/contexts/auth-context", () => ({ useAuth: () => ({ user: null, role: null }) }));
jest.mock("@/lib/authenticated-fetch", () => ({ authenticatedFetch: jest.fn() }));
jest.mock("@/lib/firebase", () => ({ db: {} }));
jest.mock("@/lib/study/client", () => ({
  loadProblems: jest.fn(),
  loadProgress: jest.fn(),
  markRead: jest.fn(),
}));
// The topic in the address: the server snapshot has no hash, so tests name it here.
let mockTopic: string | null = null;
jest.mock("@/lib/guides", () => {
  const actual = jest.requireActual("@/lib/guides");
  return {
    ...actual,
    topicFromAnchor: (hash: string) => mockTopic ?? actual.topicFromAnchor(hash),
  };
});

import { GuideReader, type ReaderTopicStatus } from "@/components/guide/guide-reader";
import { InlinePractice, PracticeEnd } from "@/components/study/topic-practice-inline";
import type { PracticeResult } from "@/components/study/practice-session";
import {
  migrateReadMarks,
  readMigratedKey,
} from "@/app/student/courses/[curriculumId]/[unit]/page-client";
import { markRead } from "@/lib/study/client";
import unit4 from "@/data/guides/ap-physics-1/unit-4.json";
import type { UnitGuide } from "@/lib/guides/schema";

const html = (node: ReactNode) => renderToStaticMarkup(node);
const order = (markup: string, ...parts: string[]) => {
  const at = parts.map((p) => markup.indexOf(p));
  expect(at.every((i) => i >= 0)).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
};

const props = {
  curriculumId: "ap-physics-1",
  courseName: "AP Physics 1",
  course: "physics-1" as const,
  unit: 4,
  guide: unit4 as unknown as UnitGuide,
};

const statuses: Record<string, ReaderTopicStatus> = {
  "4.1": { level: "practised", inReview: true, read: false },
  "4.2": { level: "strong", inReview: false, read: true },
  "4.3": { level: "new", inReview: false, read: false },
};
const topicStatus = (id: string) => statuses[id];

afterEach(() => {
  mockTopic = null;
});

describe("GuideReader with Study", () => {
  test("the sidebar shows each topic's level and the server's read ticks", () => {
    const out = html(<GuideReader {...props} topicStatus={topicStatus} />);
    // A level meter per topic with a status (its label is for screen readers).
    expect(out).toContain('<span class="sr-only">Strong</span>');
    expect(out).toContain('<span class="sr-only">New</span>');
    // 4.2 is read on the server; this device has no marks.
    expect(out).toMatch(/href="#topic-4-2"[\s\S]*?aria-label="Read"/);
    expect(out).toContain("1 of 4 read");
  });

  test("the topic header says its level and whether it is in review", () => {
    const out = html(<GuideReader {...props} topicStatus={topicStatus} />);
    order(out, "Unit 4 · Topic 4.1", "Practised · In review", ">Big idea<");
    // Without Study status the header has none.
    expect(html(<GuideReader {...props} />)).not.toContain("· In review");
  });

  test("practice comes after the lesson and before the class's links", () => {
    const out = html(
      <GuideReader
        {...props}
        practiceFor={() => [{ label: "4A · Momentum set", href: "/student/assignment-view?id=a1" }]}
        renderPractice={(id) => <p>PRACTICE {id}</p>}
        renderUnitCheck={() => <p>UNIT CHECK</p>}
      />,
    );
    order(out, ">Explanation<", "PRACTICE 4.1", ">From your class<", "4A · Momentum set");
    // The unit check waits for the last topic.
    expect(out).not.toContain("UNIT CHECK");
    // Practice turns off ← and → while it has focus.
    expect(out).toMatch(/data-no-topic-keys=""[^>]*><p>PRACTICE 4\.1/);
  });

  test("the last topic ends with the unit check, before Previous and Next", () => {
    mockTopic = "4.4";
    const out = html(
      <GuideReader
        {...props}
        renderPractice={(id) => <p>PRACTICE {id}</p>}
        renderUnitCheck={() => <p>UNIT CHECK</p>}
      />,
    );
    expect(out).toContain("Unit 4 · Topic 4.4");
    order(out, "PRACTICE 4.4", 'id="unit-check"', "UNIT CHECK", "Previous");
  });

  test("no practice while the lesson loads", () => {
    const out = html(
      <GuideReader
        {...props}
        guide={null}
        renderPractice={(id) => <p>PRACTICE {id}</p>}
        renderUnitCheck={() => <p>UNIT CHECK</p>}
      />,
    );
    expect(out).toContain("Loading the lesson");
    expect(out).not.toContain("PRACTICE");
  });

  test("goes back to Study by default", () => {
    const out = html(<GuideReader {...props} />);
    expect(out).toContain('href="/student/study"');
    expect(out).toMatch(/<\/svg><\/div> Study<\/a>/);
  });
});

describe("InlinePractice", () => {
  test("a topic's practice starts on a press, with one line about it", () => {
    const out = html(<InlinePractice course="ap-physics-1" topic="4.2" unit={4} />);
    expect(out).toContain(">Practice</h2>");
    expect(out).toContain(
      "See how well this topic has stuck. Any you miss come back for review on your Study page.",
    );
    expect(out).toContain("Practise this topic");
  });

  test("a topic with no problems says so, with no button", () => {
    const out = html(<InlinePractice course="ap-physics-1" topic="4.2" unit={4} available={0} />);
    expect(out).toContain("No practice problems for this topic right now.");
    expect(out).not.toContain("<button");
  });

  test("the unit check", () => {
    const out = html(<InlinePractice course="ap-physics-1" unit={4} available={12} />);
    expect(out).toContain(">Unit check</h2>");
    expect(out).toContain("A mix of problems from across Unit 4");
    expect(out).toContain("Start the unit check");
  });
});

describe("PracticeEnd", () => {
  const result = (correct: boolean, saved = true): PracticeResult => ({
    problem: {
      key: `k${Math.random()}`,
      courseId: "ap-physics-1",
      unit: 4,
      topicId: "4.2",
      type: "numeric",
      text: "?",
    },
    reply: {
      correct,
      fraction: correct ? 1 : 0,
      feedback: "",
      misconception: null,
      answer: "1 m/s",
      solution: null,
      saved,
    },
  });
  const noop = () => undefined;

  test("a topic's run: more, the next topic, and Review after a miss", () => {
    const out = html(
      <PracticeEnd
        results={[result(true), result(false)]}
        topic="4.2"
        size={3}
        next={{ label: "Next topic", href: "#topic-4-3" }}
        onMore={noop}
      />,
    );
    expect(out).toContain("This topic will come back for review on your Study page.");
    expect(out).toContain("3 more");
    expect(out).toContain('href="#topic-4-3"');
    expect(out).toContain("Next topic");
  });

  test("all right (or nothing saved): no Review line; the last topic points at the unit check", () => {
    const allRight = html(
      <PracticeEnd
        results={[result(true), result(true)]}
        topic="4.4"
        size={3}
        next={{ label: "Unit check", onClick: noop }}
        onMore={noop}
      />,
    );
    expect(allRight).not.toContain("come back for review");
    expect(allRight).toMatch(/<button[^>]*>Unit check/);
    const unsaved = html(
      <PracticeEnd results={[result(false, false)]} topic="4.4" size={3} onMore={noop} />,
    );
    expect(unsaved).not.toContain("come back for review");
  });

  test("the unit check's run: five more and back to Study", () => {
    const out = html(<PracticeEnd results={[result(false)]} size={5} onMore={noop} />);
    expect(out).toContain("5 more");
    expect(out).toContain('href="/student/study"');
    expect(out).toContain("Back to Study");
    expect(out).not.toContain("come back for review");
  });
});

describe("migrateReadMarks", () => {
  const store = new Map<string, string>();
  const mocked = markRead as jest.MockedFunction<typeof markRead>;
  beforeAll(() => {
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    };
  });
  afterAll(() => {
    delete (globalThis as { window?: unknown }).window;
  });
  beforeEach(() => {
    store.clear();
    mocked.mockReset();
  });

  test("sends this browser's marks once, in one request, then sets the flag", async () => {
    store.set("guide-read:ap-physics-1", "4.1,4.2,nonsense");
    mocked.mockResolvedValue(undefined);
    await migrateReadMarks("ap-physics-1");
    expect(mocked).toHaveBeenCalledTimes(1);
    expect(mocked.mock.calls[0].slice(1)).toEqual(["ap-physics-1", ["4.1", "4.2"]]);
    expect(store.get(readMigratedKey("ap-physics-1"))).toBe("1");
    await migrateReadMarks("ap-physics-1");
    expect(mocked).toHaveBeenCalledTimes(1);
  });

  test("no marks: nothing sent, flag set", async () => {
    await migrateReadMarks("ap-physics-1");
    expect(mocked).not.toHaveBeenCalled();
    expect(store.get(readMigratedKey("ap-physics-1"))).toBe("1");
  });

  test("a failed request leaves the flag unset, to try again next visit", async () => {
    store.set("guide-read:ap-physics-1", "4.1");
    mocked.mockRejectedValue(new Error("offline"));
    await expect(migrateReadMarks("ap-physics-1")).rejects.toThrow("offline");
    expect(store.has(readMigratedKey("ap-physics-1"))).toBe(false);
  });
});
