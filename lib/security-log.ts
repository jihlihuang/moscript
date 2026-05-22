import { getDb } from "@/lib/db";

export type SecurityEventType =
  | "api_unauthorized"       // 未登入即呼叫需登入 API
  | "api_forbidden"          // 登入但權限不足（非管理員）
  | "oauth_state_mismatch"   // OAuth state 不符，疑似 CSRF 攻擊
  | "oauth_token_failed"     // Google token 交換失敗
  | "oauth_profile_invalid"  // Google profile 驗證失敗
  | "rate_limit_upload"      // 上傳頻率超限
  | "rate_limit_like"        // 按讚頻率超限
  | "private_resource_denied"; // 未授權存取私人字圖

type Severity = "high" | "medium" | "low";

const SEVERITY: Record<SecurityEventType, Severity> = {
  oauth_state_mismatch: "high",
  api_forbidden: "high",
  api_unauthorized: "medium",
  oauth_token_failed: "medium",
  oauth_profile_invalid: "medium",
  private_resource_denied: "medium",
  rate_limit_upload: "medium",
  rate_limit_like: "low",
};

export async function logSecurityEvent({
  eventType,
  ip,
  userAgent,
  userId,
  path,
  details,
}: {
  eventType: SecurityEventType;
  ip?: string | null;
  userAgent?: string | null;
  userId?: string | null;
  path?: string | null;
  details?: unknown;
}) {
  try {
    const db = await getDb();
    db.prepare(`
      INSERT INTO security_events (event_type, severity, ip, user_agent, user_id, path, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      eventType,
      SEVERITY[eventType],
      ip ?? null,
      userAgent ?? null,
      userId ?? null,
      path ?? null,
      details == null ? null : JSON.stringify(details),
    );
  } catch (err) {
    console.error("[security-log] write failed:", err);
  }
}

export function getClientIp(req: { headers: { get(name: string): string | null } }): string | null {
  return req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? null;
}
