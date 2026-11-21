/**
 * The student assignment page's guide links and solution block. As in topic-guide.test.tsx the
 * jest environment has no DOM, so components are rendered to static markup.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@/components/lazy-markdown-renderer", () => ({
  LazyMarkdownRenderer: ({ children }: { children: string }) => <div data-lazy-md>{children}</div>,
}));
jest.mock("@/components/markdown-renderer", () => ({
  MarkdownRenderer: ({ children }: { children: string }) => <div data-md>{children}</div>,
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import {
  GuideLink,
  guideUnitOf,
  misconceptionGuideHref,
  topicGuideHref,
} from "@/app/student/assignment-view/guide-links";
import { SolutionBlock, solutionsNotice } from "@/app/student/assignment-view/solution-block";
import { TopicGuide } from "@/components/guide/topic-guide";
import { misconceptionAnchor, topicFromAnchor } from "@/lib/guides";
import type { UnitGuide } from "@/lib/guides/schema";
import { topicFixture } from "../tests/helpers/guide-fixture";

const html = (node: ReactNode) => renderToStaticMarkup(node);
const COURSE = "ap-physics-1";
const guide: UnitGuide = {
  curriculumId: COURSE,
  unit: 4,
  guides: [
    topicFixture("4.2", {
      misconceptions: [
        { wrong: "Untagged", right: "r" },
        { tag: "impulse-force-confusion", wrong: "First", right: "r" },
        { tag: "impulse-force-confusion", wrong: "Second", right: "r" },
      ],
    }),
  ],
};

describe("Study guide link", () => {
  test("a question on a topic whose unit has a guide links to that topic", () => {
    expect(topicGuideHref(COURSE, "4.2")).toBe("/student/courses/ap-physics-1/4#topic-4-2");
  });

  test.each([
    ["the assignment follows no course", undefined, "4.2"],
    ["the question has no topic", COURSE, undefined],
    ["the unit has no guide", COURSE, "1.1"],
    ["the course has no guides", "ap-physics-2", "4.2"],
    ["the topic is not a topic id", COURSE, "momentum"],
  ])("nothing when %s", (_name, curriculumId, apTopic) => {
    expect(topicGuideHref(curriculumId, apTopic)).toBeNull();
  });

  test("the unit comes from the topic id", () => {
    expect(guideUnitOf("12.3")).toBe(12);
    expect(guideUnitOf("4")).toBeNull();
    expect(guideUnitOf(4.2)).toBeNull();
  });

  test("opens in a new tab while the student is still working", () => {
    expect(
      html(
        <GuideLink href="/g" newTab>
          Study guide
        </GuideLink>,
      ),
    ).toContain('target="_blank"');
    expect(html(<GuideLink href="/g">Study guide</GuideLink>)).not.toContain("target=");
  });
});

describe("common-mistake link", () => {
  test("links to the guide's entry for the answer's tag", () => {
    const href = misconceptionGuideHref(
      COURSE,
      "4.2",
      ["sign-error", "impulse-force-confusion"],
      guide,
    );
    expect(href).toBe("/student/courses/ap-physics-1/4#topic-4-2-mistake-impulse-force-confusion");
    // The page opens the topic named by that anchor.
    expect(topicFromAnchor(href!.split("#")[1])).toBe("4.2");
  });

  test.each([
    ["no tag", []],
    ["tags the guide does not cover", ["sign-error"]],
    ["an ungraded answer (no tags at all)", undefined],
  ])("nothing for %s", (_name, tags) => {
    expect(misconceptionGuideHref(COURSE, "4.2", tags, guide)).toBeNull();
  });

  test("nothing without a course, a topic, the topic's guide, or before the guide has loaded", () => {
    const tags = ["impulse-force-confusion"];
    expect(misconceptionGuideHref(undefined, "4.2", tags, guide)).toBeNull();
    expect(misconceptionGuideHref(COURSE, undefined, tags, guide)).toBeNull();
    expect(misconceptionGuideHref(COURSE, "4.3", tags, guide)).toBeNull();
    expect(misconceptionGuideHref(COURSE, "4.2", tags, null)).toBeNull();
  });

  test("the guide marks the first entry of each tag as the place the link lands", () => {
    const out = html(<TopicGuide guide={guide.guides[0]} />);
    const id = misconceptionAnchor("4.2", "impulse-force-confusion");
    expect(out.split(`id="${id}"`)).toHaveLength(2);
    expect(out.indexOf(`id="${id}"`)).toBeLessThan(out.indexOf("First"));
    expect(out.indexOf(`id="${id}"`)).toBeGreaterThan(out.indexOf("Untagged"));
  });

  test("anchors that are not a topic's still open nothing", () => {
    expect(topicFromAnchor("#topic-4-2-mistake-")).toBeNull();
    expect(topicFromAnchor("#topic-4-2-other-x")).toBeNull();
    expect(topicFromAnchor("#topic-4-2")).toBe("4.2");
  });
});

describe("SolutionBlock", () => {
  test("shows the answer and the worked solution when the server returns one", () => {
    const out = html(
      <SolutionBlock
        score={10}
        points={10}
        solution={{ answer: "12 N", solution: "Use $F = ma$." }}
      />,
    );
    expect(out).toContain("Correct answer and explanation");
    expect(out).toContain("**Answer:** 12 N");
    expect(out).toContain("Use $F = ma$.");
    expect(out).toContain("data-lazy-md");
    expect(out).not.toContain("No explanation provided.");
  });

  test("without a worked solution it is the block as before", () => {
    // Full marks and no public answer: nothing.
    expect(html(<SolutionBlock score={10} points={10} />)).toBe("");
    expect(html(<SolutionBlock score={undefined} points={10} />)).toBe("");
    // A missed question with no public answer.
    expect(html(<SolutionBlock score={4} points={10} />)).toContain("No explanation provided.");
    // An older document whose question carries its answer.
    const old = html(<SolutionBlock score={10} points={10} correctAnswer="42" />);
    expect(old).toContain("42");
    expect(old).toContain("data-md");
    // An answer with no worked solution adds nothing new.
    expect(html(<SolutionBlock score={10} points={10} solution={{ answer: "42" }} />)).toBe("");
  });
});

describe("solutionsNotice", () => {
  test("says when worked solutions appear, only for assignments that have them", () => {
    expect(solutionsNotice(null)).toBeNull();
    expect(solutionsNotice({})).toBeNull();
    expect(solutionsNotice({ pending: "graded" })).toBe(
      "Worked solutions appear once your work is graded.",
    );
    expect(solutionsNotice({ pending: "due", availableAt: "2026-12-01T17:00:00.000Z" })).toMatch(
      /^Worked solutions appear after the due date, .*\d.*\.$/,
    );
    expect(solutionsNotice({ pending: "due", availableAt: "nonsense" })).toBe(
      "Worked solutions appear after the due date.",
    );
  });
});
