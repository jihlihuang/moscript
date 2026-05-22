import { NextRequest, NextResponse } from "next/server";

const sessionCookieName = "moscript_session";
const protectedPagePrefixes = ["/admin"];

async function isValidSession(cookieValue: string): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  if (!secret || !cookieValue) return false;

  const dotIndex = cookieValue.lastIndexOf(".");
  if (dotIndex < 0) return false;

  const encoded = cookieValue.slice(0, dotIndex);
  const signature = cookieValue.slice(dotIndex + 1);
  if (!encoded || !signature) return false;

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    // base64url → base64 → bytes
    const b64 = signature.replace(/-/g, "+").replace(/_/g, "/");
    const sigBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(encoded));
    if (!valid) return false;

    // Verify expiry without Node crypto
    const payloadJson = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson) as { exp?: number };
    return typeof payload.exp === "number" && payload.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isProtectedPage = protectedPagePrefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );

  if (!isProtectedPage) return NextResponse.next();

  const cookieValue = req.cookies.get(sessionCookieName)?.value;
  if (cookieValue && (await isValidSession(cookieValue))) {
    return NextResponse.next();
  }

  const reason = cookieValue ? "invalid_or_expired_session" : "no_session";
  console.warn(`[auth] admin access denied: ${reason} path=${req.nextUrl.pathname}`);

  const loginUrl = new URL("/api/auth/google", req.url);
  loginUrl.searchParams.set("returnTo", `${req.nextUrl.pathname}${req.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*"],
};
