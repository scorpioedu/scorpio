import type { MetadataRoute } from "next";
import { publicCourses } from "@/lib/guides/public";

// /sitemap.xml: the pages anyone can read. App pages behind a login (/student, /teacher, /admin)
// are left out on purpose: crawlers only see a sign-in screen there.
const SITE = "https://scorpioedu.org";

const PAGES: {
  path: string;
  priority: number;
  changeFrequency: "weekly" | "monthly" | "yearly";
}[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/lessons", priority: 0.9, changeFrequency: "weekly" },
  { path: "/features", priority: 0.7, changeFrequency: "monthly" },
  { path: "/pricing", priority: 0.7, changeFrequency: "monthly" },
  { path: "/demos", priority: 0.6, changeFrequency: "monthly" },
  { path: "/demos/teacher", priority: 0.5, changeFrequency: "monthly" },
  { path: "/ai", priority: 0.6, changeFrequency: "monthly" },
  { path: "/about", priority: 0.5, changeFrequency: "monthly" },
  { path: "/research", priority: 0.5, changeFrequency: "monthly" },
  { path: "/sustainability", priority: 0.4, changeFrequency: "monthly" },
  { path: "/request-access", priority: 0.5, changeFrequency: "yearly" },
  { path: "/contact", priority: 0.4, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const courses = await publicCourses();
  return [
    ...PAGES.map((p) => ({
      url: `${SITE}${p.path === "/" ? "" : p.path}`,
      changeFrequency: p.changeFrequency,
      priority: p.priority,
    })),
    ...courses.flatMap((c) => [
      { url: `${SITE}${c.href}`, changeFrequency: "weekly" as const, priority: 0.8 },
      ...c.units.map((u) => ({
        url: `${SITE}${u.href}`,
        changeFrequency: "monthly" as const,
        priority: 0.75,
      })),
      ...c.units.flatMap((u) =>
        u.topics.map((t) => ({
          url: `${SITE}${t.href}`,
          changeFrequency: "monthly" as const,
          priority: 0.7,
        })),
      ),
    ]),
  ];
}
