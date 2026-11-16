"use client";

import { RouteError, type RouteErrorProps } from "@/components/route-error";

export default function TeacherError(props: RouteErrorProps) {
  return <RouteError {...props} scope="teacher" />;
}
