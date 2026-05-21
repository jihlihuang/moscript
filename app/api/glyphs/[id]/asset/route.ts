import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getBlobClient, glyphBlobNameFromPath, hasBlobConfig } from "@/lib/blob-storage";
import { getCurrentUser } from "@/lib/auth";
import { canAccessGlyph } from "@/lib/glyph-access";
import { getDb, type GlyphRow } from "@/lib/db";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

function contentTypeForPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function glyphUrlToPathParts(imageUrl: string) {
  return imageUrl
    .replace(/^\/(?:private-glyphs|glyphs)\/?/, "")
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
}

export async function GET(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  const { id } = await params;
  const db = await getDb();
  const glyph = db.prepare("SELECT * FROM glyphs WHERE id = ?").get(id) as GlyphRow | undefined;
  if (!glyph || !canAccessGlyph(glyph, user)) {
    return NextResponse.json({ error: "找不到字圖" }, { status: 404 });
  }

  const variant = req.nextUrl.searchParams.get("variant") === "thumbnail" ? "thumbnail" : "image";
  const imageUrl = variant === "thumbnail" ? glyph.thumbnail_url || glyph.image_url : glyph.image_url;
  if (!imageUrl || (!imageUrl.startsWith("/glyphs/") && !imageUrl.startsWith("/private-glyphs/"))) {
    return NextResponse.json({ error: "找不到字圖" }, { status: 404 });
  }

  const parts = glyphUrlToPathParts(imageUrl);
  if (parts.length < 2) {
    return NextResponse.json({ error: "找不到字圖" }, { status: 404 });
  }

  let buffer: Buffer;
  const isPrivatePath = imageUrl.startsWith("/private-glyphs/");
  try {
    if (hasBlobConfig()) {
      buffer = await getBlobClient(glyphBlobNameFromPath(parts, isPrivatePath)).downloadToBuffer();
    } else {
      const storageRoot = isPrivatePath ? path.join(process.cwd(), "data") : path.join(process.cwd(), "public");
      const localPath = path.join(storageRoot, isPrivatePath ? "private-glyphs" : "glyphs", ...parts);
      const relativePath = path.relative(storageRoot, localPath);
      if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        return NextResponse.json({ error: "找不到字圖" }, { status: 404 });
      }
      buffer = await fs.readFile(localPath);
    }
  } catch {
    return NextResponse.json({ error: "找不到字圖" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentTypeForPath(imageUrl),
      "Cache-Control": glyph.owner_user_id && glyph.visibility === "private"
        ? "private, max-age=300"
        : "public, max-age=31536000, immutable",
    },
  });
}
