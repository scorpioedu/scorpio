import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "./button";
import { Badge } from "./badge";

describe("Button / Badge destructive variants (RT-32 M-005)", () => {
  it("renders the destructive button on the AA-compliant solid token", () => {
    const html = renderToStaticMarkup(<Button variant="destructive">Delete</Button>);
    expect(html).toContain("bg-destructive-solid");
  });

  it("does not apply the 60% alpha fill that lowered dark-mode contrast", () => {
    const html = renderToStaticMarkup(<Button variant="destructive">Delete</Button>);
    expect(html).not.toContain("dark:bg-destructive/60");
  });

  it("renders the destructive badge on the solid token", () => {
    const html = renderToStaticMarkup(<Badge variant="destructive">Late</Badge>);
    expect(html).toContain("bg-destructive-solid");
  });

  it("renders a real button element with an accessible name when labelled", () => {
    const html = renderToStaticMarkup(
      <Button size="icon" aria-label="Close panel">
        x
      </Button>
    );
    expect(html).toMatch(/^<button[^>]*aria-label="Close panel"/);
  });
});
