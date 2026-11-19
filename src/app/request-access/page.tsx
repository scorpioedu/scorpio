"use client";

import { useState } from "react";
import { AuthSplit } from "@/components/landing/auth-split";
import { Button } from "@/components/ui/button";
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
import {
  CheckCircle2,
  Building2,
  Mail,
  User,
  Briefcase,
  MessageSquare,
} from "lucide-react";
import { motion } from "framer-motion";
export default function RequestAccessPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [institution, setInstitution] = useState("");
  const [role, setRole] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!name || !email || !institution || !role) {
      setError("Please fill in all required fields.");
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
        body: JSON.stringify({ name, email, institution, role, message }),
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
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <CheckCircle2 className="h-9 w-9 text-primary mb-5" />
          <h1 className="text-4xl font-semibold tracking-tight">Request received.</h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Thank you, <span className="text-foreground font-medium">{name}</span>. Your access request for{" "}
            <span className="text-foreground font-medium">{institution}</span> is in our queue. We review every
            educator request by hand and will reach out to{" "}
            <span className="text-foreground font-medium">{email}</span> within 24–48 hours.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild className="h-11 sm:flex-1">
              <Link href="/signup">Go to sign up</Link>
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
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="mb-8">
          <h1 className="text-4xl font-semibold tracking-tight">Join the network.</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Scorpio is invite-only for verified educators. Apply for institutional access and we&apos;ll help you get started.
          </p>
        </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-2.5"
              >
                <Label
                  htmlFor="req-name"
                  className="text-sm font-medium flex items-center gap-2 text-muted-foreground"
                >
                  <User className="h-3.5 w-3.5" />
                  Full Name
                </Label>
                <Input
                  id="req-name"
                  placeholder="Dr. William Adams"
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
                  className="text-sm font-medium flex items-center gap-2 text-muted-foreground"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Work Email
                </Label>
                <Input
                  id="req-email"
                  type="email"
                  placeholder="William@stanford.edu"
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
              <div className="space-y-2.5">
                <Label
                  htmlFor="req-institution"
                  className="text-sm font-medium flex items-center gap-2 text-muted-foreground"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  Institution
                </Label>
                <Input
                  id="req-institution"
                  placeholder="Stanford University, Berkeley High School..."
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  required
                  className="h-11"
                />
              </div>

              <div className="space-y-2.5">
                <Label
                  htmlFor="req-role"
                  className="text-sm font-medium flex items-center gap-2 text-muted-foreground"
                >
                  <Briefcase className="h-3.5 w-3.5" />
                  Scientific Role
                </Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger id="req-role" className="h-11 w-full">
                    <SelectValue placeholder="Select your role…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professor" className="cursor-pointer">
                      Professor
                    </SelectItem>
                    <SelectItem value="instructor" className="cursor-pointer">
                      Instructor / Lecturer
                    </SelectItem>
                    <SelectItem value="high_school_teacher" className="cursor-pointer">
                      High School Teacher
                    </SelectItem>
                    <SelectItem value="department_head" className="cursor-pointer">
                      Department Head
                    </SelectItem>
                    <SelectItem value="dean" className="cursor-pointer">
                      Dean / Administrator
                    </SelectItem>
                    <SelectItem value="ta" className="cursor-pointer">
                      Teaching Assistant
                    </SelectItem>
                    <SelectItem value="other" className="cursor-pointer">
                      Other Academic Role
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2.5">
                <Label
                  htmlFor="req-message"
                  className="text-sm font-medium flex items-center gap-2 text-muted-foreground"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Project Goals{" "}
                  <span className="text-[10px] uppercase font-bold tracking-wider opacity-50 ml-1">
                    (Optional)
                  </span>
                </Label>
                <Textarea
                  id="req-message"
                  placeholder="How do you plan to use Scorpio in your classroom or research?"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="min-h-[120px] resize-none"
                />
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-xs font-semibold text-destructive bg-destructive/10 border border-destructive/20 p-3 rounded-lg"
                >
                  {error}
                </motion.div>
              )}

              <Button
                className="w-full h-12 text-base font-semibold rounded-full"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Processing...
                  </div>
                ) : (
                  "Submit Access Request"
                )}
              </Button>

              <div className="pt-2 text-center text-sm text-muted-foreground">
                Already have an invite?{" "}
                <Link
                  href="/signup"
                  className="text-primary hover:underline font-semibold underline-offset-4 decoration-2"
                >
                  Sign up instead
                </Link>
              </div>
            </motion.div>
      </motion.div>
    </AuthSplit>
  );
}
