/**
 * The guide components. The jest environment is "node" with no DOM (see route-boundaries.test.tsx),
 * so they are rendered to static markup; what a press would change is reached through the same
 * props a press sets (`initialShown`, `defaultOpen`).
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The real renderer loads react-markdown lazily in the browser; here text is enough.
jest.mock("@/components/lazy-markdown-renderer", () => ({
  LazyMarkdownRenderer: ({ children }: { children: string }) => <div data-md>{children}</div>,
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { Reveal, TopicGuide, TryIt, WorkedExampleCard } from "@/components/guide/topic-guide";
import { UnitGuideTopics } from "@/components/guide/unit-guide-topics";
import { StudentCourseRoadmap } from "@/components/dashboard/student-course-roadmap";
import { buildStudentRoadmap } from "@/lib/student-roadmap";
import unit4 from "@/data/guides/ap-physics-1/unit-4.json";
import type { UnitGuide } from "@/lib/guides/schema";
import { topicFixture } from "../tests/helpers/guide-fixture";

const guide = topicFixture("4.2", {
  derivation: "Start from Newton's second law.",
  prerequisites: ["2.5", "4.1"],
  tryIt: {
    diagram: 'scene\nground 0..8\nblock A 4,0 w={{w}} "{{w}} m"',
    caption: "Change the width.",
    params: [{ name: "w", label: "Width", min: 1, max: 3, step: 0.5, default: 2, unit: "m" }],
  },
});
const html = (node: ReactNode) => renderToStaticMarkup(node);
const order = (markup: string, ...parts: string[]) => {
  const at = parts.map((p) => markup.indexOf(p));
  expect(at.every((i) => i >= 0)).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
};

describe("TopicGuide", () => {
  test("shows the sections in the schema's order, under headings of one level", () => {
    const out = html(<TopicGuide guide={guide} />);
    order(
      out,
      ">Big idea<",
      'class="dg"',
      ">Explanation<",
      ">Equations<",
      ">Where it comes from<",
      ">Worked examples<",
      ">Common mistakes<",
      ">Check yourself<",
      ">Try it<",
      ">Builds on<",
    );
    expect(out.match(/<h3/g)).toHaveLength(9);
    expect(out.match(/<h4/g)).toHaveLength(2); // the two worked examples' titles
    expect(out).not.toMatch(/<h[1256]/);
    // headingLevel moves every heading together.
    const deeper = html(<TopicGuide guide={guide} headingLevel={4} />);
    expect(deeper.match(/<h4/g)).toHaveLength(9);
    expect(deeper.match(/<h5/g)).toHaveLength(2);
  });

  test("diagrams carry alt text", () => {
    const out = html(<TopicGuide guide={guide} />);
    expect(out).toMatch(/<figure[^>]*aria-label="Diagram showing[^"]+"/);
    expect(out).toContain("<title>Diagram showing");
  });

  test("teacher notes and tag names show only for a teacher", () => {
    const student = html(<TopicGuide guide={guide} />);
    expect(student).not.toContain("Insist on signs.");
    expect(student).not.toContain("Teaching notes");
    expect(student).not.toContain("Ignores the direction of momentum");
    const teacher = html(<TopicGuide guide={guide} teacher />);
    expect(teacher).toContain("Insist on signs.");
    expect(teacher).toContain("Only teachers see this");
    expect(teacher).toContain("In reports: Ignores the direction of momentum");
  });

  test("the derivation and the check-yourself answers start hidden, behind labelled buttons", () => {
    const out = html(<TopicGuide guide={guide} />);
    expect(out).not.toContain("Start from Newton");
    expect(out).toContain("Show the derivation");
    expect(out).not.toContain("Mass times velocity.");
    expect(out.match(/Show answer/g)).toHaveLength(3);
    expect(out.match(/aria-expanded="false"/g)).toHaveLength(4);
    expect(out).not.toContain('aria-expanded="true"');
  });

  test("the stepped example starts with the problem only; the exam-style one is written out", () => {
    const out = html(<TopicGuide guide={guide} />);
    expect(out).toContain("Find its momentum.");
    expect(out).toContain("Show the first step");
    expect(out).not.toContain("Write $p = mv$.");
    expect(out).not.toContain("$p = 6.0");
    expect(out).toContain("Momentum points the way the velocity does.");
    expect(out).toContain("To the left.");
  });

  test("prerequisites are named, and linked when the page says where they are", () => {
    const plain = html(<TopicGuide guide={guide} />);
    expect(plain).toContain("2.5 Newton&#x27;s second law");
    expect(plain).not.toContain("<a ");
    const linked = html(
      <TopicGuide
        guide={guide}
        prerequisiteHref={(id) => (id === "4.1" ? "/g#topic-4-1" : undefined)}
      />,
    );
    expect(linked).toContain('<a href="/g#topic-4-1">4.1 Linear momentum</a>');
    expect(linked.match(/<a /g)).toHaveLength(1);
  });

  test('"Practise this" lists the links it is given and is left out without any', () => {
    expect(html(<TopicGuide guide={guide} />)).not.toContain("Practise this");
    const out = html(
      <TopicGuide
        guide={guide}
        practice={[{ label: "Impulse", href: "/student/assignment-view?id=a1" }]}
      />,
    );
    order(
      out,
      ">Builds on<",
      ">Practise this<",
      'href="/student/assignment-view?id=a1"',
      "Impulse",
    );
  });

  test("a guide without the optional parts leaves their sections out", () => {
    const bare = topicFixture("4.1", {
      picture: undefined,
      teacherNotes: undefined,
      equations: [],
    });
    const out = html(<TopicGuide guide={bare} teacher />);
    for (const absent of [
      'class="dg"',
      "Equations",
      "Where it comes from",
      "Try it",
      "Builds on",
      "Teaching notes",
    ])
      expect(out).not.toContain(absent);
  });
});

describe("WorkedExampleCard", () => {
  const [stepped, ap] = guide.workedExamples;

  test("stepped: one more step per press, then the answer", () => {
    const none = html(<WorkedExampleCard example={stepped} level={4} />);
    expect(none).toContain("0 of 2 steps");
    const one = html(<WorkedExampleCard example={stepped} level={4} initialShown={1} />);
    expect(one).toContain("Write $p = mv$.");
    expect(one).not.toContain("Multiply:");
    expect(one).toContain("Next step");
    expect(one).toContain("1 of 2 steps");
    expect(one).not.toContain(">Answer<");
    const all = html(<WorkedExampleCard example={stepped} level={4} initialShown={2} />);
    expect(all).toContain("Multiply:");
    expect(all).toContain(">Answer<");
    expect(all).toContain("$p = 6.0");
    expect(all).not.toContain("Next step");
  });

  test("exam style: every step and the answer, no buttons", () => {
    const out = html(<WorkedExampleCard example={ap} level={4} />);
    expect(out).toContain("Written as an exam answer");
    expect(out).toContain("The velocity is to the left.");
    expect(out).toContain(">Answer<");
    expect(out).not.toContain("<button");
  });
});

describe("Reveal", () => {
  test("closed: a button and no content; open: the content and the other label", () => {
    const closed = html(
      <Reveal show="Show answer" hide="Hide answer">
        secret
      </Reveal>,
    );
    expect(closed).toContain("Show answer");
    expect(closed).not.toContain("secret");
    const open = html(
      <Reveal show="Show answer" hide="Hide answer" defaultOpen>
        secret
      </Reveal>,
    );
    expect(open).toContain("Hide answer");
    expect(open).toContain("secret");
    expect(open).toContain('aria-expanded="true"');
    // The button names the element it controls.
    const id = open.match(/aria-controls="([^"]+)"/)![1];
    expect(open).toContain(`id="${id}"`);
  });
});

describe("TryIt", () => {
  test("a labelled slider per parameter, at its default, and the diagram drawn with it", () => {
    const out = html(<TryIt tryIt={guide.tryIt!} />);
    const id = out.match(/<label for="([^"]+)"/)![1];
    expect(out).toContain(`<input id="${id}" type="range" min="1" max="3" step="0.5"`);
    expect(out).toContain('value="2"');
    expect(out).toContain('aria-valuetext="2 m"');
    expect(out).toContain("Width");
    expect(out).toContain('class="dg"');
    expect(out).toContain("2 m");
    expect(out).not.toContain("{{");
  });

  test("a template that cannot be filled shows the plain fallback, not a broken picture", () => {
    const broken = { ...guide.tryIt!, diagram: "scene\nground 0..{{nope}}" };
    const out = html(<TryIt tryIt={broken} />);
    expect(out).toContain("Diagram not available");
    expect(out).not.toContain('class="dg"');
  });
});

describe("UnitGuideTopics", () => {
  const unit = unit4 as unknown as UnitGuide;
  const topics = unit.guides.map((g) => g.topic);

  test("collapsed: each topic's number, title and summary, with a button to read its guide", () => {
    const out = html(<UnitGuideTopics course="physics-1" topics={topics} guide={unit} />);
    for (const id of ["topic-4-1", "topic-4-2", "topic-4-3", "topic-4-4"])
      expect(out).toContain(`id="${id}"`);
    expect(out).toContain("Change in momentum and impulse");
    expect(out).toContain("Impulse equals change in momentum");
    expect(out.match(/Read the guide/g)).toHaveLength(4);
    expect(out.match(/<h2/g)).toHaveLength(4);
    expect(out).not.toContain("Big idea");
  });

  test("an open topic shows its guide under the topic's heading", () => {
    const out = html(
      <UnitGuideTopics course="physics-1" topics={topics} guide={unit} defaultOpen={["4.2"]} />,
    );
    expect(out.match(/Big idea/g)).toHaveLength(1);
    expect(out).toContain("Hide the guide");
    expect(out.match(/Read the guide/g)).toHaveLength(3);
    const section = out.slice(out.indexOf('id="topic-4-2"'), out.indexOf('id="topic-4-3"'));
    order(section, "<h2", "<h3", "<h4");
    expect(section).toContain("Big idea");
    expect(out).toContain("A net force acting over a time interval delivers an impulse");
  });

  test("while the guide file loads, the rows show without the button", () => {
    const out = html(
      <UnitGuideTopics course="physics-1" topics={topics} guide={null} defaultOpen={["4.2"]} />,
    );
    expect(out).toContain("Conservation of linear momentum");
    expect(out).not.toContain("Read the guide");
    expect(out).not.toContain("Big idea");
  });

  test("teacher extras: the line under the summary, practice links and notes", () => {
    const out = html(
      <UnitGuideTopics
        course="physics-1"
        topics={topics}
        guide={unit}
        teacher
        defaultOpen={["4.1"]}
        meta={(id) => <p>Practised in set for {id}</p>}
        practiceFor={(id) => [{ label: `Set for ${id}`, href: `#set-${id}` }]}
      />,
    );
    expect(out).toContain("Practised in set for 4.3");
    expect(out).toContain('href="#set-4.1"');
    expect(out).not.toContain('href="#set-4.2"'); // closed topics render no guide
    expect(out).toContain("Teaching notes");
  });
});

describe("StudentCourseRoadmap", () => {
  const roadmap = buildStudentRoadmap(
    "ap-physics-1",
    null,
    [
      { id: "a4", title: "4A", curriculumSetKey: "4A", curriculumId: "ap-physics-1" },
      { id: "a5", title: "5A", curriculumSetKey: "5A", curriculumId: "ap-physics-1" },
    ],
    [],
  )!;

  test("a unit's heading links to its guide only when the unit has one", () => {
    expect(roadmap.curriculumId).toBe("ap-physics-1");
    const out = html(<StudentCourseRoadmap roadmap={roadmap} />);
    expect(out).toContain('<a href="/student/courses/ap-physics-1/4"');
    expect(out).toContain("Unit 4: Linear momentum");
    expect(out).toContain("Unit 5:");
    expect(out).not.toContain("/student/courses/ap-physics-1/5");
    expect(out.match(/\/student\/courses\//g)).toHaveLength(1);
  });
});
