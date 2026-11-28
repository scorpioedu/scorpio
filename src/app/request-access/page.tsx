"use client";

import { useState, useSyncExternalStore } from "react";
import { AuthSplit } from "@/components/landing/auth-split";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { CheckCircle2, Building2, Mail, User, Briefcase, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";

const ROLES = [
  { value: "high_school_teacher", label: "Physics teacher" },
  { value: "department_head", label: "Science department head" },
  { value: "other_teacher", label: "Other teacher" },
  { value: "dean", label: "School administrator" },
  { value: "other", label: "Other" },
];

const COURSES = [
  "AP Physics 1",
  "AP Physics 2",
  "AP Physics C: Mechanics",
  "AP Physics C: E&M",
  "Other physics",
];

const noSubscribe = () => () => {};

export default function RequestAccessPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [institution, setInstitution] = useState("");
  const [role, setRole] = useState("");
  const [courses, setCourses] = useState<string[]>([]);
  // "Apply for a pilot" links here with ?pilot=1. Read on the client only so the page stays static;
  // the visitor's own tick or untick wins over the link.
  const pilotFromLink = useSyncExternalStore(
    noSubscribe,
    () => new URLSearchParams(window.location.search).get("pilot") === "1",
    () => false,
  );
  const [pilotChoice, setPilotChoice] = useState<boolean | null>(null);
  const pilotInterest = pilotChoice ?? pilotFromLink;
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const toggleCourse = (course: string, on: boolean) =>
    setCourses((prev) => (on ? [...prev, course] : prev.filter((c) => c !== course)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!name || !email || !institution || !role) {
      setError("Please fill in your name, school email, school and role.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    setError("");

    let res: Response;
    try {
      res = await fetch("/api/auth/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          institution,
          role,
          message,
          courses,
          pilotInterest,
          // From a colleague's invite link; read here, not during render, so the page stays static.
          ref: new URLSearchParams(window.location.search).get("ref") || undefined,
        }),
      });
    } catch {
      setError("Unable to reach the server. Please check your internet connection and try again.");
      setLoading(false);
      return;
    }

    try {
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      // Server returned a non-JSON response (e.g. a crash page)
      setError(
        res.ok
          ? "Unexpected server response. Please try again."
          : `Server error (${res.status}). Please try again later.`,
      );
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <AuthSplit wide>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <CheckCircle2 className="mb-5 h-9 w-9 text-primary" />
          <h1 className="text-4xl font-semibold tracking-tight">Request received.</h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Thank you, <span className="font-medium text-foreground">{name}</span>. We read every
            request ourselves and will email an access code to{" "}
            <span className="font-medium text-foreground">{email}</span> within 1–2 business days.
            We&apos;ve sent you a confirmation now; if it isn&apos;t there in a few minutes, check
            your spam folder.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            While you wait, the lessons and practice for every AP Physics unit are free to look
            through.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild className="h-11 sm:flex-1">
              <Link href="/lessons">Browse the free lessons</Link>
            </Button>
            <Button asChild variant="outline" className="h-11 sm:flex-1">
              <Link href="/">Return home</Link>
            </Button>
          </div>
        </motion.div>
      </AuthSplit>
    );
  }

  return (
    <AuthSplit wide>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-8">
          <h1 className="text-4xl font-semibold tracking-tight">Request teacher access.</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Scorpio is free for teachers. Tell us who you are and we&apos;ll email you an access
            code within 1–2 business days. Students don&apos;t need one: they join with their
            teacher&apos;s class code.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="space-y-2.5"
            >
              <Label
                htmlFor="req-name"
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground"
              >
                <User className="h-3.5 w-3.5" />
                Full name
              </Label>
              <Input
                id="req-name"
                autoComplete="name"
                placeholder="Alex Rivera"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-11"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="space-y-2.5"
            >
              <Label
                htmlFor="req-email"
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground"
              >
                <Mail className="h-3.5 w-3.5" />
                School email
              </Label>
              <Input
                id="req-email"
                type="email"
                autoComplete="email"
                placeholder="arivera@yourschool.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
              />
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-2.5">
                <Label
                  htmlFor="req-institution"
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  School
                </Label>
                <Input
                  id="req-institution"
                  autoComplete="organization"
                  placeholder="Your school's name"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  required
                  className="h-11"
                />
              </div>

              <div className="space-y-2.5">
                <Label
                  htmlFor="req-role"
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground"
                >
                  <Briefcase className="h-3.5 w-3.5" />
                  Role
                </Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger id="req-role" className="h-11 w-full">
                    <SelectValue placeholder="Select your role…" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value} className="cursor-pointer">
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <fieldset className="space-y-3">
              <legend className="mb-3 text-sm font-medium text-muted-foreground">
                Courses you teach{" "}
                <span className="font-normal text-muted-foreground/70">(optional)</span>
              </legend>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {COURSES.map((course) => {
                  const id = `req-course-${course.replace(/\W+/g, "-").toLowerCase()}`;
                  return (
                    <div key={course} className="flex items-center gap-2.5">
                      <Checkbox
                        id={id}
                        checked={courses.includes(course)}
                        onCheckedChange={(v) => toggleCourse(course, v === true)}
                      />
                      <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
                        {course}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex items-start gap-2.5 rounded-lg border border-border p-3.5">
              <Checkbox
                id="req-pilot"
                checked={pilotInterest}
                onCheckedChange={(v) => setPilotChoice(v === true)}
                className="mt-0.5"
              />
              <Label
                htmlFor="req-pilot"
                className="cursor-pointer flex-col items-start gap-0.5 text-sm font-normal leading-snug"
              >
                I&apos;d like to run a pilot with my department
                <span className="text-muted-foreground">
                  We&apos;ll help you set up classes for one unit, then you decide.
                </span>
              </Label>
            </div>

            <div className="space-y-2.5">
              <Label
                htmlFor="req-message"
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Anything else?{" "}
                <span className="font-normal text-muted-foreground/70">(optional)</span>
              </Label>
              <Textarea
                id="req-message"
                placeholder="How you'd like to use Scorpio with your classes"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-[96px] resize-none"
              />
            </div>

            {error && (
              <motion.div
                role="alert"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs font-semibold text-destructive"
              >
                {error}
              </motion.div>
            )}

            <Button
              type="submit"
              className="h-12 w-full rounded-full text-base font-semibold"
              disabled={loading}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                  Sending…
                </div>
              ) : (
                "Request access"
              )}
            </Button>

            <div className="space-y-1.5 pt-2 text-center text-sm text-muted-foreground">
              <p>
                Already have an access code?{" "}
                <Link
                  href="/signup?role=teacher"
                  className="font-semibold text-primary decoration-2 underline-offset-4 hover:underline"
                >
                  Create your account
                </Link>
              </p>
              <p>
                A student?{" "}
                <Link
                  href="/signup?role=student"
                  className="font-semibold text-primary decoration-2 underline-offset-4 hover:underline"
                >
                  Join with a class code
                </Link>
              </p>
            </div>
          </motion.div>
        </form>
      </motion.div>
    </AuthSplit>
  );
}
