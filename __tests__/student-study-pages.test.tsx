/**
 * The student app's Study home (the one map of lessons and practice), the old Lessons redirect, and
 * the Study helpers. The jest environment has no DOM, so pages are
 * rendered to static markup with the progress hook mocked.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProgressReply } from "@/lib/study/client";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
jest.mock("@/contexts/auth-context", () => ({ useAuth: () => ({ user: { uid: "u1" } }) }));
jest.mock("@/lib/authenticated-fetch", () => ({ authenticatedFetch: jest.fn() }));
type MockRoadmap = {
  status: string;
  roadmap?: { curriculumId: string; units: { unit: number; state: string }[] };
};
let mockRoadmap: MockRoadmap = { status: "none" };
jest.mock("@/components/student/use-student-roadmap", () => ({
  useStudentRoadmap: () => mockRoadmap,
}));

let mockState: { status: "ready"; progress: ProgressReply } | { status: "loading" };
jest.mock("@/components/student/study-ui", () => ({
  ...jest.requireActual("@/components/student/study-ui"),
  useStudyProgress: () => ({ ...mockState, reload: jest.fn(), setProgress: jest.fn() }),
}));

const mockRedirect = jest.fn();
const mockPermanentRedirect = jest.fn();
jest.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
  permanentRedirect: (url: string) => mockPermanentRedirect(url),
}));

// The sidebar's own component pulls in the whole app shell; only its nav list is under test.
jest.mock("@/components/app-sidebar", () => ({ AppSidebar: () => null }));

import StudyHomePage from "@/app/student/study/page";
import StudentLessonsPage from "@/app/student/lessons/page";
import StudentReviewPage from "@/app/student/study/review/page";
import PublicStudyPage from "@/app/study/page";
import { studentNavSections } from "@/components/student-sidebar";
import {
  ReviewTopicLabel,
  reviewDay,
  topicIndex,
  topicPracticeHref,
  topicStudyHref,
  unitPracticeHref,
} from "@/components/student/study-ui";

type Topic = ProgressReply["courses"][0]["units"][0]["topics"][0];
type Unit = ProgressReply["courses"][0]["units"][0];

const reader = (unit: number, id: string) =>
  `/student/courses/ap-physics-1/${unit}#topic-${id.replace(".", "-")}`;

const topic = (id: string, over: Partial<Topic> = {}): Topic => ({
  id,
  key: `ap-physics-1:${id}`,
  title: `Topic ${id} title`,
  problems: 6,
  lessonHref: null,
  attempted: 0,
  correct: 0,
  level: "new" as const,
  inReview: false,
  read: false,
  ...over,
});

/** Counts the way the catalog makes them. */
function unit(n: number, title: string, topics: Topic[]): Unit {
  const withProblems = topics.filter((t) => t.problems > 0);
  return {
    unit: n,
    title,
    topics,
    strong: withProblems.filter((t) => t.level === "strong").length,
    practisable: withProblems.length,
    read: topics.filter((t) => t.read && t.lessonHref).length,
    lessons: topics.filter((t) => t.lessonHref).length,
  };
}

/**
 * AP Physics 1: unit 1 has a topic with a lesson and problems and one with neither; unit 2 has one
 * with both, one with problems only and one with a lesson only. AP Physics 2: practice only.
 */
function summary(
  over: Partial<ProgressReply> = {},
  topics: Partial<Record<string, Partial<Topic>>> = {},
): ProgressReply {
  const t = (u: number, id: string, base: Partial<Topic>) => topic(id, { ...base, ...topics[id] });
  return {
    courses: [
      {
        id: "ap-physics-1",
        name: "AP Physics 1",
        attempted: 0,
        units: [
          unit(1, "Kinematics", [
            t(1, "1.1", { lessonHref: reader(1, "1.1") }),
            t(1, "1.2", { problems: 0 }),
          ]),
          unit(2, "Force and translational dynamics", [
            t(2, "2.1", { lessonHref: reader(2, "2.1") }),
            t(2, "2.2", {}),
            t(2, "2.3", { problems: 0, lessonHref: reader(2, "2.3") }),
          ]),
        ],
      },
      {
        id: "ap-physics-2",
        name: "AP Physics 2",
        attempted: 0,
        units: [unit(9, "Thermo", [topic("9.1", { key: "ap-physics-2:9.1", ...topics["9.1"] })])],
      },
    ],
    dueCount: 0,
    nextReviewAt: null,
    streak: 0,
    answered: 0,
    correct: 0,
    misconceptions: [],
    lastTopic: null,
    shareToken: null,
    ...over,
  };
}

const render = () => renderToStaticMarkup(<StudyHomePage />);
const classRoadmap: MockRoadmap = {
  status: "ready",
  roadmap: {
    curriculumId: "ap-physics-1",
    units: [
      { unit: 2, state: "current" },
      { unit: 1, state: "not-assigned" },
    ],
  },
};

/** Runs `fn` with a course stored on this device, as the course switcher stores it. */
function withStoredCourse<T>(id: string, fn: () => T): T {
  const g = globalThis as { window?: unknown };
  g.window = {
    localStorage: { getItem: (k: string) => (k === "scorpio.study.course.u1" ? id : null) },
  };
  try {
    return fn();
  } finally {
    delete g.window;
  }
}

const readLast = {
  courseId: "ap-physics-1",
  topicId: "1.1",
  title: "Topic 1.1 title",
  unit: 1,
  kind: "read" as const,
  lessonHref: reader(1, "1.1"),
};

describe("Study home", () => {
  test("a student with no course yet is asked which course they take, and nothing else", () => {
    mockRoadmap = { status: "none" };
    mockState = { status: "ready", progress: summary() };
    const html = render();
    expect(html).toContain("Which course are you taking?");
    expect(html).toContain("You can switch course any time");
    // No header switcher, no units, no start link until a course is known.
    expect(html).not.toContain('aria-label="Course"');
    expect(html).not.toContain("Unit 1:");
    expect(html).not.toContain("Start with");
    expect(html).not.toContain("/student/courses/");
    expect(html).not.toContain("Start review");
    expect(html).not.toContain("Continue reading");
  });

  test("a new student in a class gets the class's course: switcher, a first topic, units in class order", () => {
    mockRoadmap = classRoadmap;
    mockState = { status: "ready", progress: summary() };
    const html = render();
    // No picker: the course is known, and switched in the header.
    expect(html).not.toContain("Which course are you taking?");
    expect(html).toMatch(/aria-label="Course"[^>]*>.*?AP Physics 1/);
    // The first topic in the class's order, opened in the reader.
    expect(html).toContain("Start here");
    expect(html).toContain("Topic 2.1 title");
    expect(html).toContain("Start this topic");
    expect(html).toContain(`href="${reader(2, "2.1")}"`);
    expect(html).toContain("3 lessons · 3 to practise");
    expect(html).toContain("In your class&#x27;s order");
    expect(html.indexOf("Unit 2: </span>Force")).toBeLessThan(
      html.indexOf("Unit 1: </span>Kinematics"),
    );
    expect(html).toContain("Your class is here");
    // Unit cards: what has been read and how many topics are strong, only where they apply.
    expect(html).toContain("0 of 2 read · 0 strong");
    expect(html).toContain("0 of 1 read · 0 strong");
    // The unit the class is on is open; the other is folded.
    expect(html).toMatch(/aria-expanded="true" aria-controls="study-unit-ap-physics-1-2"/);
    expect(html).toMatch(/aria-expanded="false" aria-controls="study-unit-ap-physics-1-1"/);
    // Whole-unit links on every unit card, open or not.
    expect(html).toContain('href="/student/study/practice?course=ap-physics-1&amp;unit=2"');
    expect(html).toContain("Open unit lessons");
    // Topic rows: a lesson opens in the reader, problems only open practice.
    expect(html).toContain(`href="${reader(2, "2.3")}"`);
    expect(html).toContain('href="/student/study/practice?course=ap-physics-1&amp;topic=2.2"');
    expect(html).toContain("Practice only");
    expect(html).not.toContain("topic=2.1"); // no separate practice button for a topic with a lesson
    expect(html).not.toContain(">Practice</");
    // Only the selected course's units.
    expect(html).not.toContain("Thermo");
    expect(html).not.toContain(">Streak</dt>");
  });

  test("the course stored on this device wins over the class's course", () => {
    mockRoadmap = classRoadmap;
    mockState = { status: "ready", progress: summary() };
    const html = withStoredCourse("ap-physics-2", render);
    expect(html).not.toContain("Which course are you taking?");
    expect(html).toMatch(/aria-label="Course"[^>]*>.*?AP Physics 2/);
    expect(html).toContain("Unit 9: </span>Thermo");
    expect(html).not.toContain("Kinematics");
    expect(html).toContain("Topic 9.1 title");
    // A stored course that no longer exists is ignored.
    expect(withStoredCourse("no-such-course", render)).toContain("Unit 2: </span>Force");
  });

  test("a topic with neither a lesson nor problems is shown muted, without a link", () => {
    mockRoadmap = { status: "none" };
    mockState = {
      status: "ready",
      progress: summary({ lastTopic: readLast }, { "1.1": { read: true } }),
    };
    const html = render();
    expect(html).toMatch(
      /<div class="[^"]*text-muted-foreground[^"]*">.*?1\.2<\/span>Topic 1\.2 title/,
    );
    expect(html).toContain("Coming soon");
  });

  test("after reading a lesson the student continues reading, and the unit counts it", () => {
    mockRoadmap = { status: "none" };
    mockState = {
      status: "ready",
      progress: summary({ lastTopic: readLast }, { "1.1": { read: true } }),
    };
    const html = render();
    expect(html).not.toContain("Which course are you taking?");
    // The course read in is the one shown.
    expect(html).toMatch(/aria-label="Course"[^>]*>.*?AP Physics 1/);
    expect(html).toContain("Continue reading");
    expect(html).toContain("Topic 1.1 title");
    expect(html).toContain("Open topic");
    expect(html).toContain(`href="${reader(1, "1.1")}"`);
    expect(html).toContain("1 of 1 read · 0 strong");
    expect(html).toContain("1 of 3 read · 0 of 3 strong"); // the course
    expect(html).toContain('<span class="sr-only">Read</span>');
    // Reading alone shows no practice counts.
    expect(html).not.toContain(">Streak</dt>");
  });

  test("a returning student keeps practising, reviews right here, and sees the course they practise most", () => {
    mockRoadmap = { status: "none" };
    const base = summary(
      {},
      {
        "9.1": { attempted: 3, correct: 2, level: "practised", inReview: true },
      },
    );
    base.courses[1].attempted = 3;
    mockState = {
      status: "ready",
      progress: {
        ...base,
        dueCount: 2,
        answered: 3,
        correct: 2,
        streak: 1,
        lastTopic: {
          courseId: "ap-physics-2",
          topicId: "9.1",
          title: "Topic 9.1 title",
          unit: 9,
          kind: "practice",
          lessonHref: null,
        },
      },
    };
    const html = render();
    expect(html).toContain("Keep practising");
    // No lesson for the topic, so Continue falls back to its practice page.
    expect(html).toContain("Practise this topic");
    expect(html).toContain('href="/student/study/practice?course=ap-physics-2&amp;topic=9.1"');
    // Review runs on this page: a button, not a link to another page.
    expect(html).toMatch(/>2<\/span><span[^>]*>topics to review/);
    expect(html).toMatch(/<button[^>]*>.*?Start review \(2 topics\)<\/button>/);
    expect(html).not.toContain("/student/study/review");
    expect(html).toContain("In review");
    expect(html).toContain("2/3 right");
    expect(html).toContain(">Streak</dt>");
    expect(html).toContain("1 day");
    // Only AP Physics 2's units.
    expect(html).toMatch(/aria-label="Course"[^>]*>.*?AP Physics 2/);
    expect(html).not.toContain("Kinematics");
  });

  test("Keep practising goes to the topic's lesson when it has one", () => {
    mockRoadmap = { status: "none" };
    mockState = {
      status: "ready",
      progress: summary(
        {
          answered: 1,
          correct: 1,
          lastTopic: {
            courseId: "ap-physics-1",
            topicId: "2.1",
            title: "Topic 2.1 title",
            unit: 2,
            kind: "practice",
            lessonHref: reader(2, "2.1"),
          },
        },
        { "2.1": { attempted: 1, correct: 1, level: "learning" } },
      ),
    };
    const html = render();
    expect(html).toContain("Keep practising");
    expect(html).toMatch(new RegExp(`href="${reader(2, "2.1")}"[^>]*>Open topic`));
    expect(html).toContain("1/1 right");
  });

  test("with nothing due, Review says when the next one is", () => {
    mockRoadmap = classRoadmap;
    mockState = {
      status: "ready",
      progress: summary({ nextReviewAt: new Date(Date.now() + 86_400_000).toISOString() }),
    };
    const html = render();
    expect(html).toContain("All caught up");
    expect(html).toContain("Next review tomorrow.");
    expect(html).not.toContain("Start review");
  });

  test("shows a loading state", () => {
    mockState = { status: "loading" };
    expect(render()).toContain("Loading your topics");
  });
});

describe("Review problems", () => {
  const label = (node: ReactNode) => renderToStaticMarkup(<>{node}</>);

  test("name their topic, with a link back to its lesson in a new tab when there is one", () => {
    const html = label(
      <ReviewTopicLabel
        topicId="2.1"
        topic={{ title: "Topic 2.1 title", lessonHref: reader(2, "2.1") }}
      />,
    );
    expect(html).toContain("2.1 Topic 2.1 title");
    expect(html).toMatch(
      new RegExp(`href="${reader(2, "2.1")}" target="_blank" rel="noopener"[^>]*>Re-read 2.1`),
    );
    expect(
      label(<ReviewTopicLabel topicId="9.1" topic={{ title: "Thermo", lessonHref: null }} />),
    ).not.toContain("Re-read");
    expect(label(<ReviewTopicLabel topicId="9.9" topic={undefined} />)).toBe("Topic 9.9");
  });
});

describe("Old Study pages", () => {
  test("/student/lessons and /student/study/review redirect to Study", () => {
    mockRedirect.mockClear();
    StudentLessonsPage();
    StudentReviewPage();
    expect(mockRedirect.mock.calls).toEqual([["/student/study"], ["/student/study"]]);
  });

  test("the public /study page moved for good into the lessons hub", () => {
    mockPermanentRedirect.mockClear();
    PublicStudyPage();
    expect(mockPermanentRedirect.mock.calls).toEqual([["/lessons"]]);
  });
});

describe("Student sidebar", () => {
  const study = studentNavSections
    .flatMap((s) => s.items)
    .find((i) => "href" in i && i.href === "/student/study");

  test("Study holds Study, Notebook, Formula vault and Resources: no Lessons, Practice or Review", () => {
    expect(study && "children" in study && study.children?.map((c) => [c.label, c.href])).toEqual([
      ["Study", "/student/study"],
      ["Notebook", "/student/notebook"],
      ["Formula vault", "/student/vault"],
      ["Resources", "/student/resources"],
    ]);
  });

  test("the lesson reader and old links light up Study", () => {
    const child = study && "children" in study ? study.children?.[0] : undefined;
    expect(child?.match).toEqual(
      expect.arrayContaining(["/student/courses", "/student/lessons", "/student/guides"]),
    );
  });
});

describe("Study helpers", () => {
  test("practice links carry the course and the topic or unit", () => {
    expect(topicPracticeHref("ap-physics-1", "3.4")).toBe(
      "/student/study/practice?course=ap-physics-1&topic=3.4",
    );
    expect(unitPracticeHref("ap-physics-c-mechanics", 2)).toBe(
      "/student/study/practice?course=ap-physics-c-mechanics&unit=2",
    );
  });

  test("review days read as today, tomorrow, or a date", () => {
    const now = new Date(2026, 10, 26, 15);
    expect(reviewDay(new Date(2026, 10, 26, 9).toISOString(), now)).toBe("today");
    expect(reviewDay(new Date(2026, 10, 27, 9).toISOString(), now)).toBe("tomorrow");
    expect(reviewDay(new Date(2026, 11, 2, 9).toISOString(), now)).not.toMatch(/today|tomorrow/);
    expect(reviewDay("nonsense", now)).toBe("soon");
  });

  test("a topic is studied in its lesson, else its practice, else nowhere yet", () => {
    expect(topicStudyHref("ap-physics-1", topic("2.1", { lessonHref: reader(2, "2.1") }))).toBe(
      reader(2, "2.1"),
    );
    expect(topicStudyHref("ap-physics-1", topic("2.2"))).toBe(
      "/student/study/practice?course=ap-physics-1&topic=2.2",
    );
    expect(topicStudyHref("ap-physics-1", topic("1.2", { problems: 0 }))).toBeNull();
  });

  test("the topic index finds a topic by its key", () => {
    const index = topicIndex(summary().courses);
    expect(index.get("ap-physics-1:1.2")?.unit).toBe(1);
    expect(index.get("ap-physics-1:9.1")).toBeUndefined();
  });
});
