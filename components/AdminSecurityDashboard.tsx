"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Shield, ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react";

type SecurityEvent = {
  id: number;
  event_type: string;
  severity: string;
  ip: string | null;
  user_agent: string | null;
  user_id: string | null;
  path: string | null;
  details: string | null;
  created_at: string;
};

type AuditLog = {
  id: number;
  user_email: string;
  user_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  ip: string | null;
  created_at: string;
};

type SecurityData = {
  summary: {
    last24h: {
      total: number;
      high: number;
      medium: number;
      low: number;
      byType: { event_type: string; severity: string; count: number }[];
    };
    last7d: {
      total: number;
      byType: { event_type: string; count: number }[];
    };
    hourlyTrend: { hour: string; count: number }[];
  };
  topIps: { ip: string; count: number; last_seen: string; event_types: string }[];
  recentEvents: SecurityEvent[];
  auditLogs: AuditLog[];
};

const EVENT_LABELS: Record<string, string> = {
  oauth_state_mismatch:   "OAuth State 不符 (CSRF)",
  api_forbidden:          "API 權限拒絕",
  api_unauthorized:       "API 未授權",
  oauth_token_failed:     "OAuth Token 失敗",
  oauth_profile_invalid:  "OAuth Profile 無效",
  private_resource_denied:"私人資源被拒",
  rate_limit_upload:      "上傳頻率超限",
  rate_limit_like:        "按讚頻率超限",
};

const SEVERITY_BADGE: Record<string, string> = {
  high:   "bg-red-100 text-red-800 border border-red-300",
  medium: "bg-amber-100 text-amber-800 border border-amber-300",
  low:    "bg-stone-100 text-stone-600 border border-stone-300",
};

const SEVERITY_ROW: Record<string, string> = {
  high:   "border-l-4 border-red-500 bg-red-50/40",
  medium: "border-l-4 border-amber-400 bg-amber-50/40",
  low:    "border-l-4 border-stone-300 bg-white",
};

export function AdminSecurityDashboard() {
  const [data, setData] = useState<SecurityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [activeSection, setActiveSection] = useState<"events" | "audit">("events");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/security");
      if (res.ok) {
        setData(await res.json() as SecurityData);
        setLastRefresh(new Date());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
    const timer = setInterval(() => void fetchData(), 30_000);
    return () => clearInterval(timer);
  }, [fetchData]);

  if (!data && loading) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500">
        <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
        載入中...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-400">
        <ShieldOff className="mr-2 h-5 w-5" />
        無法取得資安資料
      </div>
    );
  }

  const { summary, topIps, recentEvents, auditLogs } = data;

  // Build hourly sparkline (24 slots, 0..23)
  const hourMap = Object.fromEntries(summary.hourlyTrend.map(r => [r.hour, r.count]));
  const maxHour = Math.max(1, ...Object.values(hourMap));
  const hours = Array.from({ length: 24 }, (_, i) => {
    const h = String(i).padStart(2, "0");
    return { h, count: hourMap[h] ?? 0 };
  });

  return (
    <div className="space-y-6">

      {/* ── Refresh bar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <Shield className="h-4 w-4 text-red-700" />
          <span className="font-bold text-stone-700">資安監控</span>
          {lastRefresh && (
            <span>· 更新於 {lastRefresh.toLocaleTimeString("zh-TW")}</span>
          )}
          <span className="text-stone-400">（每 30 秒自動刷新）</span>
        </div>
        <button
          onClick={() => void fetchData()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-bold text-stone-600 hover:border-red-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          刷新
        </button>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "過去 24h 總計", value: summary.last24h.total, icon: Shield, color: "text-stone-600", bg: "bg-stone-50" },
          { label: "高風險", value: summary.last24h.high, icon: ShieldAlert, color: "text-red-700", bg: "bg-red-50" },
          { label: "中風險", value: summary.last24h.medium, icon: AlertTriangle, color: "text-amber-700", bg: "bg-amber-50" },
          { label: "過去 7d 總計", value: summary.last7d.total, icon: ShieldCheck, color: "text-stone-600", bg: "bg-stone-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`rounded-2xl border border-stone-200 ${bg} p-4`}>
            <div className={`mb-1 flex items-center gap-1.5 text-xs font-bold ${color}`}>
              <Icon className="h-3.5 w-3.5" />
              {label}
            </div>
            <div className={`font-serif text-3xl font-bold ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Hourly trend ── */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="mb-3 text-sm font-bold text-stone-700">過去 24 小時事件趨勢</div>
        <div className="flex h-16 items-end gap-0.5">
          {hours.map(({ h, count }) => (
            <div
              key={h}
              title={`${h}:00 — ${count} 件`}
              className="group relative flex-1"
            >
              <div
                className="w-full rounded-t bg-red-400 opacity-80 transition-opacity hover:opacity-100"
                style={{ height: `${count === 0 ? 2 : Math.max(4, (count / maxHour) * 56)}px` }}
              />
              <div className="invisible absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-stone-800 px-1.5 py-0.5 text-xs text-white group-hover:visible">
                {h}:00 · {count}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-xs text-stone-400">
          <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
        </div>
      </div>

      {/* ── Two-column: type breakdown + top IPs ── */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Event type breakdown 24h */}
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <div className="mb-3 text-sm font-bold text-stone-700">過去 24h 事件類型分布</div>
          {summary.last24h.byType.length === 0 ? (
            <p className="py-4 text-center text-sm text-stone-400">目前無事件</p>
          ) : (
            <div className="space-y-2">
              {summary.last24h.byType.map((r) => (
                <div key={r.event_type} className="flex items-center gap-3">
                  <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${SEVERITY_BADGE[r.severity] ?? SEVERITY_BADGE.low}`}>
                    {r.severity}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-stone-600">
                    {EVENT_LABELS[r.event_type] ?? r.event_type}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className="h-full rounded-full bg-red-500"
                        style={{ width: `${Math.min(100, (r.count / (summary.last24h.total || 1)) * 100)}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-xs font-bold text-stone-700">{r.count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top IPs */}
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <div className="mb-3 text-sm font-bold text-stone-700">可疑 IP（7d 最多事件）</div>
          {topIps.length === 0 ? (
            <p className="py-4 text-center text-sm text-stone-400">目前無可疑 IP</p>
          ) : (
            <div className="space-y-2">
              {topIps.map((row) => (
                <div key={row.ip} className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-xs font-bold text-red-800">{row.ip}</code>
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
                      {row.count} 次
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-stone-500">
                    {row.event_types.split(",").map(t => EVENT_LABELS[t] ?? t).join(" · ")}
                  </div>
                  <div className="mt-0.5 text-xs text-stone-400">最近：{row.last_seen.slice(0, 16)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Tabbed: Recent events / Audit log ── */}
      <div className="rounded-2xl border border-stone-200 bg-white">
        <div className="flex gap-4 border-b border-stone-200 px-4">
          {(["events", "audit"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setActiveSection(s)}
              className={`py-3 text-sm font-bold transition-colors ${
                activeSection === s
                  ? "border-b-2 border-red-700 text-red-800"
                  : "border-b-2 border-transparent text-stone-400 hover:text-stone-700"
              }`}
            >
              {s === "events" ? `最近事件（${recentEvents.length}）` : `管理員操作記錄（${auditLogs.length}）`}
            </button>
          ))}
        </div>

        {activeSection === "events" && (
          <div className="divide-y divide-stone-100">
            {recentEvents.length === 0 ? (
              <p className="py-8 text-center text-sm text-stone-400">目前無資安事件記錄</p>
            ) : (
              recentEvents.map((ev) => (
                <div key={ev.id} className={`px-4 py-3 ${SEVERITY_ROW[ev.severity] ?? ""}`}>
                  <div className="flex flex-wrap items-start gap-2">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${SEVERITY_BADGE[ev.severity] ?? SEVERITY_BADGE.low}`}>
                      {ev.severity}
                    </span>
                    <span className="text-sm font-bold text-stone-800">
                      {EVENT_LABELS[ev.event_type] ?? ev.event_type}
                    </span>
                    <span className="ml-auto text-xs text-stone-400">{ev.created_at.slice(0, 16)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-stone-500">
                    {ev.ip && <span>IP: <code className="text-stone-700">{ev.ip}</code></span>}
                    {ev.path && <span>路徑: <code className="text-stone-700">{ev.path}</code></span>}
                    {ev.user_id && <span>使用者: <code className="text-stone-700">{ev.user_id}</code></span>}
                  </div>
                  {ev.details && (
                    <div className="mt-1 rounded bg-stone-100 px-2 py-1 font-mono text-xs text-stone-600">
                      {ev.details}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeSection === "audit" && (
          <div className="divide-y divide-stone-100">
            {auditLogs.length === 0 ? (
              <p className="py-8 text-center text-sm text-stone-400">目前無管理員操作記錄</p>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-stone-300 bg-stone-100 px-2 py-0.5 text-xs font-bold text-stone-700">
                      {log.action}
                    </span>
                    <span className="text-sm text-stone-800">{log.user_email}</span>
                    <span className="ml-auto text-xs text-stone-400">{log.created_at.slice(0, 16)}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-4 text-xs text-stone-500">
                    {log.target_type && <span>對象: {log.target_type}{log.target_id ? ` #${log.target_id}` : ""}</span>}
                    {log.ip && <span>IP: <code className="text-stone-600">{log.ip}</code></span>}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
