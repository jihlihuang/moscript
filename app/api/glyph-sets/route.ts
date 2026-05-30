import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import { getDb, syncDbToBlob } from "@/lib/db";
import { requireRequestUser, unauthorized, isAdminAllowed } from "@/lib/auth";
import { MAX_GLYPH_IMAGE_BYTES, safeGlyphFilePart, storeGlyphImageBuffer } from "@/lib/glyph-upload";
import { glyphBlobName, glyphImageUrl } from "@/lib/blob-storage";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(100, Number(req.nextUrl.searchParams.get("limit") ?? "20"));
  const adminMode = req.nextUrl.searchParams.get("admin") === "1";
  // adminMode: 管理員可查看所有字組（不限 name 是否存在）

  const db = await getDb();

  type SetRow = { id: number; name: string | null; source_image_url: string | null; owner_user_id: string | null; created_at: string };
  type MemberRow = { set_id: number; glyph_id: number; char: string; author: string | null; script_type: string | null; work_title: string | null; quality_score: number; image_url: string; thumbnail_url: string | null; visibility: string; owner_user_id: string | null; set_position: number | null };

  const where: string[] = [];
  const queryParams: unknown[] = [];
  if (!adminMode) where.push("name IS NOT NULL AND name != ''");
  if (q) {
    const like = `%${q}%`;
    const setId = Number(q);
    where.push(`(
      name LIKE ?
      OR EXISTS (
        SELECT 1
        FROM glyphs g
        WHERE g.set_id = glyph_sets.id
          AND (
            g.char LIKE ?
            OR g.author LIKE ?
            OR g.script_type LIKE ?
            OR g.work_title LIKE ?
            ${Number.isInteger(setId) ? "OR g.id = ? OR g.set_id = ?" : ""}
          )
      )
      ${Number.isInteger(setId) ? "OR id = ?" : ""}
    )`);
    queryParams.push(like, like, like, like, like);
    if (Number.isInteger(setId)) queryParams.push(setId, setId, setId);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const sets = db.prepare(`
    SELECT id, name, source_image_url, owner_user_id, created_at
    FROM glyph_sets
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...queryParams, limit) as SetRow[];

  if (sets.length === 0) return NextResponse.json({ sets: [] });

  const setIds = sets.map((s) => s.id);
  const members = db.prepare(`
    SELECT set_id, id AS glyph_id, char, author, script_type, work_title, quality_score, image_url, thumbnail_url, visibility, owner_user_id, set_position
    FROM glyphs
    WHERE set_id IN (${setIds.map(() => "?").join(",")})
      ${adminMode ? "" : "AND visibility = 'public'"}
    ORDER BY set_id, COALESCE(set_position, id), id ASC
  `).all(...setIds) as MemberRow[];

  const membersBySet = members.reduce<Record<number, MemberRow[]>>((acc, m) => {
    (acc[m.set_id] ??= []).push(m);
    return acc;
  }, {});

  const result = sets.map((s) => ({
    id: s.id,
    name: s.name,
    sourceImageUrl: s.source_image_url ? `/api/glyph-sets/${s.id}/source` : null,
    createdAt: s.created_at,
    members: (membersBySet[s.id] ?? []).map((m) => ({
      id: m.glyph_id,
      char: m.char,
      author: m.author,
      scriptType: m.script_type,
      workTitle: m.work_title,
      qualityScore: m.quality_score,
      visibility: m.visibility,
      setPosition: m.set_position,
      imageUrl: m.image_url.startsWith("/glyphs/") ? m.image_url : `/api/glyphs/${m.glyph_id}/asset`,
      thumbnailUrl: m.thumbnail_url ?? null,
    })),
  }));

  return NextResponse.json({ sets: result });
}

export async function POST(req: NextRequest) {
  const user = requireRequestUser(req);
  if (!user) return unauthorized("請先登入");

  const form = await req.formData();
  const sourceFile = form.get("sourceImage");
  const visibility = form.get("visibility") === "public" ? "public" : "private";
  const name = String(form.get("name") ?? "").trim() || null;
  const isPrivate = visibility !== "public";

  // 管理員可指定字圖 ID 並批量歸組
  const glyphIdsRaw = form.get("glyphIds");
  const glyphIds: number[] = glyphIdsRaw
    ? (JSON.parse(String(glyphIdsRaw)) as unknown[])
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0)
    : [];

  let sourceImageUrl: string | null = null;
  if (sourceFile instanceof File && sourceFile.size > 0) {
    if (sourceFile.size > MAX_GLYPH_IMAGE_BYTES) {
      return NextResponse.json({ error: "原圖過大，最大允許 20MB" }, { status: 400 });
    }

    // 轉為灰階 JPEG 以節省空間
    const rawBuffer = Buffer.from(await sourceFile.arrayBuffer());
    const grayBuffer = await sharp(rawBuffer)
      .grayscale()
      .jpeg({ quality: 82, mozjpeg: false })
      .toBuffer();

    const fileName = `${safeGlyphFilePart(user.id)}_${Date.now()}.jpg`;
    const blobName = glyphBlobName("_set", fileName, isPrivate);
    await storeGlyphImageBuffer(grayBuffer, blobName, "image/jpeg");
    sourceImageUrl = glyphImageUrl("_set", fileName, isPrivate);
  }

  const db = await getDb();
  const info = db.prepare(
    "INSERT INTO glyph_sets (name, source_image_url, owner_user_id) VALUES (?, ?, ?)"
  ).run(name, sourceImageUrl, user.id);

  const setId = Number(info.lastInsertRowid);

  // 批量指派字圖到此字組（僅管理員或字圖擁有者）
  if (glyphIds.length > 0) {
    const isAdmin = isAdminAllowed(user);
    const assignStmt = db.prepare(
      "UPDATE glyphs SET set_id = ?, set_position = ? WHERE id = ? AND (? = 1 OR owner_user_id = ?)"
    );
    const assignAll = db.transaction(() => {
      glyphIds.forEach((id, index) => {
        assignStmt.run(setId, index + 1, id, isAdmin ? 1 : 0, user.id);
      });
    });
    assignAll();
  }

  await syncDbToBlob();

  return NextResponse.json({
    id: setId,
    sourceImageUrl,
    assignedCount: glyphIds.length,
  }, { status: 201 });
}
