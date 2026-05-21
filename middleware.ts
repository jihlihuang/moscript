import { NextRequest, NextResponse } from "next/server";

const sessionCookieName = "moscript_session";
const protectedPagePrefixes = ["/admin"];

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isProtectedPage = protectedPagePrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

  if (!isProtectedPage || req.cookies.has(sessionCookieName)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/api/auth/google", req.url);
  loginUrl.searchParams.set("returnTo", `${req.nextUrl.pathname}${req.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*"],
};
