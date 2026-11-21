"use client";

import { useEffect, useState } from "react";
import { hasUnitGuide, loadUnitGuide, type UnitGuide } from "@/lib/guides";

export interface UnitGuideState {
  /** The unit has a guide file (known at once, before it loads). */
  exists: boolean;
  /** null while loading, when loading failed, and when the unit has none. */
  guide: UnitGuide | null;
  failed: boolean;
}

/** Loads a unit's guide file on demand (its own chunk). */
export function useUnitGuide(curriculumId: string, unit: number): UnitGuideState {
  const exists = hasUnitGuide(curriculumId, unit);
  const key = `${curriculumId}/${unit}`;
  const [loaded, setLoaded] = useState<{ key: string; guide: UnitGuide | null } | null>(null);
  useEffect(() => {
    if (!exists) return;
    let active = true;
    loadUnitGuide(curriculumId, unit)
      .then((guide) => active && setLoaded({ key, guide }))
      .catch(() => active && setLoaded({ key, guide: null }));
    return () => {
      active = false;
    };
  }, [curriculumId, unit, exists, key]);
  const current = loaded?.key === key ? loaded : null;
  return { exists, guide: current?.guide ?? null, failed: exists && !!current && !current.guide };
}
