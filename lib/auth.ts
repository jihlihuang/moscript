import crypto from "crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getDb, syncDbToBlob } from "@/lib/db";

export const sessionCookieName = "moscript_session";
export const oauthStateCookieName = "moscript_oauth_state";

const sessionMaxAgeSeconds = 60 * 60 * 24 * 14;

// ── Session encryption (AES-256-GCM) ──────────────────────────────────────
// Key = SHA-256(AUTH_SECRET + "moscript-session-v1") — 32 bytes, cached per process.
// Wire format: base64url( iv[12] | ciphertext[N] | authTag[16] )
// The iv|ciphertext|authTag layout is compatible with Web Crypto AES-GCM used in middleware.ts.

let _sessionKey: Buffer | null = null;
function getSessionKey(): Buffer {
  if (_sessionKey) return _sessionKey;
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Missing AUTH_SECRET environment variable");
  _sessionKey = crypto.createHash("sha256").update(secret + "moscript-session-v1").digest();
  return _sessionKey;
}

function encryptSession(plaintext: string): string {
  const key = getSessionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes
  return Buffer.concat([iv, ciphertext, authTag]).toString("base64url");
}

function decryptSession(encoded: string): string | null {
  try {
    const key = getSessionKey();
    const data = Buffer.from(encoded, "base64url");
    if (data.length < 29) return null; // 12 + 1 + 16 minimum
    const iv = data.subarray(0, 12);
    const authTag = data.subarray(data.length - 16);
    const ciphertext = data.subarray(12, data.length - 16);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
};

type SessionPayload = AuthUser & {
  exp: number;
};

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("Missing AUTH_SECRET environment variable — set a long random string, do not reuse GOOGLE_CLIENT_SECRET");
  }
  return secret;
}

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  return crypto.createHmac("sha256", getAuthSecret()).update(value).digest("base64url");
}

function timingSafeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function createSignedValue(value: string) {
  const encoded = base64UrlEncode(value);
  return `${encoded}.${sign(encoded)}`;
}

export function readSignedValue(cookieValue?: string) {
  if (!cookieValue) return null;
  const [encoded, signature] = cookieValue.split(".");
  if (!encoded || !signature || !timingSafeEqual(sign(encoded), signature)) return null;
  return base64UrlDecode(encoded);
}

export function createSessionCookie(user: AuthUser) {
  const payload: SessionPayload = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + sessionMaxAgeSeconds,
  };
  return encryptSession(JSON.stringify(payload));
}

export function parseSessionCookie(cookieValue?: string): AuthUser | null {
  if (!cookieValue) return null;
  const value = decryptSession(cookieValue);
  if (!value) return null;

  try {
    const payload = JSON.parse(value) as SessionPayload;
    if (!payload.id || !payload.email || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return {
      id: payload.id,
      email: payload.email,
      name: payload.name ?? null,
      picture: payload.picture ?? null,
    };
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  return parseSessionCookie(cookieStore.get(sessionCookieName)?.value);
}

export function getRequestUser(req: NextRequest) {
  return parseSessionCookie(req.cookies.get(sessionCookieName)?.value);
}

export function unauthorized(message = "請先登入 Google 帳號") {
  console.warn(`[auth] 401 unauthorized: ${message}`);
  return NextResponse.json({ error: message }, { status: 401 });
}

export function isAdminAllowed(user: AuthUser) {
  const configured = (process.env.MOSCRIPT_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return configured.length > 0 && configured.includes(user.email.toLowerCase());
}

export function forbidden(message = "此帳號沒有後台權限") {
  console.warn(`[auth] 403 forbidden: ${message}`);
  return NextResponse.json({ error: message }, { status: 403 });
}

export function requireRequestUser(req: NextRequest) {
  return getRequestUser(req) ?? null;
}

export function requireAdminUser(req: NextRequest) {
  const user = requireRequestUser(req);
  if (!user || !isAdminAllowed(user)) return null;
  return user;
}

export async function upsertUser(user: AuthUser) {
  const db = await getDb();
  db.prepare(`
    INSERT INTO users (id, email, name, picture, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      email = excluded.email,
      name = excluded.name,
      picture = excluded.picture,
      updated_at = CURRENT_TIMESTAMP
  `).run(user.id, user.email, user.name, user.picture);
  await syncDbToBlob();
}

export async function logAdminAction(
  req: NextRequest,
  user: AuthUser,
  action: string,
  options: {
    targetType?: string;
    targetId?: string | number | bigint;
    details?: unknown;
  } = {}
) {
  const db = await getDb();
  db.prepare(`
    INSERT INTO admin_audit_logs (
      user_id, user_email, user_name, action, target_type, target_id, details, ip, user_agent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    user.id,
    user.email,
    user.name,
    action,
    options.targetType ?? null,
    options.targetId == null ? null : String(options.targetId),
    options.details == null ? null : JSON.stringify(options.details),
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    req.headers.get("user-agent")
  );
  await syncDbToBlob();
}

export function setSessionCookie(res: NextResponse, user: AuthUser) {
  res.cookies.set(sessionCookieName, createSessionCookie(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: sessionMaxAgeSeconds,
    path: "/",
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(sessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
}
