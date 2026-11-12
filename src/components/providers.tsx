"use client";

import { AuthProvider } from "@/contexts/auth-context";
import { usePathname } from "next/navigation";
import { pathNeedsAuth } from "@/lib/auth-routes";
import { ThemeProvider } from "next-themes";
import { SpaceEffectsProvider } from "@/contexts/space-effects-context";
import { AppearanceProvider } from "@/contexts/appearance-context";
import { Toaster } from "sonner";
import { RouteProgressBar } from "@/components/route-progress-bar";
import { Suspense } from "react";
import { MotionConfig } from "framer-motion";

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const needsAuth = pathNeedsAuth(pathname);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <MotionConfig reducedMotion="user">
        <AppearanceProvider>
          <SpaceEffectsProvider>
            <Suspense fallback={null}>
              <RouteProgressBar />
            </Suspense>
            <AuthProvider needsAuth={needsAuth}>{children}</AuthProvider>
            <Toaster position="top-center" richColors />
          </SpaceEffectsProvider>
        </AppearanceProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
