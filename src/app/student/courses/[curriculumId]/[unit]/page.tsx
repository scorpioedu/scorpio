import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { apUnitLabel } from "@/data/ap";
import { getCurriculum } from "@/data/curricula";
import { hasUnitGuide } from "@/lib/guides";
import StudentUnitGuideClient from "./page-client";

type Params = Promise<{ curriculumId: string; unit: string }>;

/** A unit of a known course that has a guide; anything else is not a page. */
function resolve(curriculumId: string, unit: string) {
  const curriculum = getCurriculum(curriculumId);
  const n = Number(unit);
  if (!curriculum || !Number.isInteger(n) || !hasUnitGuide(curriculum.id, n)) return null;
  return { curriculum, unit: n };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { curriculumId, unit } = await params;
  const found = resolve(curriculumId, unit);
  return { title: found ? apUnitLabel(found.unit, found.curriculum.apCourse) : "Course guide" };
}

export default async function Page({ params }: { params: Params }) {
  const { curriculumId, unit } = await params;
  const found = resolve(curriculumId, unit);
  if (!found) notFound();
  return <StudentUnitGuideClient curriculumId={found.curriculum.id} unit={found.unit} />;
}
