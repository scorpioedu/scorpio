"use client";

// The unit guide: what a unit covers, what each set contains, and how the chosen class did on it.
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { apTopic, misconceptionTag } from "@/data/ap";
import { CURRICULA, getCurriculum, hasContent } from "@/data/curricula";
import { setProfile, typeSummary } from "@/data/curricula/profiles";
import { deriveRoadmap } from "@/lib/curriculum-roadmap";
import { normalisePlan } from "@/lib/curriculum-plan";
import { TeacherPageHeader, TeacherSummary } from "@/components/teacher/workspace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClassPicker } from "@/components/teacher/class-picker";
import { MisconceptionList, SetRow } from "../../roadmap-tab";
import { SetPreviewDialog, type PreviewTarget } from "../../set-preview-dialog";
import { useCourseData } from "../../use-course-data";

export default function UnitGuideClient({
  curriculumId,
  unit,
}: {
  curriculumId: string;
  unit: number;
}) {
  const curriculum = getCurriculum(curriculumId)!;
  const written = hasContent(curriculum);
  const data = useCourseData(curriculumId);
  const { classes, selected, published, classAssignments, progress } = data;
  const [preview, setPreview] = useState<PreviewTarget | null>(null);

  const follows = selected?.curriculumId === curriculumId;
  const roadmapUnit = useMemo(
    () =>
      deriveRoadmap(
        curriculumId,
        published ?? [],
        selected ? classAssignments : [],
        follows ? normalisePlan(curriculumId, selected?.curriculumPlan) : null,
      ).find((u) => u.unit === unit)!,
    [curriculumId, published, classAssignments, selected, follows, unit],
  );
  const info = roadmapUnit.info;
  const profiles = roadmapUnit.sets.map((s) => setProfile(curriculumId, s.set.key));
  const problems = profiles.reduce((n, p) => n + (p?.problems ?? 0), 0);
  const minutes = profiles.reduce((n, p) => n + (p?.minutes ?? 0), 0);
  const topics = [...new Set(roadmapUnit.sets.flatMap((s) => s.set.topics))];
  const insight = progress?.units.find((u) => u.unit === unit);

  // Misconceptions the unit's sets target, with the sets that target each.
  const targeted = useMemo(() => {
    const byTag = new Map<string, string[]>();
    for (const s of roadmapUnit.sets)
      for (const m of setProfile(curriculumId, s.set.key)?.misconceptions ?? [])
        byTag.set(m.tag, [...(byTag.get(m.tag) ?? []), s.set.key]);
    return [...byTag.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [curriculumId, roadmapUnit]);

  return (
    <div className="space-y-6 md:pb-16 md:pr-28">
      <Link
        href={`/teacher/courses${curriculumId === CURRICULA[0].id ? "" : `?course=${encodeURIComponent(curriculumId)}`}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> {curriculum.name} roadmap
      </Link>

      <TeacherPageHeader title={`Unit ${unit}: ${info?.title ?? ""}`} description={info?.summary}>
        {written && classes && classes.length > 0 && <ClassPicker />}
        {written && selected && roadmapUnit.assignable.length > 0 && (
          <Button asChild>
            <Link
              href={`/teacher/courses?course=${encodeURIComponent(curriculumId)}&assign=${unit}`}
            >
              <Plus aria-hidden /> Assign {roadmapUnit.assignable.length} set
              {roadmapUnit.assignable.length === 1 ? "" : "s"}
            </Link>
          </Button>
        )}
      </TeacherPageHeader>

      <TeacherSummary
        label="Unit overview"
        items={[
          { label: "Sets", value: roadmapUnit.sets.length },
          { label: "Problems", value: problems || "Planned" },
          { label: "Student time", value: minutes ? `about ${minutes} min` : "—" },
          { label: "Topics", value: topics.length },
        ]}
      />

      <section aria-labelledby="sets-heading" className="space-y-3">
        <h2 id="sets-heading" className="text-lg font-semibold">
          Sets in this unit
        </h2>
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {roadmapUnit.sets.map((s) => {
            const p = setProfile(curriculumId, s.set.key);
            return (
              <li key={s.set.key}>
                <ul>
                  <SetRow
                    curriculumId={curriculumId}
                    s={s}
                    hasClass={written && !!selected}
                    students={progress?.students ?? 0}
                    progress={progress}
                    onPreview={setPreview}
                  />
                </ul>
                {p && (
                  <div className="space-y-1 px-4 pb-3 text-xs text-muted-foreground">
                    <p>
                      Topics:{" "}
                      {s.set.topics
                        .map((t) => `${t} ${apTopic(t, curriculum.apCourse)?.title ?? ""}`)
                        .join(" · ")}
                    </p>
                    <p>
                      {typeSummary(p)} ·{" "}
                      {(["easy", "medium", "hard"] as const)
                        .filter((d) => p.difficulty[d] > 0)
                        .map((d) => `${p.difficulty[d]} ${d}`)
                        .join(", ")}
                    </p>
                    <p className="break-words">
                      Catches:{" "}
                      {p.misconceptions
                        .map((m) => misconceptionTag(m.tag)?.label ?? m.tag)
                        .join("; ")}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {selected && insight && insight.top.length > 0 && (
        <section aria-labelledby="class-heading" className="space-y-3">
          <h2 id="class-heading" className="text-lg font-semibold">
            {selected.name} on this unit
          </h2>
          <MisconceptionList insight={insight} />
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Topics covered</CardTitle>
            <CardDescription>
              From the AP course framework, in the order the sets use them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {topics.map((id) => {
                const t = apTopic(id, curriculum.apCourse);
                return (
                  <li key={id}>
                    <p className="font-medium">
                      {id} {t?.title}
                    </p>
                    {t?.summary && <p className="text-muted-foreground">{t.summary}</p>}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
        {targeted.length > 0 && (
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Misconceptions this unit targets</CardTitle>
              <CardDescription>
                Wrong answers are written to catch these, so the class report can name them.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm">
                {targeted.map(([tag, keys]) => {
                  const meta = misconceptionTag(tag);
                  return (
                    <li key={tag}>
                      <p className="break-words font-medium">
                        {meta?.label ?? tag}{" "}
                        <span className="font-normal text-muted-foreground">
                          · {keys.join(", ")}
                        </span>
                      </p>
                      {meta?.description && (
                        <p className="break-words text-muted-foreground">{meta.description}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <SetPreviewDialog target={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
