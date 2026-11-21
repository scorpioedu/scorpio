// Re-mounted on every page change, so each page fades in (see .page-enter in globals.css).
// A flex column so full-screen pages (assignment view, Raise) still fill the height.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter flex min-h-0 flex-1 flex-col">{children}</div>;
}
