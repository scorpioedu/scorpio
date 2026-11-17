"use client";

// One selected class for every teacher page. The choice is remembered in the browser and mirrored to
// `?class=` so a link opens the same class. Pages that can show every class at once pass `allowAll`.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/auth-context";
import { chooseClass } from "@/lib/teacher-edit";

export interface TeacherClass {
  id: string;
  name: string;
  period: string;
  description: string;
  code: string;
  curriculumId: string | null;
  /** Raw stored values; read with normalisePlan / classCalendar. */
  curriculumPlan: unknown;
  daysOff: unknown;
  archived: boolean;
  createdAt: string;
}

export const ALL_CLASSES = "all";
const KEY = "scorpio:teacher-class";
const LEGACY_KEY = "scorpio:courses-class";

function readStored(): string {
  try {
    return window.localStorage.getItem(KEY) ?? window.localStorage.getItem(LEGACY_KEY) ?? "";
  } catch {
    return "";
  }
}

function store(id: string) {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* private window: the choice is just not remembered */
  }
}

/** Put the class in the address bar without a navigation (Next keeps its router in step). */
function mirrorToUrl(id: string) {
  const url = new URL(window.location.href);
  if (url.searchParams.get("class") === id) return;
  if (id) url.searchParams.set("class", id);
  else url.searchParams.delete("class");
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
}

export function toTeacherClass(id: string, d: Record<string, unknown>): TeacherClass {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    id,
    name: str(d.name) || "Untitled class",
    period: str(d.period),
    description: str(d.description),
    code: str(d.code),
    curriculumId: typeof d.curriculumId === "string" ? d.curriculumId : null,
    curriculumPlan: d.curriculumPlan ?? null,
    daysOff: d.daysOff ?? null,
    archived: d.archivedAt != null,
    createdAt: str(d.createdAt),
  };
}

async function fetchClasses(uid: string): Promise<TeacherClass[]> {
  const snap = await getDocs(query(collection(db, "courses"), where("teacherId", "==", uid)));
  return snap.docs
    .map((d) => toTeacherClass(d.id, d.data()))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

interface SelectedClassValue {
  /** Active classes, by name. null while loading. */
  classes: TeacherClass[] | null;
  archivedClasses: TeacherClass[];
  /** The stored choice: a class id, ALL_CLASSES, or "" when the teacher has no classes. */
  choice: string;
  setChoice: (id: string) => void;
  refreshClasses: () => Promise<void>;
  patchClass: (id: string, patch: Partial<TeacherClass>) => void;
}

const SelectedClassContext = createContext<SelectedClassValue | null>(null);

export function SelectedClassProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [all, setAll] = useState<TeacherClass[] | null>(null);
  const [choice, setChoiceState] = useState("");

  const apply = useCallback((list: TeacherClass[]) => {
    setAll(list);
    const active = list.filter((c) => !c.archived).map((c) => c.id);
    setChoiceState((cur) => {
      const fromUrl = new URL(window.location.href).searchParams.get("class");
      if (fromUrl === ALL_CLASSES) return ALL_CLASSES;
      if (cur === ALL_CLASSES && !fromUrl) return cur;
      const stored = readStored();
      if (!fromUrl && stored === ALL_CLASSES) return ALL_CLASSES;
      return chooseClass(active, { fromUrl, remembered: cur || stored });
    });
  }, []);

  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;
    let active = true;
    fetchClasses(uid)
      .then((list) => active && apply(list))
      .catch(() => active && setAll([]));
    return () => {
      active = false;
    };
  }, [uid, apply]);

  const load = useCallback(async () => {
    if (uid) apply(await fetchClasses(uid));
  }, [uid, apply]);

  const setChoice = useCallback((id: string) => {
    setChoiceState(id);
    store(id);
    mirrorToUrl(id);
  }, []);

  const patchClass = useCallback((id: string, patch: Partial<TeacherClass>) => {
    setAll((cur) => (cur ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const value = useMemo<SelectedClassValue>(
    () => ({
      classes: all ? all.filter((c) => !c.archived) : null,
      archivedClasses: (all ?? []).filter((c) => c.archived),
      choice,
      setChoice,
      refreshClasses: load,
      patchClass,
    }),
    [all, choice, setChoice, load, patchClass],
  );
  return <SelectedClassContext.Provider value={value}>{children}</SelectedClassContext.Provider>;
}

/**
 * The selected class for this page. With `allowAll`, "All classes" is a valid choice (classId = "all");
 * without it, "All" falls back to the first class.
 */
export function useSelectedClass({ allowAll = false }: { allowAll?: boolean } = {}) {
  const ctx = useContext(SelectedClassContext);
  if (!ctx) throw new Error("useSelectedClass must be used inside SelectedClassProvider");
  const { classes, choice } = ctx;
  let classId = choice;
  if (classes) {
    if (choice === ALL_CLASSES && !allowAll) classId = classes[0]?.id ?? "";
    else if (choice !== ALL_CLASSES && !classes.some((c) => c.id === choice))
      classId = allowAll ? ALL_CLASSES : (classes[0]?.id ?? "");
  }
  // Keep the address bar in step with what the page shows.
  useEffect(() => {
    if (classes && classId) mirrorToUrl(classId);
  }, [classes, classId]);
  return {
    ...ctx,
    classId,
    selected: classes?.find((c) => c.id === classId) ?? null,
    setClassId: ctx.setChoice,
  };
}
