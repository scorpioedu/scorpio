// Every email template renders, in HTML and plain text, with its preview data and with the bare
// minimum. Set EMAIL_PREVIEW_DIR=<folder> to also write each one out as an .html file to look at.
import * as fs from "fs";
import * as path from "path";
import * as React from "react";
// The copies functions/ uses, so the templates render with the same React they are built with.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { renderToStaticMarkup } = require("../functions/node_modules/react-dom/server") as typeof import("react-dom/server");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { convert } = require("../functions/node_modules/html-to-text") as {
  convert: (html: string, options?: object) => string;
};
import { AssignmentCreatedEmail } from "../functions/src/templates/AssignmentCreatedEmail";
import { ResultsReadyEmail } from "../functions/src/templates/ResultsReadyEmail";
import { TeacherNoticeEmail } from "../functions/src/templates/TeacherNoticeEmail";
import { TeacherDigestEmail } from "../functions/src/templates/TeacherDigestEmail";

// @react-email's render() loads react-dom with a dynamic import, which jest does not allow; these
// do the same work synchronously.
async function render(element: React.ReactElement, options?: { plainText?: boolean }) {
  const html = "<!DOCTYPE html>" + renderToStaticMarkup(element);
  return options?.plainText ? convert(html, { selectors: [{ selector: "img", format: "skip" }] }) : html;
}

type Template = React.FC<object> & { PreviewProps: object };
const cases: Array<[string, Template, object]> = [
  ["assignment-new", AssignmentCreatedEmail as unknown as Template, AssignmentCreatedEmail.PreviewProps],
  [
    "assignment-reminder",
    AssignmentCreatedEmail as unknown as Template,
    { ...AssignmentCreatedEmail.PreviewProps, kind: "reminder", dueDay: "tomorrow" },
  ],
  [
    "assignment-new-minimal",
    AssignmentCreatedEmail as unknown as Template,
    { firstName: "", assignmentTitle: "Homework", link: "https://scorpioedu.org/x" },
  ],
  ["results-ready", ResultsReadyEmail as unknown as Template, ResultsReadyEmail.PreviewProps],
  [
    "results-ready-percent-only",
    ResultsReadyEmail as unknown as Template,
    { firstName: "", assignmentTitle: "Homework", earned: null, total: null, percent: 72.5, link: "https://scorpioedu.org/x" },
  ],
  ["teacher-notice", TeacherNoticeEmail as unknown as Template, TeacherNoticeEmail.PreviewProps],
  ["teacher-digest", TeacherDigestEmail as unknown as Template, TeacherDigestEmail.PreviewProps],
];

const outDir = process.env.EMAIL_PREVIEW_DIR;

describe.each(cases)("%s email", (name, Component, props) => {
  const element = React.createElement(Component, props);

  test("renders HTML with the shared layout, logo and no leftover old branding", async () => {
    const html = await render(element);
    expect(html).toContain("https://scorpioedu.org/email/logo-dark.png");
    expect(html).toContain('name="color-scheme" content="dark"');
    expect(html).not.toMatch(/Mission Control|Research-Grade|Authentic Student Intelligence/i);
    if (outDir) {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, `${name}.html`), html);
    }
  });

  test("renders a plain-text version", async () => {
    const text = await render(element, { plainText: true });
    expect(text.length).toBeGreaterThan(40);
    expect(text).not.toContain("<");
  });
});

describe("assignment email wording", () => {
  test("a reminder says it is due and has not been turned in", async () => {
    const text = await render(
      React.createElement(AssignmentCreatedEmail, {
        ...AssignmentCreatedEmail.PreviewProps,
        kind: "reminder",
        dueDay: "today",
      }),
      { plainText: true },
    );
    expect(text).toContain("is due today");
    expect(text).toContain("haven't turned this in");
  });

  test("a score with points shows earned / total", async () => {
    const text = await render(React.createElement(ResultsReadyEmail, ResultsReadyEmail.PreviewProps), {
      plainText: true,
    });
    expect(text).toContain("86");
    expect(text).toContain("/ 100");
  });
});
