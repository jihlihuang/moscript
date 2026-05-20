import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getBlobClient, glyphBlobNameFromPath, hasBlobConfig } from "@/lib/blob-storage";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ path: string[] }>;
};

function contentTypeForPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".avif") return "image/avif";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".tif" || ext === ".tiff") return "image/tiff";
  return "application/octet-stream";
}

async function getLocalGlyphResponse(parts: string[]) {
  const publicRoot = path.join(process.cwd(), "public");
  const localPath = path.join(publicRoot, "glyphs", ...parts);
  const relativePath = path.relative(publicRoot, localPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return NextResponse.json({ error: "Invalid image path." }, { status: 400 });
  }

  try {
    const buffer = await fs.readFile(localPath);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentTypeForPath(localPath),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error
      ? (error as { code?: string }).code
      : undefined;
    if (code === "ENOENT") {
      return NextResponse.json({ error: "Image not found." }, { status: 404 });
    }
    throw error;
  }
}

export async function GET(_req: Request, { params }: Params) {
  const { path } = await params;

  if (!hasBlobConfig()) {
    return getLocalGlyphResponse(path);
  }

  const blob = getBlobClient(glyphBlobNameFromPath(path));

  try {
    const buffer = await blob.downloadToBuffer();
    const properties = await blob.getProperties();
    const body = new Blob([new Uint8Array(buffer)]);

    return new NextResponse(body, {
      headers: {
        "Content-Type": properties.contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    const statusCode = typeof error === "object" && error && "statusCode" in error
      ? (error as { statusCode?: number }).statusCode
      : undefined;

    if (statusCode === 404) {
      return NextResponse.json({ error: "Image not found." }, { status: 404 });
    }

    throw error;
  }
}
