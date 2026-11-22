/**
 * The "Check this answer" badge in the questions editor. The jest environment has no DOM (see
 * topic-guide.test.tsx), so the editor is rendered to static markup; what a press changes is
 * covered through the flag store in assignment-editor.test.ts.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@/components/math-input", () => ({
  MathInputField: ({ value }: { value: string }) => <textarea defaultValue={value} />,
}));
jest.mock("@/lib/authenticated-fetch", () => ({ authenticatedFetch: jest.fn() }));
jest.mock("sonner", () => ({ toast: { error: jest.fn() } }));

import { QuestionsEditor } from "@/components/teacher/assignment-editor/questions-editor";
import { AnswerCheckBadge } from "@/components/teacher/assignment-editor/answer-check-badge";
import {
  clearAnswerChecks,
  dismissAnswerCheck,
  flagAnswerChecks,
} from "@/components/teacher/assignment-editor/answer-checks";
import {
  fromGenerated,
  summarisePoints,
  type Question,
} from "@/components/teacher/assignment-editor/types";

const html = (node: ReactNode) => renderToStaticMarkup(node);
const editor = (questions: Question[]) =>
  html(
    <QuestionsEditor
      questions={questions}
      setQuestions={() => undefined}
      summary={summarisePoints(questions, 100, false)}
      assignmentPoints={100}
      customPoints={false}
      setCustomPoints={() => undefined}
      rubricTopic="Momentum"
    />,
  );

const generated = [
  {
    text: "Flagged question",
    type: "multiple-choice",
    options: ["x", "y"],
    correctAnswer: "x",
    answerCheck: "disagrees",
    checkedAnswer: "y",
  },
  { text: "Agreed question", type: "short-answer", correctAnswer: "5 N", answerCheck: "agrees" },
  { text: "Third question", type: "short-answer", correctAnswer: "7 N", answerCheck: "unchecked" },
];

beforeEach(() => clearAnswerChecks());

test("a question the second solve disagreed with shows the badge and that solve's answer", () => {
  const questions = generated.map(fromGenerated);
  flagAnswerChecks(generated, questions);
  const out = editor(questions);
  expect(out.match(/Check this answer/g)).toHaveLength(1);
  expect(out).toContain("A second solve got: y");
  expect(out).toContain("Dismiss the answer check on question 1");
});

test("agreed and unchecked questions show nothing", () => {
  const questions = generated.slice(1).map(fromGenerated);
  flagAnswerChecks(generated.slice(1), questions);
  const out = editor(questions);
  expect(out).not.toContain("Check this answer");
  expect(out).not.toMatch(/unchecked|second solve|role="status" class="flex/i);
});

test("the badge goes once the answer is edited or the flag is dismissed", () => {
  const questions = generated.map(fromGenerated);
  flagAnswerChecks(generated, questions);
  expect(editor([{ ...questions[0], correctAnswer: "y" }, ...questions.slice(1)])).not.toContain(
    "Check this answer",
  );
  dismissAnswerCheck(questions[0].id);
  expect(editor(questions)).not.toContain("Check this answer");
});

test("the badge has a fallback line and keeps a long answer short", () => {
  expect(
    html(
      <AnswerCheckBadge
        flag={{ key: "x", checkedAnswer: "" }}
        questionNumber={2}
        onDismiss={() => undefined}
      />,
    ),
  ).toContain("A second solve got a different answer.");
  const long = html(
    <AnswerCheckBadge
      flag={{ key: "x", checkedAnswer: "z".repeat(400) }}
      questionNumber={2}
      onDismiss={() => undefined}
    />,
  );
  expect(long).toContain("z".repeat(160));
  expect(long).not.toContain("z".repeat(161));
});
