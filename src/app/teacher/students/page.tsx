"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { collection, getDocs, query, where, type QueryDocumentSnapshot } from "firebase/firestore";
import { db, cleanupStudentData } from "@/lib/firebase";
import { useAuth } from "@/contexts/auth-context";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { RosterImport } from "@/components/roster-import";
import { NetworkStudents } from "@/components/teacher/network-students";
import { TeacherPageHeader } from "@/components/teacher/workspace";
import { useClassManager, type TeacherClass } from "@/components/teacher/class-manager";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { errorMessage } from "@/lib/error-utils";

interface Student {
  id: string;
  email: string;
  name?: string;
  createdAt?: Date;
  courseId?: string;
  courseName?: string;
}

export default function StudentsPage() {
  const { user, profile } = useAuth();
  const searchParams = useSearchParams();
  // The Classes section tabs (section-tabs.tsx) switch between the two views with ?tab=insights.
  const view = searchParams?.get("tab") === "insights" ? "insights" : "classes";
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentToDelete, setStudentToDelete] = useState<string | null>(null);
  const [networkTeacherIds, setNetworkTeacherIds] = useState<string[]>([]);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const classManager = useClassManager({
    classes,
    setClasses,
    canCreate: !!profile?.organizationId && !loading,
  });

  useEffect(() => {
    async function fetchStudentsAndNetwork() {
      if (!user) return;
      try {
        setLoading(true);

        // Fetch department teachers if in an organization
        if (profile?.organizationId) {
          const membersSnap = await getDocs(
            query(
              collection(db, "users"),
              where("organizationId", "==", profile.organizationId),
              where("role", "==", "teacher"),
            ),
          );
          const teacherIds = membersSnap.docs.map((d) => d.id);
          setNetworkTeacherIds(teacherIds.length > 0 ? teacherIds : [user.uid]);
        } else {
          setNetworkTeacherIds([user.uid]);
        }

        // Fetch courses first to map IDs (include legacy search too)
        const [cSnap1, cSnap2] = await Promise.all([
          getDocs(query(collection(db, "courses"), where("teacherId", "==", user.uid))),
          getDocs(
            query(
              collection(db, "courses"),
              where("teacherId", "==", user.uid),
              where("code", "==", user.uid),
            ),
          ),
        ]);

        setClasses(cSnap1.docs.map((d) => ({ id: d.id, ...d.data() }) as TeacherClass));

        const courseMap: Record<string, string> = {};
        const myCourseIds = new Set<string>();
        const myCodes = new Set<string>();

        [...cSnap1.docs, ...cSnap2.docs].forEach((d) => {
          courseMap[d.id] = d.data().name;
          myCourseIds.add(d.id);
          if (d.data().code) myCodes.add(d.data().code);
        });

        // Query unified collections to find students assigned to this teacher
        const [unifiedByUid, unifiedByCourses] = await Promise.all([
          getDocs(
            query(
              collection(db, "users"),
              where("teacherId", "==", user.uid),
              where("role", "==", "student"),
            ),
          ).catch(() => ({ docs: [] as QueryDocumentSnapshot[] })),
          // One query per class: the users rule looks up each class (ownsCourse), and an `in` over
          // more than 10 is refused. Each failed class is skipped rather than emptying the roster.
          Promise.all(
            Array.from(myCourseIds).map((courseId) =>
              getDocs(
                query(
                  collection(db, "users"),
                  where("courseId", "==", courseId),
                  where("role", "==", "student"),
                ),
              ).catch(() => ({ docs: [] as QueryDocumentSnapshot[] })),
            ),
          ).then((snaps) => ({ docs: snaps.flatMap((snap) => snap.docs) })),
        ]);

        const studentsMap = new Map<string, Student>();
        const allDocs = [...unifiedByUid.docs, ...unifiedByCourses.docs];

        allDocs.forEach((doc) => {
          const sData = doc.data();
          const isOurStudent =
            sData.teacherId === user.uid || (sData.courseId && myCourseIds.has(sData.courseId));

          if (isOurStudent && !studentsMap.has(doc.id)) {
            studentsMap.set(doc.id, {
              id: doc.id,
              email: sData.email || "unknown@student.com",
              name:
                sData.displayName ||
                sData.name ||
                (sData.email ? sData.email.split("@")[0] : "Student"),
              createdAt: sData.createdAt?.toDate
                ? sData.createdAt.toDate()
                : sData.createdAt
                  ? new Date(sData.createdAt)
                  : new Date(),
              courseId: sData.courseId,
              courseName: sData.courseId ? courseMap[sData.courseId] : undefined,
            } as Student);
          }
        });

        setStudents(Array.from(studentsMap.values()));
      } catch (error) {
        console.error("Error fetching students:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchStudentsAndNetwork();
  }, [user, profile]);

  const deleteStudent = async (studentId: string) => {
    try {
      await cleanupStudentData(studentId, undefined, true);
      setStudents(students.filter((s) => s.id !== studentId));
      toast.success("Student records removed.");
    } catch (error: unknown) {
      console.error("Error deleting student:", error);
      toast.error(`Failed to delete student: ${errorMessage(error)}`);
    }
  };

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        title={view === "insights" ? "Learning insights" : "Classes"}
        description={
          view === "insights"
            ? "How students across your department use Raise."
            : "Your classes, their join codes and the students in each."
        }
      >
        {view === "classes" && <RosterImport />}
      </TeacherPageHeader>

      {view === "classes" ? (
        <>
          <Card className="min-w-0 gap-0 py-0 overflow-hidden">
            <CardHeader className="flex flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-5">
              <h2 className="text-base font-semibold">Your classes</h2>
              {classManager.createButton}
            </CardHeader>
            <CardContent className="border-t p-0">
              {classManager.rows.length > 0 ? (
                <ul className="divide-y divide-border">{classManager.rows}</ul>
              ) : (
                <p role="status" className="px-5 py-6 text-sm text-muted-foreground">
                  {loading
                    ? "Loading classes…"
                    : "No classes yet. Make one to get a code students can join with."}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0 gap-0 py-0">
            <CardHeader className="flex flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-5">
              <h2 className="text-base font-semibold">Class roster</h2>
              {!loading && (
                <span className="text-sm text-muted-foreground">{students.length} enrolled</span>
              )}
            </CardHeader>
            <CardContent className="border-t p-0">
              {loading || students.length === 0 ? (
                <p role="status" className="px-5 py-10 text-center text-sm text-muted-foreground">
                  {loading
                    ? "Loading the roster…"
                    : "No students enrolled yet. Share a class code or import a roster to get started."}
                </p>
              ) : (
                <Table aria-label="Class roster">
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="pl-4 sm:pl-5">Student</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead className="w-12">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {students.map((student) => (
                      <TableRow key={student.id}>
                        <TableCell className="max-w-64 whitespace-normal py-3 pl-4 sm:pl-5">
                          <p className="break-words font-medium">
                            {student.name || student.email.split("@")[0]}
                          </p>
                          <p className="break-all text-xs text-muted-foreground">{student.email}</p>
                        </TableCell>
                        <TableCell className="max-w-48 whitespace-normal break-words text-muted-foreground">
                          {student.courseName || "No class assigned"}
                        </TableCell>
                        <TableCell className="pr-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Actions for ${student.name || student.email}`}
                              >
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => setStudentToDelete(student.id)}
                              >
                                <Trash2 /> Remove student
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <NetworkStudents
          organizationId={profile?.organizationId || undefined}
          teacherIds={networkTeacherIds.length > 0 ? networkTeacherIds : user ? [user.uid] : []}
        />
      )}

      {classManager.dialogs}

      <ConfirmDialog
        open={!!studentToDelete}
        onOpenChange={(open) => !open && setStudentToDelete(null)}
        title="Remove Student"
        description="Are you sure you want to remove this student? This will remove them from your class lists and delete their submissions to save storage space."
        onConfirm={() => studentToDelete && deleteStudent(studentToDelete)}
        confirmText="Remove"
        variant="destructive"
      />
    </div>
  );
}
