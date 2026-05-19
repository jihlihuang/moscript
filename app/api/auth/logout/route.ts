import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get("returnTo") || "/";
  const res = NextResponse.redirect(new URL(returnTo.startsWith("/") ? returnTo : "/", req.nextUrl.origin));
  clearSessionCookie(res);
  return res;
}
