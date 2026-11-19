"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { LearningInsights, type InsightsStudent } from "@/components/teacher/learning-insights";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/auth-context";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { db } from "@/lib/firebase";
import type { StudentPortfolio } from "@/lib/types";

export function NetworkStudents({
  organizationId,
  teacherIds,
}: {
  organizationId?: string;
  teacherIds: string[];
}) {
  const { user, profile } = useAuth();
  const [students, setStudents] = useState<InsightsStudent[]>([]);
  const [portfolios, setPortfolios] = useState<Record<string, StudentPortfolio>>({});
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  const effectiveOrgId = organizationId || profile?.organizationId || "";

  useEffect(() => {
    if (teacherIds.length === 0) return;

    let cancelled = false;

    async function fetchStudents() {
      setLoading(true);
      setLoadFailed(false);
      try {
        // One query per teacher and one per student. firestore.rules authorises these reads with a
        // document lookup per distinct teacher (users) and per student (portfolios: user(studentId));
        // an `in` over many ids is refused once it passes 10 lookups ("maximum of 10 document access
        // calls"), even when nothing matches. Same fix as the Gradebook and the Dashboard.
        const studentSnaps = await Promise.all(
          teacherIds.map((teacherId) =>
            getDocs(
              query(
                collection(db, "users"),
                where("teacherId", "==", teacherId),
                where("role", "==", "student"),
              ),
            ),
          ),
        );
        const fetchedStudents = studentSnaps
          .flatMap((snap) => snap.docs)
          .map((doc) => {
            const { displayName, name, email } = doc.data();
            return { id: doc.id, name: displayName || name || "Student", email };
          });
        const portsData: Record<string, StudentPortfolio> = {};

        if (fetchedStudents.length > 0) {
          const portfolioSnaps = await Promise.all(
            fetchedStudents.map((student) =>
              getDocs(query(collection(db, "portfolios"), where("studentId", "==", student.id))),
            ),
          );
          portfolioSnaps.forEach((snap) => {
            snap.docs.forEach((doc) => {
              portsData[doc.id] = doc.data() as StudentPortfolio;
            });
          });
        }
        if (cancelled) return;
        setStudents(fetchedStudents);
        setPortfolios(portsData);
      } catch (err) {
        console.error("Error fetching students:", err);
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchStudents();
    return () => {
      cancelled = true;
    };
  }, [teacherIds, organizationId]);

  const generatePortfolio = async (studentId: string) => {
    if (!user) return;
    if (!effectiveOrgId) {
      toast.error("Connecting to a department network is required to compile AI portfolios.");
      return;
    }
    setGeneratingFor(studentId);
    try {
      const res = await authenticatedFetch("/api/teacher/network/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId: user.uid, studentId, organizationId: effectiveOrgId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate portfolio");
      setPortfolios((prev) => ({ ...prev, [studentId]: data.portfolio }));
      toast.success("AI Portfolio successfully compiled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate portfolio");
    } finally {
      setGeneratingFor(null);
    }
  };

  // With no teachers there is nothing to load.
  const waiting = loading && teacherIds.length > 0;
  if (waiting || loadFailed) {
    return (
      <Card
        className="flex-row items-center justify-center gap-2 px-5 py-10 text-sm text-muted-foreground"
        role="status"
      >
        {waiting && <Loader2 className="size-4 animate-spin" />}
        {waiting
          ? "Loading learning insights…"
          : "Learning insights couldn’t load. Reopen this tab to try again."}
      </Card>
    );
  }

  return (
    <LearningInsights
      students={students}
      portfolios={portfolios}
      updatingStudentId={generatingFor}
      onUpdate={generatePortfolio}
    />
  );
}
