// Scorpio Courses: curriculum roadmaps (ordered units -> ordered sets). See docs/courses.md.
// In code, "course" already means a class, so this concept is `curriculum` / `curriculumId`.
import apPhysics1 from "./ap-physics-1.json";
import { AP_UNITS, apUnit, apTopic, type ApUnit } from "../ap";

export interface CurriculumSet {
  /** "4A": unit number + letter. Unique in the curriculum and never changed once published. */
  key: string;
  unit: number;
  /** Short title, without the "AP Physics 1 · Unit 4A ·" prefix. */
  title: string;
  description: string;
  topics: string[];
  /** Approved content drafts, in question order. */
  draftIds: string[];
}

export interface Curriculum {
  id: string;
  apCourse: "physics-1";
  name: string;
  description: string;
  sets: CurriculumSet[];
}

export const CURRICULA: readonly Curriculum[] = [apPhysics1 as Curriculum];

export function getCurriculum(id: unknown): Curriculum | undefined {
  return typeof id === "string" ? CURRICULA.find((c) => c.id === id) : undefined;
}

export interface CurriculumUnit {
  unit: number;
  info: ApUnit | undefined;
  sets: CurriculumSet[];
}

/** Units in order with their sets in order. Units with no sets yet are included (empty). */
export function curriculumUnits(id: string): CurriculumUnit[] {
  const c = getCurriculum(id);
  if (!c) return [];
  const units = new Set<number>([...AP_UNITS.map((u) => u.unit), ...c.sets.map((s) => s.unit)]);
  return [...units]
    .sort((a, b) => a - b)
    .map((unit) => ({
      unit,
      info: apUnit(unit),
      sets: c.sets.filter((s) => s.unit === unit).sort(compareSetKeys),
    }));
}

export function curriculumSet(id: string, key: string): CurriculumSet | undefined {
  return getCurriculum(id)?.sets.find((s) => s.key === key);
}

/** Global order index of a set (0-based, in the order sets are listed: unit, then letter). */
export function setSequence(id: string, key: string): number {
  const c = getCurriculum(id);
  if (!c) return -1;
  return [...c.sets].sort(compareSetKeys).findIndex((s) => s.key === key);
}

/** "4A" < "4B" < "5A": by unit number, then letter. */
export function compareSetKeys(a: { key: string }, b: { key: string }): number {
  const ua = parseInt(a.key, 10);
  const ub = parseInt(b.key, 10);
  return ua - ub || a.key.localeCompare(b.key);
}

/** The published assignment title: "AP Physics 1 · Unit 4A · Momentum of objects and systems". */
export function displayTitle(set: CurriculumSet, curriculumName = apPhysics1.name): string {
  return `${curriculumName} · Unit ${set.key} · ${set.title}`;
}

/** Problems in the checks `validateCurriculum` runs; returns human-readable errors (empty = valid). */
export function validateCurriculum(c: Curriculum): string[] {
  const errors: string[] = [];
  const keys = new Set<string>();
  const drafts = new Map<string, string>();
  for (const s of c.sets) {
    if (!/^[1-9][A-Z]$/.test(s.key))
      errors.push(`${s.key}: key must be a unit number and a letter`);
    if (keys.has(s.key)) errors.push(`${s.key}: duplicate key`);
    keys.add(s.key);
    if (String(s.unit) !== s.key.slice(0, -1))
      errors.push(`${s.key}: unit ${s.unit} does not match the key`);
    if (!apUnit(s.unit)) errors.push(`${s.key}: unknown unit ${s.unit}`);
    if (!s.title.trim()) errors.push(`${s.key}: missing title`);
    if (!s.topics.length) errors.push(`${s.key}: no topics`);
    for (const t of s.topics) {
      const topic = apTopic(t);
      if (!topic) errors.push(`${s.key}: unknown topic ${t}`);
      else if (topic.unit !== s.unit) errors.push(`${s.key}: topic ${t} is in unit ${topic.unit}`);
    }
    if (!s.draftIds.length) errors.push(`${s.key}: no draftIds`);
    if (new Set(s.draftIds).size !== s.draftIds.length) errors.push(`${s.key}: repeated draftIds`);
    for (const id of s.draftIds) {
      const other = drafts.get(id);
      if (other && other !== s.key) errors.push(`${s.key}: draft ${id} is also in ${other}`);
      drafts.set(id, s.key);
    }
  }
  return errors;
}
