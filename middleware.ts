import { NextRequest, NextResponse } from "next/server";

const sessionCookieName = "moscript_session";
const protectedPagePrefixes = ["/admin"];

// Mirrors the key derivation in lib/auth.ts:
//   key = SHA-256( AUTH_SECRET + "moscript-session-v1" )
// Wire format: base64url( iv[12] | ciphertext[N] | authTag[16] )
let _cachedKey: CryptoKey | null = null;
async function getSessionKey(): Promise<CryptoKey | null> {
  if (_cachedKey) return _cachedKey;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(secret + "moscript-session-v1"));
  _cachedKey = await crypto.subtle.importKey("raw", hashBuffer, { name: "AES-GCM" }, false, ["decrypt"]);
  return _cachedKey;
}

async function isValidSession(cookieValue: string): Promise<boolean> {
  const key = await getSessionKey();
  if (!key || !cookieValue) return false;

  try {
    const b64 = cookieValue.replace(/-/g, "+").replace(/_/g, "/");
    const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (data.length < 29) return false; // 12(iv) + 1(content) + 16(tag)

    const iv = data.subarray(0, 12);
    // Web Crypto AES-GCM expects ciphertext || authTag
    // Our format is iv || ciphertext || authTag, so slice off the iv
    const ciphertextWithTag = data.subarray(12);

    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertextWithTag);
    const payload = JSON.parse(new TextDecoder().decode(decrypted)) as { exp?: number };
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
