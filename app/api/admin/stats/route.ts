import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { forbidden, isAdminAllowed, logAdminAction, requireRequestUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = requireRequestUser(req);
  if (!user) return unauthorized();
  if (!isAdminAllowed(user)) return forbidden();

  const db = await getDb();

  const totalGlyphs = db.prepare("SELECT COUNT(*) as count FROM glyphs").get() as { count: number };
  const totalChars = db.prepare("SELECT COUNT(DISTINCT char) as count FROM glyphs").get() as { count: number };
  const totalCollections = db.prepare("SELECT COUNT(*) as count FROM collections").get() as { count: number };
  const scripts = db.prepare(`
    SELECT
      CASE
        WHEN script_type IS NULL OR trim(script_type) = '' THEN '未標註'
        ELSE script_type
      END as label,
      COUNT(*) as count
    FROM glyphs
    GROUP BY
      CASE
        WHEN script_type IS NULL OR trim(script_type) = '' THEN '未標註'
        ELSE script_type
      END
    ORDER BY
      CASE
        WHEN (
          CASE
            WHEN script_type IS NULL OR trim(script_type) = '' THEN '未標註'
            ELSE script_type
          END
        ) IN ('未標註', '未知書體') THEN 1
        ELSE 0
      END,
      CASE
        WHEN (
          CASE
            WHEN script_type IS NULL OR trim(script_type) = '' THEN '未標註'
            ELSE script_type
          END
        ) LIKE '%草%' THEN 0
        WHEN (
          CASE
            WHEN script_type IS NULL OR trim(script_type) = '' THEN '未標註'
            ELSE script_type
          END
        ) LIKE '%行%' THEN 1
        WHEN (
          CASE
            WHEN script_type IS NULL OR trim(script_type) = '' THEN '未標註'
            ELSE script_type
          END
        ) LIKE '%隸%' THEN 2
        WHEN (
          CASE
            WHEN script_type IS NULL OR trim(script_type) = '' THEN '未標註'
            ELSE script_type
          END
        ) LIKE '%楷%' THEN 3
        ELSE 4
      END,
      count DESC,
      label
  `).all();
  const searchCount = db.prepare(`
    SELECT COUNT(*) as count FROM usage_events
    WHERE event_type = 'search'
  `).get() as { count: number };
  const popularSearchChars = db.prepare(`
    SELECT subject, COUNT(*) as count
    FROM usage_events
    WHERE event_type = 'search' AND subject IS NOT NULL AND trim(subject) <> ''
    GROUP BY subject
    ORDER BY count DESC, subject
    LIMIT 12
  `).all();
  const uploadFailures = db.prepare(`
    SELECT details, COUNT(*) as count
    FROM usage_events
    WHERE event_type = 'upload_failed'
    GROUP BY details
    ORDER BY count DESC
    LIMIT 12
  `).all();
  const uploadProcessing = db.prepare(`
    SELECT
      COUNT(*) as count,
      AVG(CAST(json_extract(details, '$.processingMs') AS REAL)) as avgMs,
      MAX(CAST(json_extract(details, '$.processingMs') AS REAL)) as maxMs
    FROM usage_events
    WHERE event_type = 'upload_succeeded'
      AND json_extract(details, '$.processingMs') IS NOT NULL
  `).get();

  await logAdminAction(req, user, "admin_stats_view", {
    targetType: "admin",
    details: { totalGlyphs: totalGlyphs.count, totalCollections: totalCollections.count },
  });

  return NextResponse.json({
    totalGlyphs: totalGlyphs.count,
    totalChars: totalChars.count,
    totalCollections: totalCollections.count,
    scripts,
    observability: {
      searchCount: searchCount.count,
      popularSearchChars,
      uploadFailures,
      uploadProcessing,
    },
  });
}
