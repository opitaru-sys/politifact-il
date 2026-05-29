import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://bduk.co.il";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/leaderboard", "/parties", "/about", "/compare"],
        disallow: ["/admin/", "/api/"],
      },
    ],
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/news.xml`],
    host: SITE_URL,
  };
}
