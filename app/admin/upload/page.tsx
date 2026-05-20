"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ImagePlus, LogOut, RefreshCw } from "lucide-react";
import { AdminGlyphUploadForm } from "@/components/AdminGlyphUploadForm";
import { LogoMark } from "@/components/LogoMark";

type Stats = {
  scripts: { label: string; count: number }[];
};

type CurrentUser = {
  email: string;
  name: string | null;
};

const commonScriptTypes = ["篆", "隸", "楷", "行", "草", "未標註"];

export default function AdminUploadPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [message, setMessage] = useState("");
  const [isForbidden, setIsForbidden] = useState(false);
  const [isStatsLoading, setIsStatsLoading] = useState(true);

  const uploadScriptOptions = useMemo(
    () => [
      ...new Set([
        ...commonScriptTypes,
        ...(stats?.scripts
          .map((script) => script.label)
          .filter((label) => label && label !== "未標註") ?? []),
      ]),
    ],
    [stats]
  );

  async function loadStats() {
    setIsStatsLoading(true);
    try {
      const res = await fetch("/api/admin/stats");
      if (res.status === 401) {
        window.location.href = `/api/auth/google?returnTo=${encodeURIComponent("/admin/upload")}`;
        return;
      }
      if (res.status === 403) {
        setIsForbidden(true);
        setMessage("此帳號沒有後台權限");
        return;
      }
      setStats(await res.json());
    } finally {
      setIsStatsLoading(false);
    }
  }

  useEffect(() => {
    async function loadCurrentUser() {
      const res = await fetch("/api/auth/me");
      const json = (await res.json()) as { user: CurrentUser | null };
      setUser(json.user);
    }

    void loadCurrentUser();
    void loadStats();
  }, []);

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <LogoMark imageClassName="h-10 w-10 sm:h-12 sm:w-12" />
            <div className="min-w-0">
              <h1 className="font-serif text-xl font-bold sm:text-2xl">手動上傳字圖</h1>
              <p className="truncate text-xs text-stone-500 sm:text-sm">
                轉黑白、調整解析度、簡易擦除後存入 Blob{user ? `｜${user.email}` : ""}
              </p>
            </div>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
            <form action="/api/auth/logout?returnTo=/" method="post" className="contents sm:block">
              <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700 hover:border-red-700 hover:text-stone-900 sm:px-4 sm:text-sm">
                <LogOut className="h-4 w-4" />
                登出
              </button>
            </form>
            <Link href="/admin" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-stone-800 px-3 py-2 text-xs font-bold text-white sm:px-4 sm:text-sm">
              <ArrowLeft className="h-4 w-4" />
              回後台
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-6">
        {isForbidden && (
          <div className="mb-4 rounded-2xl border border-red-800 bg-red-950/50 p-4 text-center sm:p-6">
            <h2 className="mb-2 text-lg font-bold text-red-500 sm:text-xl">權限不足</h2>
            <p className="text-sm text-red-300 sm:text-base">
              您目前的帳號沒有後台管理權限，無法執行新增、修改、刪除等操作。
            </p>
          </div>
        )}

        <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:rounded-3xl sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <ImagePlus className="h-5 w-5 shrink-0 text-red-600" />
              <h2 className="truncate text-lg font-bold sm:text-xl">連續上傳</h2>
            </div>
            <button
              onClick={() => void loadStats()}
              disabled={isStatsLoading}
              className="rounded-xl bg-stone-200 p-2 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="重新讀取書體選項"
            >
              <RefreshCw className={`h-4 w-4 ${isStatsLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
          {message && <div className="mb-4 rounded-xl bg-stone-50 p-3 text-sm text-stone-600">{message}</div>}
          <AdminGlyphUploadForm
            scriptOptions={uploadScriptOptions}
            isForbidden={isForbidden}
            onUploaded={loadStats}
          />
        </section>
      </section>
    </main>
  );
}
