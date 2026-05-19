import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get("returnTo") || "/";
  const origin = process.env.MOSCRIPT_APP_URL || process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const redirectUrl = new URL(returnTo.startsWith("/") ? returnTo : "/", origin);
  redirectUrl.searchParams.set("loggedOut", "1");
  const res = NextResponse.redirect(redirectUrl);
  clearSessionCookie(res);
  return res;
}
