import { NextRequest, NextResponse } from "next/server";
import { getDb, syncDbToBlob } from "@/lib/db";
import { groupGlyphsByChar, searchGlyphs } from "@/lib/glyphs";
import { forbidden, isAdminAllowed, logAdminAction, requireRequestUser, unauthorized } from "@/lib/auth";
import { logUsageEvent } from "@/lib/usage-log";
import { onlyChinese } from "@/lib/glyph-upload";
import { MAX_AUTHOR_LEN, MAX_LICENSE_LEN, MAX_SCRIPT_TYPE_LEN, MAX_SOURCE_LEN, MAX_WORK_TITLE_LEN, truncate } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const params = req.nextUrl.searchParams;
  const q = params.get("q") ?? "";
  const author = params.get("author") ?? "";
  const workTitle = params.get("workTitle") ?? "";
  const scriptType = params.get("scriptType") ?? "";
  const scriptTypes = params.getAll("scriptTypes").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
  const char = params.get("char") ?? "";
  const perCharParam = params.get("perChar");
  const perChar = perCharParam ? Number(perCharParam) : undefined;
  const limitParam = params.get("limit");
  const offsetParam = params.get("offset");
  const limit = limitParam ? Number(limitParam) : undefined;
  const offset = offsetParam ? Number(offsetParam) : undefined;
  const includePersonal = params.get("includePersonal") === "1";
  const includeAllPersonal = params.get("includeAllPersonal") === "1";
  const resultScopeParam = params.get("resultScope");
  const sortParam = params.get("sort");
  const user = requireRequestUser(req);

  const glyphs = await searchGlyphs({
    q,
    char,
    author: author || undefined,
    workTitle: workTitle || undefined,
    scriptType,
    scriptTypes,
    perChar,
    limit: limit ? limit + 1 : undefined,
    offset,
    includePersonal,
    includeAllPersonal: Boolean(includeAllPersonal && user && isAdminAllowed(user)),
    userId: user?.id ?? null,
    resultScope:
      resultScopeParam === "all" || resultScopeParam === "liked" || resultScopeParam === "personal" || resultScopeParam === "public"
        ? resultScopeParam
        : "library",
    sort:
      sortParam === "newest" || sortParam === "author" || sortParam === "script"
        ? sortParam
        : "popular",
  });
  const visibleGlyphs = limit ? glyphs.slice(0, limit) : glyphs;
  const chars = [...new Set(Array.from(q || char).filter((c) => c.trim() !== ""))];
  const grouped = groupGlyphsByChar(visibleGlyphs);
  const hasMoreByChar = Object.fromEntries(
    chars.map((resultChar) => [
      resultChar,
      limit && char === resultChar
        ? glyphs.length > limit
        : perChar
        ? (grouped[resultChar]?.length ?? 0) >= perChar
        : false,
    ])
  );

  void logUsageEvent({
    eventType: "search",
    subject: q || char || null,
    userId: user?.id ?? null,
    details: {
      q,
      char,
      resultScope: resultScopeParam ?? "library",
      sort: sortParam ?? "popular",
      resultCount: visibleGlyphs.length,
      durationMs: Date.now() - startedAt,
    },
  });

  return NextResponse.json({
    query: q,
    chars,
    results: grouped,
    total: visibleGlyphs.length,
    hasMoreByChar,
  });
}

export async function POST(req: NextRequest) {
  const user = requireRequestUser(req);
  if (!user) return unauthorized();
  if (!isAdminAllowed(user)) return forbidden();

  const body = await req.json();
  const char = onlyChinese(String(body.char ?? "")).slice(0, 1);
  const imageUrl = String(body.imageUrl ?? "").trim();

  if (!char) {
    return NextResponse.json({ error: "char 為必填，且必須是單一中文字" }, { status: 400 });
  }
  if (!imageUrl.startsWith("/glyphs/") && !imageUrl.startsWith("/private-glyphs/")) {
    return NextResponse.json({ error: "imageUrl 格式不正確，必須是 /glyphs/ 開頭的相對路徑" }, { status: 400 });
  }

  const author = truncate(String(body.author ?? "").trim(), MAX_AUTHOR_LEN) || null;
  const scriptType = truncate(String(body.scriptType ?? "").trim(), MAX_SCRIPT_TYPE_LEN) || null;
  const workTitle = truncate(String(body.workTitle ?? "").trim(), MAX_WORK_TITLE_LEN) || null;
  const source = truncate(String(body.source ?? "manual").trim(), MAX_SOURCE_LEN);
  const license = truncate(String(body.license ?? "non-commercial-research").trim(), MAX_LICENSE_LEN);

  const db = await getDb();
  const info = db.prepare(`
    INSERT INTO glyphs (
      char, author, script_type, work_title, image_url, source, license, quality_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    char,
    author,
    scriptType,
    workTitle,
    imageUrl,
    source,
    license,
    Number(body.qualityScore ?? 0)
  );

  await syncDbToBlob();
  await logAdminAction(req, user, "glyph_create", {
    targetType: "glyph",
    targetId: info.lastInsertRowid,
    details: { char, author, scriptType, workTitle, imageUrl },
  });

  return NextResponse.json({ id: info.lastInsertRowid });
}
