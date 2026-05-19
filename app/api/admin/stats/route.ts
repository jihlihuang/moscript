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
    SELECT COALESCE(script_type, '未標註') as label, COUNT(*) as count
    FROM glyphs
    GROUP BY COALESCE(script_type, '未標註')
    ORDER BY count DESC
  `).all();

  await logAdminAction(req, user, "admin_stats_view", {
    targetType: "admin",
    details: { totalGlyphs: totalGlyphs.count, totalCollections: totalCollections.count },
  });

  return NextResponse.json({
    totalGlyphs: totalGlyphs.count,
    totalChars: totalChars.count,
    totalCollections: totalCollections.count,
    scripts,
  });
}
