import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getBlobClient, glyphBlobNameFromPath, hasBlobConfig } from "@/lib/blob-storage";
import { getCurrentUser, isAdminAllowed } from "@/lib/auth";
import { getDb, type GlyphSetRow } from "@/lib/db";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

function contentTypeForPath(p: string) {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

export async function GET(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  const { id } = await params;
  const db = await getDb();

  const set = db.prepare("SELECT * FROM glyph_sets WHERE id = ?").get(id) as GlyphSetRow | undefined;
  if (!set || !set.source_image_url) {
    return NextResponse.json({ error: "找不到原圖" }, { status: 404 });
  }

  const isOwner = user && (user.id === set.owner_user_id || isAdminAllowed(user));
  if (!isOwner) return NextResponse.json({ error: "無存取權限" }, { status: 403 });

  const imageUrl = set.source_image_url;
  const parts = imageUrl
    .replace(/^\/(?:private-glyphs|glyphs)\/?/, "")
    .split("/").filter(Boolean)
    .map((p) => decodeURIComponent(p));
  if (parts.length < 1) return NextResponse.json({ error: "找不到原圖" }, { status: 404 });

  const isPrivatePath = imageUrl.startsWith("/private-glyphs/");
  let buffer: Buffer;
  try {
    if (hasBlobConfig()) {
      buffer = await getBlobClient(glyphBlobNameFromPath(parts, isPrivatePath)).downloadToBuffer();
    } else {
      const storageRoot = isPrivatePath ? path.join(process.cwd(), "data") : path.join(process.cwd(), "public");
      const localPath = path.join(storageRoot, isPrivatePath ? "private-glyphs" : "glyphs", ...parts);
      const rel = path.relative(storageRoot, localPath);
      if (rel.startsWith("..") || path.isAbsolute(rel)) return NextResponse.json({ error: "找不到原圖" }, { status: 404 });
      buffer = await fs.readFile(localPath);
    }
  } catch {
    return NextResponse.json({ error: "找不到原圖" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentTypeForPath(imageUrl),
      "Cache-Control": "private, max-age=300",
    },
  });
}
