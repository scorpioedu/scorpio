import type { MetadataRoute } from "next";

// /robots.txt. Signed-in areas and the API stay out of search results.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/student/",
          "/teacher/",
          "/admin/",
          "/api/",
          "/join/",
          "/research/admin",
          "/study/share/",
        ],
      },
    ],
    sitemap: "https://scorpioedu.org/sitemap.xml",
    host: "https://scorpioedu.org",
  };
}
