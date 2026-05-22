import { NextRequest, NextResponse } from "next/server";
import {
  AuthUser,
  oauthStateCookieName,
  readSignedValue,
  setSessionCookie,
  upsertUser,
} from "@/lib/auth";
import { getClientIp, logSecurityEvent } from "@/lib/security-log";

export const runtime = "nodejs";

type GoogleTokenResponse = {
  access_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

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
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const storedState = readSignedValue(req.cookies.get(oauthStateCookieName)?.value);

  if (!code || !state || !storedState || state !== storedState) {
    console.warn(`[auth] oauth callback state mismatch: code=${!!code} state=${!!state} stored=${!!storedState}`);
    void logSecurityEvent({
      eventType: "oauth_state_mismatch",
      ip: getClientIp(req),
      userAgent: req.headers.get("user-agent"),
      path: req.nextUrl.pathname,
      details: { code: !!code, state: !!state, stored: !!storedState },
    });
    return NextResponse.json({ error: "Google 登入狀態驗證失敗" }, { status: 400 });
  }

  const { clientId, clientSecret } = getGoogleConfig();
  const redirectUri = new URL("/api/auth/google/callback", getAppOrigin(req)).toString();
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const token = (await tokenRes.json()) as GoogleTokenResponse;

  if (!tokenRes.ok || !token.access_token) {
    console.warn(`[auth] google token exchange failed: ${token.error ?? "no access_token"}`);
    void logSecurityEvent({
      eventType: "oauth_token_failed",
      ip: getClientIp(req),
      userAgent: req.headers.get("user-agent"),
      details: { error: token.error, status: tokenRes.status },
    });
    return NextResponse.json(
      { error: token.error_description || token.error || "Google token exchange failed" },
      { status: 401 }
    );
  }

  const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const profile = (await profileRes.json()) as GoogleUserInfo;

  if (!profileRes.ok || !profile.sub || !profile.email || profile.email_verified === false) {
    console.warn(`[auth] google profile invalid: ok=${profileRes.ok} sub=${!!profile.sub} email=${!!profile.email} verified=${profile.email_verified}`);
    void logSecurityEvent({
      eventType: "oauth_profile_invalid",
      ip: getClientIp(req),
      userAgent: req.headers.get("user-agent"),
      details: { ok: profileRes.ok, hasSub: !!profile.sub, hasEmail: !!profile.email, verified: profile.email_verified },
    });
    return NextResponse.json({ error: "無法取得已驗證的 Google 帳號資訊" }, { status: 401 });
  }

  const user: AuthUser = {
    id: `google:${profile.sub}`,
    email: profile.email,
    name: profile.name ?? null,
    picture: profile.picture ?? null,
  };
  await upsertUser(user);

  let returnTo = "/";
  try {
    const parsedState = JSON.parse(state) as { returnTo?: string };
    if (parsedState.returnTo?.startsWith("/")) returnTo = parsedState.returnTo;
  } catch {
    returnTo = "/";
  }

  const res = NextResponse.redirect(new URL(returnTo, getAppOrigin(req)));
  setSessionCookie(res, user);
  res.cookies.set(oauthStateCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
  return res;
}
