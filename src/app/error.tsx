"use client";

import { RouteError, type RouteErrorProps } from "@/components/route-error";

export default function RootError(props: RouteErrorProps) {
  return <RouteError {...props} scope="app" fullScreen />;
}
