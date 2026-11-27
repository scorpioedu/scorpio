import { RaiseChat } from "@/components/raise/raise-chat";
import { StudentAiGate } from "@/components/student/student-ai-gate";

export default function TutorPage() {
  return (
    <StudentAiGate>
      <RaiseChat variant="student" />
    </StudentAiGate>
  );
}
