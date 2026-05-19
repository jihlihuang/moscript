import { NextRequest, NextResponse } from "next/server";
import { listScriptTypesForGlyphs } from "@/lib/glyphs";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const q = params.get("q") ?? "";
  const char = params.get("char") ?? "";
  const author = params.get("author") ?? "";

  return NextResponse.json({
    scripts: await listScriptTypesForGlyphs({ q, char, author }),
  });
}
