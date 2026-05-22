import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { forbidden, isAdminAllowed, requireRequestUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = requireRequestUser(req);
  if (!user) return unauthorized("請先登入", req);
  if (!isAdminAllowed(user)) return forbidden("此帳號沒有後台權限", req);

  const db = await getDb();

  // Event counts per type in last 24h and 7d
  const byType24h = db.prepare(`
    SELECT event_type, severity, COUNT(*) AS count
    FROM security_events
    WHERE created_at >= datetime('now', '-1 day')
    GROUP BY event_type, severity
    ORDER BY count DESC
  `).all() as { event_type: string; severity: string; count: number }[];

  const byType7d = db.prepare(`
    SELECT event_type, COUNT(*) AS count
    FROM security_events
    WHERE created_at >= datetime('now', '-7 days')
    GROUP BY event_type
    ORDER BY count DESC
  `).all() as { event_type: string; count: number }[];

  const total24h = byType24h.reduce((s, r) => s + r.count, 0);
  const high24h  = byType24h.filter(r => r.severity === "high").reduce((s, r) => s + r.count, 0);
  const med24h   = byType24h.filter(r => r.severity === "medium").reduce((s, r) => s + r.count, 0);
  const low24h   = total24h - high24h - med24h;

  const total7d  = byType7d.reduce((s, r) => s + r.count, 0);

  // Hourly trend last 24h (for sparkline)
  const hourlyTrend = db.prepare(`
    SELECT strftime('%H', created_at) AS hour, COUNT(*) AS count
    FROM security_events
    WHERE created_at >= datetime('now', '-1 day')
    GROUP BY hour
    ORDER BY hour ASC
  `).all() as { hour: string; count: number }[];

  // Top IPs (last 7d)
  const topIps = db.prepare(`
    SELECT ip, COUNT(*) AS count, MAX(created_at) AS last_seen,
           GROUP_CONCAT(DISTINCT event_type) AS event_types
    FROM security_events
    WHERE created_at >= datetime('now', '-7 days') AND ip IS NOT NULL
    GROUP BY ip
    ORDER BY count DESC
    LIMIT 10
  `).all() as { ip: string; count: number; last_seen: string; event_types: string }[];

  // Recent security events
  const recentEvents = db.prepare(`
    SELECT id, event_type, severity, ip, user_agent, user_id, path, details, created_at
    FROM security_events
    ORDER BY id DESC
    LIMIT 100
  `).all() as {
    id: number;
    event_type: string;
    severity: string;
    ip: string | null;
    user_agent: string | null;
    user_id: string | null;
    path: string | null;
    details: string | null;
    created_at: string;
  }[];

  // Recent admin audit logs
  const auditLogs = db.prepare(`
    SELECT id, user_email, user_name, action, target_type, target_id, ip, created_at
    FROM admin_audit_logs
    ORDER BY id DESC
    LIMIT 30
  `).all() as {
    id: number;
    user_email: string;
    user_name: string | null;
    action: string;
    target_type: string | null;
    target_id: string | null;
    ip: string | null;
    created_at: string;
  }[];

  return NextResponse.json({
    summary: {
      last24h: { total: total24h, high: high24h, medium: med24h, low: low24h, byType: byType24h },
      last7d:  { total: total7d, byType: byType7d },
      hourlyTrend,
    },
    topIps,
    recentEvents,
    auditLogs,
  });
}
