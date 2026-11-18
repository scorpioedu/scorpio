"use client";

import { useState } from "react";
import Link from "next/link";
import { useAdminAccess } from "@/lib/use-admin-access";
import { logout } from "@/lib/firebase";
import { SpaceBackground } from "@/components/ui/space-background";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AccessRequests } from "@/components/admin/access-requests";
import { TeacherInviteCodes } from "@/components/admin/teacher-invite-codes";
import { FirestoreExplorer } from "@/components/admin/firestore-explorer";
import { GlobalAnalytics } from "@/components/admin/global-analytics";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ShieldCheck, Lock, Database, BarChart3, BookCheck, MessageSquarePlus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function AdminPage() {
  const access = useAdminAccess();
  const [activeTab, setActiveTab] = useState<"access" | "database" | "analytics">("access");

  if (access !== "admin") {
    const message =
      access === "loading"
        ? "Checking your account…"
        : access === "signed-out"
          ? "Sign in with an administrator account to continue."
          : "This account does not have administrator access.";
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative">
        <SpaceBackground />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm"
        >
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-3">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <ShieldCheck className="h-6 w-6 text-primary" />
                </div>
              </div>
              <CardTitle className="text-xl">Admin Access</CardTitle>
              <CardDescription>{message}</CardDescription>
            </CardHeader>
            {access === "signed-out" && (
              <CardContent>
                <Button className="w-full" asChild>
                  <Link href="/login">Sign in</Link>
                </Button>
              </CardContent>
            )}
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full relative flex flex-col md:flex-row bg-background">
      <SpaceBackground />

      {/* Sidebar */}
      <motion.aside
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="w-full md:w-64 border-b md:border-b-0 md:border-r border-border/40 relative z-20 bg-background/60 backdrop-blur-xl flex flex-col h-auto md:h-screen sticky top-0"
      >
        <div className="p-6 flex items-center gap-3 border-b border-border/40">
          <Logo size={24} className="text-foreground" />
          <div>
            <h1 className="text-lg font-bold leading-tight">Admin</h1>
            <p className="text-xs text-muted-foreground">Scorpio Platform</p>
          </div>
        </div>

        <nav className="p-4 space-y-2 flex-1 overflow-y-auto">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">
            Modules
          </div>
          <Button
            variant={activeTab === "access" ? "secondary" : "ghost"}
            className="w-full justify-start font-medium"
            onClick={() => setActiveTab("access")}
          >
            <Lock className="mr-2 h-4 w-4" />
            Access & Security
          </Button>
          <Button
            variant={activeTab === "analytics" ? "secondary" : "ghost"}
            className="w-full justify-start font-medium"
            onClick={() => setActiveTab("analytics")}
          >
            <BarChart3 className="mr-2 h-4 w-4" />
            Analytics & Insights
          </Button>
          <Button
            variant={activeTab === "database" ? "secondary" : "ghost"}
            className="w-full justify-start font-medium"
            onClick={() => setActiveTab("database")}
          >
            <Database className="mr-2 h-4 w-4" />
            Database Explorer
          </Button>
          <Button variant="ghost" className="w-full justify-start font-medium" asChild>
            <Link href="/admin/content">
              <BookCheck className="mr-2 h-4 w-4" />
              Content Review
            </Link>
          </Button>
          <Button variant="ghost" className="w-full justify-start font-medium" asChild>
            <Link href="/admin/feedback">
              <MessageSquarePlus className="mr-2 h-4 w-4" />
              Feedback
            </Link>
          </Button>
        </nav>

        <div className="p-4 border-t border-border/40 mt-auto">
          <Button
            variant="outline"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={() => {
              void logout();
            }}
          >
            Log Out
          </Button>
        </div>
      </motion.aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 relative z-10 p-6 md:p-10 h-[calc(100vh-80px)] md:h-screen overflow-y-auto">
        <TooltipProvider>
          <AnimatePresence mode="wait">
            {activeTab === "access" && (
              <motion.div
                key="access"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="max-w-4xl mx-auto space-y-8"
              >
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Access & Security</h2>
                  <p className="text-muted-foreground">
                    Manage waitlist access requests and teacher invite codes.
                  </p>
                </div>

                <AccessRequests />
                <TeacherInviteCodes />
              </motion.div>
            )}

            {activeTab === "analytics" && (
              <motion.div
                key="analytics"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="max-w-6xl mx-auto space-y-8"
              >
                <GlobalAnalytics />
              </motion.div>
            )}

            {activeTab === "database" && (
              <motion.div
                key="database"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="max-w-6xl mx-auto h-[80vh] flex flex-col space-y-4"
              >
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Database Explorer</h2>
                  <p className="text-muted-foreground">
                    Query read-only platform data directly from Firestore.
                  </p>
                </div>

                <div className="flex-1 min-h-0">
                  <FirestoreExplorer />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </TooltipProvider>
      </main>
    </div>
  );
}
