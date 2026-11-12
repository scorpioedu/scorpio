/**
 * RT-23 / H-013. The jest environment is "node" and no DOM/testing-library is
 * installed (no new dependencies), so boundaries are verified by (a) rendering to
 * static markup with react-dom/server and (b) resolving the element tree (with
 * useEffect run inline) to find the button's onClick and invoke it.
 */
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useEffect: (fn: () => void) => {
    fn();
  },
}));

import RootError from "@/app/error";
import GlobalError from "@/app/global-error";
import StudentError from "@/app/student/error";
import TeacherError from "@/app/teacher/error";
import StudentLoading from "@/app/student/loading";
import TeacherLoading from "@/app/teacher/loading";

const makeError = () =>
  Object.assign(new Error("boom: student jane@example.com uid=abc123"), { digest: "digest-42" });

type Props = { onClick?: () => void; children?: ReactNode };

/** Expands function components until an element with onClick is found. */
function findOnClick(node: ReactNode): (() => void) | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findOnClick(child);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement(node)) return undefined;
  const el = node as ReactElement<Props>;
  if (typeof el.props.onClick === "function") return el.props.onClick;
  if (typeof el.type === "function") {
    const render = el.type as (p: Props) => ReactNode;
    return findOnClick(render(el.props));
  }
  return findOnClick(el.props.children);
}

const errorBoundaries = [
  ["app/error", RootError],
  ["student/error", StudentError],
  ["teacher/error", TeacherError],
  ["app/global-error", GlobalError],
] as const;

describe.each(errorBoundaries)("%s", (_name, Boundary) => {
  let spy: jest.SpyInstance;
  beforeEach(() => {
    spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => spy.mockRestore());

  it("renders a friendly message without leaking error details", () => {
    const html = renderToStaticMarkup(<Boundary error={makeError()} reset={() => undefined} />);
    expect(html).toContain("Something went wrong");
    expect(html).toContain("Try again");
    expect(html).not.toContain("jane@example.com");
    expect(html).not.toContain("abc123");
  });

  it("calls reset when the retry button is clicked", () => {
    const reset = jest.fn();
    const onClick = findOnClick(<Boundary error={makeError()} reset={reset} />);
    expect(onClick).toBeDefined();
    onClick?.();
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("logs only the digest, never the message", () => {
    renderToStaticMarkup(<Boundary error={makeError()} reset={() => undefined} />);
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain("digest-42");
    expect(logged).not.toContain("jane@example.com");
  });
});

describe("global-error", () => {
  it("renders its own html and body", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const html = renderToStaticMarkup(<GlobalError error={makeError()} reset={() => undefined} />);
    spy.mockRestore();
    expect(html.startsWith("<html")).toBe(true);
    expect(html).toContain("<body");
  });
});

describe.each([
  ["student/loading", StudentLoading],
  ["teacher/loading", TeacherLoading],
])("%s", (_name, Loading) => {
  it("renders an accessible skeleton", () => {
    const html = renderToStaticMarkup(<Loading />);
    expect(html).toContain('role="status"');
    expect(html).toContain('data-slot="skeleton"');
  });
});
