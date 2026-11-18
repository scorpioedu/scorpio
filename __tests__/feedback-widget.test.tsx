import { renderToStaticMarkup } from "react-dom/server";

let mockUser: { uid: string } | null = { uid: "u1" };
let mockPath = "/teacher";
jest.mock("next/navigation", () => ({ usePathname: () => mockPath }));
jest.mock("@/contexts/auth-context", () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock("@/lib/authenticated-fetch", () => ({ authenticatedFetch: jest.fn() }));

import { FeedbackWidget } from "@/components/feedback-widget";

describe("FeedbackWidget", () => {
  beforeEach(() => {
    mockUser = { uid: "u1" };
    mockPath = "/teacher";
  });
  test("renders a labelled Feedback button when signed in on an app page", () => {
    const html = renderToStaticMarkup(<FeedbackWidget />);
    expect(html).toContain("Feedback");
    expect(html).toContain("<button");
  });
  test("renders nothing when signed out", () => {
    mockUser = null;
    expect(renderToStaticMarkup(<FeedbackWidget />)).toBe("");
  });
  test("renders nothing on public pages", () => {
    mockPath = "/pricing";
    expect(renderToStaticMarkup(<FeedbackWidget />)).toBe("");
  });
});
