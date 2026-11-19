"use client";

import { AdminHeader } from "@/components/admin/admin-shell";
import { AccessRequests } from "@/components/admin/access-requests";
import { TeacherInviteCodes } from "@/components/admin/teacher-invite-codes";

export default function AdminAccessPage() {
  return (
    <>
      <AdminHeader
        title="Access requests"
        description="Teachers who asked to join from the request-access page. Approve to create their code, then email it."
      />
      <AccessRequests />
      <div className="mt-12">
        <TeacherInviteCodes />
      </div>
    </>
  );
}
