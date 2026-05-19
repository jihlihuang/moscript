import { NextRequest, NextResponse } from "next/server";
import { getDb, syncDbToBlob } from "@/lib/db";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const db = await getDb();
  const char = String(body.char ?? "").trim();

  if (!char) {
    return NextResponse.json({ error: "char 為必填" }, { status: 400 });
  }

  db.prepare(`
    UPDATE glyphs
    SET char = ?, author = ?, script_type = ?, work_title = ?, source = ?, license = ?, quality_score = ?
    WHERE id = ?
  `).run(
    char,
    body.author || null,
    body.scriptType || null,
    body.workTitle || null,
    body.source || null,
    body.license || null,
    Number(body.qualityScore ?? 0),
    id
  );

  await syncDbToBlob();

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const db = await getDb();
  const info = db.prepare("DELETE FROM glyphs WHERE id = ?").run(id);
  await syncDbToBlob();
  return NextResponse.json({ ok: true, changes: info.changes });
}
