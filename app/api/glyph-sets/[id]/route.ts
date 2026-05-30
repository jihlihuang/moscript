import { NextRequest, NextResponse } from "next/server";
import { getDb, type GlyphRow, type GlyphSetRow } from "@/lib/db";
import { getCurrentUser, isAdminAllowed } from "@/lib/auth";
import { toGlyphDto } from "@/lib/glyphs";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  const { id } = await params;
  const db = await getDb();

  const set = db.prepare("SELECT * FROM glyph_sets WHERE id = ?").get(id) as GlyphSetRow | undefined;
  if (!set) return NextResponse.json({ error: "找不到字組" }, { status: 404 });

  // 只有擁有者可以查看私人字組的原圖（成員字圖依各字圖自身的 visibility 控制）
  const canSeeSource = !set.owner_user_id || set.owner_user_id === user?.id || (user ? isAdminAllowed(user) : false);

  const members = db.prepare(`
    SELECT * FROM glyphs
    WHERE set_id = ?
      AND (visibility = 'public' OR owner_user_id = ?)
    ORDER BY id ASC
  `).all(id, user?.id ?? "") as GlyphRow[];

  return NextResponse.json({
    id: set.id,
    sourceImageUrl: canSeeSource ? set.source_image_url : null,
    hasSource: !!set.source_image_url,
    ownerUserId: set.owner_user_id,
    createdAt: set.created_at,
    members: members.map(toGlyphDto),
  });
}
