"use client";

import { RouteError, type RouteErrorProps } from "@/components/route-error";

export default function StudentError(props: RouteErrorProps) {
  return <RouteError {...props} scope="student" />;
}
