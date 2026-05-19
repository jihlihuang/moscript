import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSignedValue, oauthStateCookieName } from "@/lib/auth";

export const runtime = "nodejs";

function getGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
  }
  return { clientId, clientSecret };
}

function getAppOrigin(req: NextRequest) {
  return process.env.MOSCRIPT_APP_URL || process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
}

export async function GET(req: NextRequest) {
  const { clientId } = getGoogleConfig();
  const returnTo = req.nextUrl.searchParams.get("returnTo") || "/";
  const state = JSON.stringify({
    nonce: crypto.randomBytes(16).toString("base64url"),
    returnTo: returnTo.startsWith("/") ? returnTo : "/",
  });
  const redirectUri = new URL("/api/auth/google/callback", getAppOrigin(req)).toString();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  const res = NextResponse.redirect(url);
  res.cookies.set(oauthStateCookieName, createSignedValue(state), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10,
    path: "/",
  });
  return res;
}
