"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ImagePlus, RefreshCw } from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";
import { AdminGlyphUploadForm, type ReplaceGlyphTarget } from "@/components/AdminGlyphUploadForm";
import { LogoMark } from "@/components/LogoMark";

type Stats = {
  scripts: { label: string; count: number }[];
};

type CurrentUser = {
  email: string;
  name: string | null;
};

const commonScriptTypes = ["草", "行", "隸", "楷"];
const unknownScriptLabels = new Set(["未標註", "未知書體"]);
const preferredScriptOrder = ["草", "行", "隸", "楷"];

function isUnknownScriptLabel(label: string) {
  return unknownScriptLabels.has(label.trim());
}

function sortScriptLabels(labels: string[]) {
  function rank(label: string) {
    if (isUnknownScriptLabel(label)) return 999;
    const index = preferredScriptOrder.findIndex((script) => label.includes(script));
    return index >= 0 ? index : 100;
  }

  return [...labels].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "zh-Hant"));
}

export default function AdminUploadPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [message, setMessage] = useState("");
  const [isForbidden, setIsForbidden] = useState(false);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [replaceGlyphId, setReplaceGlyphId] = useState<string | null>(null);
  const [replaceGlyph, setReplaceGlyph] = useState<ReplaceGlyphTarget | null>(null);
  const [isReplaceGlyphLoading, setIsReplaceGlyphLoading] = useState(false);
  const [backHref, setBackHref] = useState("/admin");
  const isReplaceMode = Boolean(replaceGlyphId);

  const uploadScriptOptions = useMemo(
    () => {
      const labels = [
        ...commonScriptTypes,
        ...(stats?.scripts.map((script) => script.label).filter(Boolean) ?? []),
        "未標註",
      ];
      return sortScriptLabels([...new Set(labels)]);
    },
    [stats]
  );

  async function loadStats() {
    setIsStatsLoading(true);
    try {
      const res = await fetch("/api/admin/stats");
      if (res.status === 401) {
        window.location.href = `/api/auth/google?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
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

  async function loadReplaceGlyph(id: string) {
    setIsReplaceGlyphLoading(true);
    setMessage("讀取要替換的字圖資料...");
    try {
      const res = await fetch(`/api/glyphs/${id}`);
      if (res.status === 401) {
        window.location.href = `/api/auth/google?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        return;
      }
      if (res.status === 403) {
        setIsForbidden(true);
        setMessage("此帳號沒有後台權限");
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error ?? "讀取字圖失敗");
        setReplaceGlyph(null);
        return;
      }
      setReplaceGlyph(json);
      setMessage("");
    } finally {
      setIsReplaceGlyphLoading(false);
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

    const params = new URLSearchParams(window.location.search);
    const id = params.get("replaceGlyphId");
    const returnTo = params.get("returnTo");
    if (returnTo?.startsWith("/admin")) {
      setBackHref(returnTo);
    }
    setReplaceGlyphId(id);
    if (id) {
      void loadReplaceGlyph(id);
    }
  }, []);

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <LogoMark imageClassName="h-9 w-9 sm:h-12 sm:w-12" />
            <div className="min-w-0">
              <h1 className="truncate font-serif text-xl font-bold sm:text-2xl">
                {isReplaceMode ? "重新上傳字圖" : "手動上傳字圖"}
              </h1>
              <p className="truncate text-xs text-stone-500 sm:text-sm">
                轉黑白、調整解析度、簡易擦除後以 Canvas 結果存檔{user ? `｜${user.email}` : ""}
              </p>
            </div>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
            <Link href={backHref} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-stone-800 px-3 py-2 text-xs font-bold text-white sm:px-4 sm:text-sm">
              <ArrowLeft className="h-4 w-4" />
              回後台
            </Link>
            <LogoutButton
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700 hover:border-red-700 hover:text-stone-900 sm:px-4 sm:text-sm"
            />
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
              <h2 className="truncate text-lg font-bold sm:text-xl">
                {isReplaceMode ? `替換 ${replaceGlyph?.char ?? ""} 字圖圖片` : "連續上傳"}
              </h2>
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
          {isReplaceMode && isReplaceGlyphLoading ? (
            <div className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-stone-500">
              讀取字圖資料中...
            </div>
          ) : isReplaceMode && !replaceGlyph ? (
            <div className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-stone-500">
              找不到要替換的字圖，請回後台重新選擇。
            </div>
          ) : (
            <AdminGlyphUploadForm
              scriptOptions={uploadScriptOptions}
              isForbidden={isForbidden}
              onUploaded={isReplaceMode ? undefined : loadStats}
              replaceGlyph={replaceGlyph}
            />
          )}
        </section>
      </section>
    </main>
  );
}
