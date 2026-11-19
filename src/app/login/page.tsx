"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { classInvitePath, inviteAuthPath, networkInvitePath } from "@/lib/onboarding-links";
import { login, logout } from "@/lib/firebase";
import { useAuth } from "@/contexts/auth-context";
import { AuthSplit } from "@/components/landing/auth-split";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { GraduationCap, Presentation, Eye, EyeOff } from "lucide-react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/error-utils";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginForm />
    </Suspense>
  );
}

/**
 * Server-rendered placeholder shown until `useSearchParams` can resolve on the client.
 * It carries the real heading, so the LCP text is in the first HTML instead of a spinner. (I-020)
 */
function LoginShell() {
  return (
    <AuthSplit>
      <h1 className="font-semibold text-4xl tracking-tight">Welcome back.</h1>
      <p className="mt-2 text-sm text-muted-foreground">Sign in to Scorpio</p>
      {/* min-h matches the real form so swapping it in does not shift the layout */}
      <div className="mt-8 min-h-[300px] space-y-4" aria-busy="true">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    </AuthSplit>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const teacherInvite = params.get("teacherInvite") || "";
  const classCode = params.get("classCode") || "";
  const signUpPath = teacherInvite
    ? inviteAuthPath("signup", "network", teacherInvite)
    : classCode
      ? inviteAuthPath("signup", "class", classCode)
      : "/signup";
  const { user, role, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryRole, setRecoveryRole] = useState<"student" | "teacher">("student");
  const [recoveryAccessCode, setRecoveryAccessCode] = useState("");
  const [isRecovering] = useState(false);

  // An empty field falls back to the signed-in account's email.
  const recoveryEmailValue = recoveryEmail || user?.email || "";

  const handleLogin = async (role: "teacher" | "student") => {
    console.log(`[Login] Starting login for role: ${role}`);
    setLoading(true);
    setError("");

    try {
      console.log(`[Login] Attempting Firebase Auth sign-in...`);
      const userCredential = await login(email, password);
      console.log(`[Login] Firebase Auth success. Fetching ID token...`);
      const idToken = await userCredential.user.getIdToken();

      console.log(`[Login] ID Token received. Calling session API...`);
      // Set session cookie
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, role }),
      });

      console.log(`[Login] Session API response status: ${response.status}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to create session");
      }

      console.log(`[Login] Redirecting to: ${role === "teacher" ? "/teacher" : "/student"}`);
      // Hard redirect is safer for ensuring middleware catches the new session
      const sessionData = await response.json();
      const target =
        sessionData.role === "teacher"
          ? teacherInvite
            ? networkInvitePath(teacherInvite)
            : "/teacher"
          : classCode
            ? classInvitePath(classCode)
            : "/student";
      window.location.href = target;
    } catch (err: unknown) {
      console.error("[Login] Detailed Error:", err);
      const message = errorMessage(err);
      // The password was right but the profile is unfinished: the Account Recovery screen that
      // appears says what to do, so don't also claim the password was wrong.
      if (message === "Complete registration first") setError("");
      else
        setError(
          message === "Failed to create session"
            ? "Session creation failed. Please try again."
            : "Invalid email or password",
        );
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const handleRecovery = async () => {
    if (!recoveryEmailValue) {
      setError("Please enter your email");
      return;
    }

    setError(
      "For account recovery, contact rushil@scorpioedu.org. Roles cannot be restored from this browser.",
    );
  };
  if (user && role === null) {
    return (
      <AuthSplit>
        <div>
          <h1 className="font-semibold text-3xl tracking-tight">Account recovery</h1>
          <p className="mt-2 mb-6 text-sm text-muted-foreground">
            Profile setup was interrupted. Complete it now to continue.
          </p>
          <div className="space-y-4">
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-md mb-4"
              >
                {error}
              </motion.div>
            )}

            <div className="space-y-2">
              <Label htmlFor="rec-email" className="text-sm font-medium">
                Account Email
              </Label>
              <Input
                id="rec-email"
                type="email"
                placeholder="Enter your email"
                value={recoveryEmailValue}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium">Account Role</Label>
              <Tabs
                defaultValue="student"
                onValueChange={(v) => setRecoveryRole(v as "student" | "teacher")}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-2 bg-muted/30 p-1">
                  <TabsTrigger value="student" className="flex items-center gap-2 cursor-pointer">
                    <GraduationCap className="h-4 w-4" />
                    Student
                  </TabsTrigger>
                  <TabsTrigger value="teacher" className="flex items-center gap-2 cursor-pointer">
                    <Presentation className="h-4 w-4" />
                    Teacher
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {recoveryRole === "teacher" && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-2 pt-2"
              >
                <Label htmlFor="rec-code" className="text-sm font-medium">
                  Teacher Access Code
                </Label>
                <Input
                  id="rec-code"
                  type="password"
                  placeholder="Enter required access code"
                  value={recoveryAccessCode}
                  onChange={(e) => setRecoveryAccessCode(e.target.value)}
                  disabled={loading}
                />
              </motion.div>
            )}

            <div className="pt-4 flex flex-col gap-3">
              <Button
                className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleRecovery}
                disabled={loading}
              >
                {loading && isRecovering ? "Setting up profile..." : "Finalize Profile"}
              </Button>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground hover:text-foreground transition-colors py-2 h-auto"
                onClick={handleLogout}
                disabled={loading}
              >
                Sign Out & Start Over
              </Button>
            </div>
          </div>
        </div>
      </AuthSplit>
    );
  }

  return (
    <AuthSplit>
      <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }}>
        <div>
          <h1 className="font-semibold text-4xl tracking-tight">Welcome back.</h1>
          <p className="mt-2 mb-8 text-sm text-muted-foreground">Sign in to Scorpio to pick up where you left off.</p>
          <div>
            <Tabs defaultValue={teacherInvite ? "teacher" : "student"} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="student" className="flex items-center gap-2 cursor-pointer">
                  <GraduationCap className="h-4 w-4" />
                  Student
                </TabsTrigger>
                <TabsTrigger value="teacher" className="flex items-center gap-2 cursor-pointer">
                  <Presentation className="h-4 w-4" />
                  Teacher
                </TabsTrigger>
              </TabsList>

              <TabsContent value="student" className="mt-4">
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-4"
                >
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-2"
                  >
                    <Label htmlFor="student-email">Email</Label>
                    <Input
                      id="student-email"
                      type="email"
                      placeholder="student@school.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-label="Student Email"
                      required
                    />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <Label htmlFor="student-password">Password</Label>
                      <Link
                        href="/forgot-password"
                        className="text-xs text-primary hover:underline"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <div className="relative">
                      <Input
                        id="student-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pr-10"
                        aria-label="Student Password"
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 text-muted-foreground"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </motion.div>
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-sm font-medium text-destructive bg-destructive/10 p-2 rounded-md border border-destructive/20"
                    >
                      {error}
                    </motion.p>
                  )}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <Button
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => handleLogin("student")}
                      disabled={loading || authLoading}
                    >
                      {loading
                        ? "Signing in..."
                        : authLoading
                          ? "Preparing..."
                          : "Sign in as Student"}
                    </Button>
                  </motion.div>
                </motion.div>
              </TabsContent>

              <TabsContent value="teacher" className="mt-4">
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-4"
                >
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-2"
                  >
                    <Label htmlFor="teacher-email">Email</Label>
                    <Input
                      id="teacher-email"
                      type="email"
                      placeholder="teacher@school.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-label="Teacher Email"
                      required
                    />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <Label htmlFor="teacher-password">Password</Label>
                      <Link
                        href="/forgot-password"
                        className="text-xs text-primary hover:underline"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <div className="relative">
                      <Input
                        id="teacher-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pr-10"
                        aria-label="Teacher Password"
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 text-muted-foreground"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </motion.div>
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-sm font-medium text-destructive bg-destructive/10 p-2 rounded-md border border-destructive/20"
                    >
                      {error}
                    </motion.p>
                  )}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <Button
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => handleLogin("teacher")}
                      disabled={loading || authLoading}
                    >
                      {loading
                        ? "Signing in..."
                        : authLoading
                          ? "Preparing..."
                          : "Sign in as Teacher"}
                    </Button>
                  </motion.div>
                </motion.div>
              </TabsContent>
            </Tabs>

            <div className="mt-4 text-center text-sm">
              Don&apos;t have an account?{" "}
              <Link href={signUpPath} className="text-primary hover:underline">
                Sign up
              </Link>
            </div>
          </div>
        </div>
      </motion.div>
    </AuthSplit>
  );
}
