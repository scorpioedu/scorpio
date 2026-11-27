"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { inviteAuthPath, STUDY_HOME, studyNextPath } from "@/lib/onboarding-links";
import { register } from "@/lib/firebase";
import { InviteCelebration } from "@/components/invite-celebration";
import { AuthSplit } from "@/components/landing/auth-split";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { ClickIcon } from "@/components/ui/click-icon";
import { EyeIcon as AnimatedEye } from "@animateicons/react/lucide/eye-icon";
import { EyeOffIcon as AnimatedEyeOff } from "@animateicons/react/lucide/eye-off-icon";
import { GraduationCapIcon as AnimatedGraduationCap } from "@animateicons/react/lucide/graduation-cap-icon";
import { InfoIcon as AnimatedInfo } from "@animateicons/react/lucide/info-icon";
import { PresentationIcon as AnimatedPresentation } from "@animateicons/react/lucide/presentation-icon";
import { motion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { errorCode } from "@/lib/error-utils";

export default function SignupPage() {
  return (
    <Suspense fallback={<p className="p-8">Loading sign up…</p>}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const params = useSearchParams();
  const teacherInvite = params.get("teacherInvite") || "";
  const classInvite = params.get("classCode") || "";
  const studyNext = studyNextPath(params.get("next"));
  const signInPath = teacherInvite
    ? inviteAuthPath("login", "network", teacherInvite)
    : classInvite
      ? inviteAuthPath("login", "class", classInvite)
      : "/login";
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showAccessCode, setShowAccessCode] = useState(false);
  const [accessCode, setAccessCode] = useState(teacherInvite);
  const [classCode, setClassCode] = useState(classInvite);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const getPasswordStrength = (pass: string) => {
    if (!pass) return 0;
    let strength = 0;
    if (pass.length >= 6) strength += 1;
    if (pass.length >= 10) strength += 1;
    if (/[A-Z]/.test(pass)) strength += 1;
    if (/[0-9]/.test(pass)) strength += 1;
    if (/[^A-Za-z0-9]/.test(pass)) strength += 1;
    return strength;
  };

  const strength = getPasswordStrength(password);
  const strengthColor =
    strength <= 2 ? "bg-destructive" : strength <= 4 ? "bg-yellow-500" : "bg-green-500";
  const strengthText = strength <= 2 ? "Weak" : strength <= 4 ? "Medium" : "Strong";

  const handleSignup = async (role: "teacher" | "student") => {
    if (!name || !email || !password) {
      setError("Please fill in all fields");
      return;
    }

    // Validate teacher invite code server-side before creating the account
    if (role === "teacher") {
      if (!accessCode.trim()) {
        setError("A Teacher Invite Code is required");
        return;
      }
      setLoading(true);
      setError("");
      try {
        const validateRes = await fetch("/api/auth/teacher-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "validate", code: accessCode.trim() }),
        });

        // 1. Explicitly check for non-2xx HTTP responses
        if (!validateRes.ok) {
          // Attempt to parse JSON error message if the server provided one
          let serverErrorMsg = `Server error: ${validateRes.statusText}`;
          try {
            const errData = await validateRes.json();
            if (errData.error) serverErrorMsg = errData.error;
          } catch {
            // If it returns an HTML Error Page (common in Next.js 500s)
            serverErrorMsg = "Server encountered an error parsing your request. Please try again.";
          }
          setError(serverErrorMsg);
          setLoading(false);
          return;
        }

        const validateData = await validateRes.json();

        // 2. Safely check if the request was valid
        if (validateData.valid === false) {
          const messages: Record<string, string> = {
            "Code already used": "This invite code has already been used.",
            "Code expired": "This invite code has expired.",
            "Invalid code": "Invalid Teacher Invite Code. Please check for typos.",
          };
          setError(
            messages[validateData.reason] ?? validateData.reason ?? "Invalid Teacher Invite Code.",
          );
          setLoading(false);
          return;
        }
      } catch (err: unknown) {
        // 3. Catch actual network failures (e.g. ERR_CONNECTION_REFUSED)
        console.error("Invite code verification failed:", err);
        setError(
          "Network error: Could not reach the verification server. Please ensure your connection is stable.",
        );
        setLoading(false);
        return;
      }
    } else {
      setLoading(true);
      setError("");
    }

    try {
      const userCredential = await register(
        email,
        password,
        role,
        name,
        (role === "teacher" ? accessCode : classCode).trim(),
      );
      const idToken = await userCredential.user.getIdToken();

      const sessionResponse = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!sessionResponse.ok)
        throw new Error("Your account was created. Please sign in to continue.");

      router.refresh();
      // A student who joined no class has nothing on Home yet, so they start in Study (or the Study
      // page a link asked for).
      router.push(
        role === "teacher"
          ? "/teacher"
          : (studyNext ?? (classCode.trim() ? "/student" : STUDY_HOME)),
      );
    } catch (err: unknown) {
      console.error(err);
      if (errorCode(err) === "auth/email-already-in-use") {
        setError("Email is already in use");
      } else if (errorCode(err) === "auth/weak-password") {
        setError("Password should be at least 6 characters");
      } else {
        setError(
          err instanceof Error ? err.message : "Failed to create account. Please try again.",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthSplit side="left" wide>
      {(teacherInvite || classInvite) && (
        <InviteCelebration
          kind={teacherInvite ? "network" : "class"}
          code={teacherInvite || classInvite}
        />
      )}
      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="font-semibold text-4xl tracking-tight">Join Scorpio.</h1>
        <p className="mt-2 mb-8 text-sm text-muted-foreground">
          Create your account to get started.
        </p>
        <div>
          <TooltipProvider>
            <Tabs
              defaultValue={
                teacherInvite || params.get("role") === "teacher" ? "teacher" : "student"
              }
              className="w-full"
              onValueChange={() => setError("")}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="student" className="flex items-center gap-2 cursor-pointer">
                  <ClickIcon icon={AnimatedGraduationCap} className="h-4 w-4" />
                  Student
                </TabsTrigger>
                <TabsTrigger value="teacher" className="flex items-center gap-2 cursor-pointer">
                  <ClickIcon icon={AnimatedPresentation} className="h-4 w-4" />
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
                    <Label htmlFor="student-name">Full Name</Label>
                    <Input
                      id="student-name"
                      placeholder="John Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      aria-label="Full Name"
                      required
                    />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="space-y-2"
                  >
                    <Label htmlFor="student-email">Email</Label>
                    <Input
                      id="student-email"
                      type="email"
                      placeholder="student@school.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-label="Email"
                      required
                    />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-2"
                  >
                    <Label htmlFor="student-password">Password</Label>
                    <div className="relative">
                      <Input
                        id="student-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pr-10"
                        aria-label="Password"
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
                          <ClickIcon icon={AnimatedEyeOff} className="h-4 w-4" />
                        ) : (
                          <ClickIcon icon={AnimatedEye} className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {password && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="space-y-1"
                      >
                        <div className="flex h-1 w-full gap-1 overflow-hidden rounded-full bg-muted">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div
                              key={i}
                              className={`h-full flex-1 transition-colors duration-300 ${
                                i <= strength ? strengthColor : "bg-transparent"
                              }`}
                            />
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground text-right">
                          Strength: <span className="font-medium">{strengthText}</span>
                        </p>
                      </motion.div>
                    )}
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <Label htmlFor="student-code">Class Code (Optional)</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <ClickIcon
                            icon={AnimatedInfo}
                            className="h-3 w-3 text-muted-foreground cursor-help"
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">
                            Ask your teacher for a code to join their class.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      id="student-code"
                      placeholder="e.g. CLASS123"
                      value={classCode}
                      onChange={(e) => setClassCode(e.target.value)}
                      aria-label="Class Code"
                    />
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
                      onClick={() => handleSignup("student")}
                      disabled={loading}
                    >
                      {loading ? "Creating Account..." : "Sign up as Student"}
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
                    <Label htmlFor="teacher-name">Full Name</Label>
                    <Input
                      id="teacher-name"
                      placeholder="Dr. Smith"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      aria-label="Full Name"
                      required
                    />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="space-y-2"
                  >
                    <Label htmlFor="teacher-email">Email</Label>
                    <Input
                      id="teacher-email"
                      type="email"
                      placeholder="teacher@school.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-label="Email"
                      required
                    />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-2"
                  >
                    <Label htmlFor="teacher-password">Password</Label>
                    <div className="relative">
                      <Input
                        id="teacher-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pr-10"
                        aria-label="Password"
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
                          <ClickIcon icon={AnimatedEyeOff} className="h-4 w-4" />
                        ) : (
                          <ClickIcon icon={AnimatedEye} className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {password && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="space-y-1"
                      >
                        <div className="flex h-1 w-full gap-1 overflow-hidden rounded-full bg-muted">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div
                              key={i}
                              className={`h-full flex-1 transition-colors duration-300 ${
                                i <= strength ? strengthColor : "bg-transparent"
                              }`}
                            />
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground text-right">
                          Strength: <span className="font-medium">{strengthText}</span>
                        </p>
                      </motion.div>
                    )}
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Label htmlFor="teacher-code">Access Code</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <ClickIcon
                              icon={AnimatedInfo}
                              className="h-3 w-3 text-muted-foreground cursor-help"
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">
                              Enter the invite code sent to you. Don&apos;t have one? Request access
                              below.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Link
                        href="/request-access"
                        className="text-[11px] text-primary hover:underline font-medium shrink-0"
                      >
                        Request a code →
                      </Link>
                    </div>
                    <div className="relative">
                      <Input
                        id="teacher-code"
                        type={showAccessCode ? "text" : "password"}
                        placeholder="Required for teacher accounts"
                        value={accessCode}
                        onChange={(e) => setAccessCode(e.target.value)}
                        className="pr-10"
                        aria-label="Teacher Access Code"
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowAccessCode(!showAccessCode)}
                        className="absolute inset-y-0 right-0 text-muted-foreground"
                        aria-label={showAccessCode ? "Hide access code" : "Show access code"}
                      >
                        {showAccessCode ? (
                          <ClickIcon icon={AnimatedEyeOff} className="h-4 w-4" />
                        ) : (
                          <ClickIcon icon={AnimatedEye} className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Don&apos;t have a code?{" "}
                      <Link
                        href="/request-access"
                        className="text-primary hover:underline font-medium"
                      >
                        Request organization access
                      </Link>{" "}
                      — we&apos;ll review and send one within 1–2 business days.
                    </p>
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
                      onClick={() => handleSignup("teacher")}
                      disabled={loading}
                    >
                      {loading ? "Creating Account..." : "Sign up as Teacher"}
                    </Button>
                  </motion.div>
                </motion.div>
              </TabsContent>
            </Tabs>
          </TooltipProvider>

          <div className="mt-4 text-center text-sm">
            Already have an account?{" "}
            <Link href={signInPath} className="text-primary hover:underline">
              Sign in
            </Link>
          </div>
        </div>
      </motion.div>
    </AuthSplit>
  );
}
