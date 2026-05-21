import { NextRequest, NextResponse } from "next/server";
import { listScriptTypesForGlyphs } from "@/lib/glyphs";
import { isAdminAllowed, requireRequestUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const q = params.get("q") ?? "";
  const char = params.get("char") ?? "";
  const author = params.get("author") ?? "";
  const includePersonal = params.get("includePersonal") === "1";
  const includeAllPersonal = params.get("includeAllPersonal") === "1";
  const user = requireRequestUser(req);

  return NextResponse.json({
    scripts: await listScriptTypesForGlyphs({
      q,
      char,
      author,
      includePersonal,
      includeAllPersonal: Boolean(includeAllPersonal && user && isAdminAllowed(user)),
      userId: user?.id ?? null,
    }),
  });
}
