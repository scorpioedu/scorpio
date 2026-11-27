"use client";

import { ProtectedRoute } from "@/components/protected-route";
import { StudentSidebar } from "@/components/student-sidebar";
import dynamic from "next/dynamic";
import { useSidebarState } from "@/hooks/use-sidebar-state";
import { usePathname } from "next/navigation";
import { StudentAiProvider } from "@/contexts/student-ai-context";

// Client-only floating widget; keep it (and its chat dependencies) out of the layout's initial JS. (I-018)
const NavigationChatbot = dynamic(
  () => import("@/components/navigation-chatbot").then((m) => m.NavigationChatbot),
  { ssr: false },
);

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { isCollapsed, setIsCollapsed } = useSidebarState("student");
  const pathname = usePathname();

  const isAssignmentView = pathname?.includes("assignment-view");
  const isTutor = pathname?.includes("/student/tutor");
  // A unit guide is a reader with its own contents sidebar, so the site sidebar steps aside.
  const isGuideReader = pathname?.startsWith("/student/courses/");
  const isFullScreen = isAssignmentView || isTutor || isGuideReader;

  return (
    <ProtectedRoute allowedRole="student">
      <StudentAiProvider>
        <div className="flex h-dvh flex-col overflow-hidden bg-background md:flex-row">
          {!isFullScreen && (
            <StudentSidebar
              isCollapsed={isCollapsed}
              onToggle={() => setIsCollapsed(!isCollapsed)}
            />
          )}
          {/* `relative`: content that is positioned absolutely (the screen-reader copy KaTeX keeps of
            every formula, sr-only labels) must scroll with this pane. Without it those pieces are laid
            out against the page, which then grows as tall as the content and scrolls too: a second
            scrollbar, and a page that can be scrolled past its end. */}
          <main
            className={`relative flex min-h-0 min-w-0 flex-1 flex-col ${isFullScreen ? "overflow-hidden" : "overflow-auto"}`}
          >
            {isFullScreen ? (
              children
            ) : (
              <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-2 sm:px-6 md:pt-8 lg:px-8">
                {children}
              </div>
            )}
          </main>
          {!isFullScreen && <NavigationChatbot userRole="student" />}
        </div>
      </StudentAiProvider>
    </ProtectedRoute>
  );
}
