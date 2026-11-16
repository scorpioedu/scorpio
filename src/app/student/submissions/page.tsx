"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, query, where, doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { assignmentIdsOf, buildSubmissionRows, type AssignmentInfo, type RawSubmission } from "@/lib/student-submissions";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WorkspaceHeader } from "@/components/ui/workspace";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function SubmissionsPage() {
  const { user, profile } = useAuth();
  const [rawSubmissions, setRawSubmissions] = useState<RawSubmission[] | null>(null);
  // assignmentId -> assignment (null = missing/unreadable). Kept across snapshots so each assignment is read once.
  const [assignments, setAssignments] = useState<ReadonlyMap<string, AssignmentInfo | null>>(new Map());
  const requestedAssignments = useRef<Set<string>>(new Set());

  // 1. Listen for submissions in real time. The listener only stores raw data: no reads happen in the callback.
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "submissions"), where("studentId", "==", user.uid));
    return onSnapshot(q, (snapshot) => {
      setRawSubmissions(snapshot.docs.map((d) => ({ id: d.id, data: d.data() })));
    });
  }, [user]);

  // 2. Fetch each distinct assignment once, however many snapshots arrive.
  useEffect(() => {
    if (!rawSubmissions) return;
    const missing = assignmentIdsOf(rawSubmissions).filter((id) => !requestedAssignments.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => requestedAssignments.current.add(id));
    Promise.all(missing.map(async (id): Promise<[string, AssignmentInfo | null]> => {
      try {
        const snap = await getDoc(doc(db, "assignments", id));
        return [id, snap.exists() ? (snap.data() as AssignmentInfo) : null];
      } catch (e) {
        console.error("Error fetching assignment for submission:", e);
        requestedAssignments.current.delete(id); // retry on a later snapshot
        return [id, null];
      }
    })).then((entries) => {
      // Not gated on effect cleanup: a newer snapshot must not discard results already requested.
      setAssignments((current) => new Map([...current, ...entries]));
    });
  }, [rawSubmissions]);

  const pendingAssignments = rawSubmissions !== null && assignmentIdsOf(rawSubmissions).some((id) => !assignments.has(id));
  const loading = rawSubmissions === null || pendingAssignments;
  const submissions = useMemo(
    () => buildSubmissionRows(rawSubmissions ?? [], assignments, { courseId: profile?.courseId, teacherId: profile?.teacherId }),
    [rawSubmissions, assignments, profile?.courseId, profile?.teacherId],
  );

  return (
    <div className="space-y-6">
      <WorkspaceHeader title="My Submissions" description="Check which assignments you’ve turned in.">
        <Button asChild variant="outline"><Link href="/student/grades">View grades</Link></Button>
      </WorkspaceHeader>

      <Card className="overflow-hidden py-0 shadow-none">
        <CardContent className="p-0">
          {loading ? (
            <p role="status" className="p-6 text-sm text-muted-foreground">Loading submissions…</p>
          ) : submissions.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Your submitted assignments will appear here.</p>
          ) : (
            <Table aria-label="Submission history">
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="px-4">Assignment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((submission) => (
                  <TableRow key={submission.id}>
                    <TableCell className="min-w-32 whitespace-normal px-4 py-3 font-medium">
                      <span className="break-words">{submission.assignmentTitle}</span>
                      <p className="text-xs font-normal text-muted-foreground">{submission.submittedAt?.toLocaleDateString() ?? "—"}</p>
                    </TableCell>
                    <TableCell>
                      {submission.graded ? (
                        <Badge variant="secondary">
                          Graded
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          Awaiting grade
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {submission.graded && submission.score !== null
                        ? `${submission.score}%`
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
