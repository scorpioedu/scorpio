import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurriculum } from "@/data/curricula";
import { apUnit } from "@/data/ap";
import UnitGuideClient from "./page-client";

type Params = Promise<{ curriculumId: string; unit: string }>;

function resolve(curriculumId: string, unit: string) {
  const curriculum = getCurriculum(curriculumId);
  const n = Number(unit);
  if (!curriculum || !Number.isInteger(n) || !curriculum.sets.some((s) => s.unit === n))
    return null;
  return { curriculum, unit: n };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { curriculumId, unit } = await params;
  const found = resolve(curriculumId, unit);
  return { title: found ? `Unit ${found.unit}: ${apUnit(found.unit)?.title ?? ""}` : "Courses" };
}

export default async function Page({ params }: { params: Params }) {
  const { curriculumId, unit } = await params;
  const found = resolve(curriculumId, unit);
  if (!found) notFound();
  return <UnitGuideClient curriculumId={found.curriculum.id} unit={found.unit} />;
}
