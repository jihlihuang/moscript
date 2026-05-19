import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
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

  return NextResponse.json({
    totalGlyphs: totalGlyphs.count,
    totalChars: totalChars.count,
    totalCollections: totalCollections.count,
    scripts,
  });
}
