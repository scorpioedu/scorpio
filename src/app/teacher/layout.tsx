"use client";

import { ProtectedRoute } from "@/components/protected-route";
import { TeacherSidebar } from "@/components/teacher-sidebar";
import { SpaceBackground } from "@/components/ui/space-background";
import dynamic from "next/dynamic";
import { useSidebarState } from "@/hooks/use-sidebar-state";
import { PageTransition } from "@/components/page-transition";
import { DepartmentBanner } from "@/components/department-banner";
import { SelectedClassProvider } from "@/contexts/selected-class-context";
import { usePathname } from "next/navigation";

// Client-only floating widget; keep it (and its chat dependencies) out of the layout's initial JS. (I-018)
const NavigationChatbot = dynamic(
  () => import("@/components/navigation-chatbot").then((m) => m.NavigationChatbot),
  { ssr: false },
);

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { isCollapsed, setIsCollapsed } = useSidebarState("teacher");
  // Get started (/teacher/welcome) is a focused setup flow: no sidebar, banner or help chat to wander
  // off into. The page has its own "Skip for now" and "Go to Home" exits.
  const onboarding = usePathname()?.startsWith("/teacher/welcome") ?? false;

  return (
    <ProtectedRoute allowedRole="teacher">
      <SelectedClassProvider>
        <SpaceBackground />
        <div className="flex h-dvh flex-col md:flex-row">
          {!onboarding && <TeacherSidebar isCollapsed={isCollapsed} onToggle={() => setIsCollapsed(!isCollapsed)} />}
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-background/50">
            {!onboarding && <DepartmentBanner />}
            <div className="w-full px-4 pb-24 sm:px-6 md:px-8 md:pt-8">
              <div className="max-w-7xl mx-auto">
                <PageTransition>{children}</PageTransition>
              </div>
            </div>
          </main>
          {!onboarding && <NavigationChatbot userRole="teacher" />}
        </div>
      </SelectedClassProvider>
    </ProtectedRoute>
  );
}
