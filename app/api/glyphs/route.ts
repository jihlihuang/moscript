import { NextRequest, NextResponse } from "next/server";
import { getDb, syncDbToBlob } from "@/lib/db";
import { groupGlyphsByChar, searchGlyphs } from "@/lib/glyphs";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const q = params.get("q") ?? "";
  const author = params.get("author") ?? "";
  const scriptType = params.get("scriptType") ?? "";
  const char = params.get("char") ?? "";
  const perCharParam = params.get("perChar");
  const perChar = perCharParam ? Number(perCharParam) : undefined;

  const glyphs = await searchGlyphs({ q, char, author, scriptType, perChar });
  const chars = [...new Set(Array.from(q || char).filter((c) => c.trim() !== ""))];

  return NextResponse.json({
    query: q,
    chars,
    results: groupGlyphsByChar(glyphs),
    total: glyphs.length,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = await getDb();

  if (!body.char || !body.imageUrl) {
    return NextResponse.json(
      { error: "char 與 imageUrl 為必填" },
      { status: 400 }
    );
  }

  const info = db.prepare(`
    INSERT INTO glyphs (
      char, author, script_type, work_title, image_url, source, license, quality_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    body.char,
    body.author ?? null,
    body.scriptType ?? null,
    body.workTitle ?? null,
    body.imageUrl,
    body.source ?? "manual",
    body.license ?? "non-commercial-research",
    Number(body.qualityScore ?? 0)
  );

  await syncDbToBlob();

  return NextResponse.json({ id: info.lastInsertRowid });
}
