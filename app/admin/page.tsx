"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Database, ImagePlus, LogOut, Pencil, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import { GlyphImage, type GlyphLike } from "@/components/GlyphImage";
import { LogoMark } from "@/components/LogoMark";

type Stats = {
  totalGlyphs: number;
  totalChars: number;
  totalCollections: number;
  scripts: { label: string; count: number }[];
};

type GlyphDto = GlyphLike & {
  source?: string | null;
  license?: string | null;
  qualityScore?: number;
};

type GlyphResponse = {
  results: Record<string, GlyphDto[]>;
  total: number;
};

type CurrentUser = {
  email: string;
  name: string | null;
};

function onlyChinese(value: string) {
  return Array.from(value).filter((char) => /\p{Script=Han}/u.test(char)).join("");
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [keyword, setKeyword] = useState("");
  const [isComposingKeyword, setIsComposingKeyword] = useState(false);
  const [queryAuthor, setQueryAuthor] = useState("");
  const [queryScriptType, setQueryScriptType] = useState("");
  const [glyphs, setGlyphs] = useState<GlyphDto[]>([]);
  const [queryMessage, setQueryMessage] = useState("");
  const [activeChar, setActiveChar] = useState<string | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [deletingGlyphId, setDeletingGlyphId] = useState<number | null>(null);

  const glyphsByChar = useMemo(
    () =>
      glyphs.reduce<Record<string, GlyphDto[]>>((acc, glyph) => {
        acc[glyph.char] ??= [];
        acc[glyph.char].push(glyph);
        return acc;
      }, {}),
    [glyphs]
  );

  const charTabs = useMemo(() => {
    const keywordChars = [...new Set(Array.from(onlyChinese(keyword)).filter((char) => char.trim() !== ""))];
    const resultChars = Object.keys(glyphsByChar);
    const orderedKeywordChars = keywordChars.filter((char) => resultChars.includes(char));
    const extraChars = resultChars.filter((char) => !orderedKeywordChars.includes(char));
    return [...orderedKeywordChars, ...extraChars];
  }, [glyphsByChar, keyword]);

  const visibleGlyphs = activeChar ? glyphsByChar[activeChar] ?? [] : glyphs;
  const hasSearchKeyword = onlyChinese(keyword).length > 0;

  const scriptFilters = useMemo(
    () => ["", ...(stats?.scripts.filter((script) => script.count > 0).map((script) => script.label) ?? [])],
    [stats]
  );

  async function loadStats() {
    setIsStatsLoading(true);
    try {
      const res = await fetch("/api/admin/stats");
      if (res.status === 401) {
        window.location.href = `/api/auth/google?returnTo=${encodeURIComponent("/admin")}`;
        return;
      }
      if (res.status === 403) {
        setIsForbidden(true);
        return;
      }
      setStats(await res.json());
    } finally {
      setIsStatsLoading(false);
    }
  }

  function adminSearchPath(nextActiveChar = activeChar) {
    const params = new URLSearchParams();
    const cleanedKeyword = onlyChinese(keyword);
    if (cleanedKeyword) params.set("q", cleanedKeyword);
    if (queryAuthor) params.set("author", queryAuthor);
    if (queryScriptType) params.set("scriptType", queryScriptType);
    if (nextActiveChar) params.set("activeChar", nextActiveChar);
    const query = params.toString();
    return query ? `/admin?${query}` : "/admin";
  }

  function glyphEditHref(glyph: GlyphDto) {
    const params = new URLSearchParams();
    params.set("replaceGlyphId", String(glyph.id));
    params.set("returnTo", adminSearchPath(activeChar ?? glyph.char));
    return `/admin/upload?${params.toString()}`;
  }

  async function search(nextScriptType = queryScriptType, options?: { keyword?: string; author?: string; activeChar?: string | null }) {
    setQueryMessage("");
    const searchKeyword = options?.keyword ?? keyword;
    const searchAuthor = options?.author ?? queryAuthor;
    const cleanedKeyword = onlyChinese(searchKeyword);
    if (cleanedKeyword !== keyword) {
      setKeyword(cleanedKeyword);
    }
    if (!cleanedKeyword) {
      setGlyphs([]);
      setActiveChar(null);
      setQueryMessage("請先輸入至少一個中文字再查詢");
      return;
    }
    const params = new URLSearchParams();
    if (cleanedKeyword) params.set("q", cleanedKeyword);
    if (searchAuthor) params.set("author", searchAuthor);
    if (nextScriptType) params.set("scriptType", nextScriptType);
    setIsSearching(true);
    try {
      const res = await fetch(`/api/glyphs?${params.toString()}`);
      const json = (await res.json()) as GlyphResponse;
      const nextGlyphs = Object.values(json.results).flat();
      const keywordChars = [...new Set(Array.from(cleanedKeyword).filter((char) => char.trim() !== ""))];
      const resultChars = Object.keys(json.results);
      setGlyphs(nextGlyphs);
      setActiveChar((current) =>
        options?.activeChar && resultChars.includes(options.activeChar)
          ? options.activeChar
          : current && resultChars.includes(current)
          ? current
          : keywordChars.find((char) => resultChars.includes(char)) ?? resultChars[0] ?? null
      );
    } finally {
      setIsSearching(false);
    }
  }

  function clearSearchFilters() {
    setKeyword("");
    setQueryAuthor("");
    setQueryScriptType("");
    setGlyphs([]);
    setQueryMessage("");
    setActiveChar(null);
  }

  async function deleteGlyph(id: number) {
    if (!window.confirm(`確定刪除字圖 ID ${id}？相關集字作品中的這個字圖也會被移除。`)) return;

    setDeletingGlyphId(id);
    setQueryMessage("刪除中...");
    try {
      const res = await fetch(`/api/glyphs/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        setQueryMessage(json.error ?? "刪除失敗");
        return;
      }

      const nextGlyphs = glyphs.filter((glyph) => glyph.id !== id);
      setGlyphs(nextGlyphs);
      if (activeChar && !nextGlyphs.some((glyph) => glyph.char === activeChar)) {
        setActiveChar(nextGlyphs[0]?.char ?? null);
      }
      setQueryMessage(json.changes ? "已刪除字圖" : "找不到要刪除的字圖");
      await loadStats();
    } finally {
      setDeletingGlyphId(null);
    }
  }

  useEffect(() => {
    async function loadCurrentUser() {
      const res = await fetch("/api/auth/me");
      const json = (await res.json()) as { user: CurrentUser | null };
      setUser(json.user);
    }

    void loadCurrentUser();
    loadStats();

    const params = new URLSearchParams(window.location.search);
    const restoredKeyword = params.get("q") ?? "";
    const restoredAuthor = params.get("author") ?? "";
    const restoredScriptType = params.get("scriptType") ?? "";
    const restoredActiveChar = params.get("activeChar");
    if (restoredKeyword || restoredAuthor || restoredScriptType) {
      setKeyword(restoredKeyword);
      setQueryAuthor(restoredAuthor);
      setQueryScriptType(restoredScriptType);
      void search(restoredScriptType, {
        keyword: restoredKeyword,
        author: restoredAuthor,
        activeChar: restoredActiveChar,
      });
    }
  }, []);

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <LogoMark imageClassName="h-10 w-10 sm:h-12 sm:w-12" />
              <div className="min-w-0">
                <h1 className="font-serif text-xl font-bold sm:text-2xl">後台管理</h1>
                <p className="truncate text-xs text-stone-500 sm:text-sm">
                管理字圖資料、手動上傳、檢查資料庫數量{user ? `｜${user.email}` : ""}
                </p>
              </div>
            </div>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
            <form action="/api/auth/logout?returnTo=/" method="post" className="contents sm:block">
              <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700 hover:border-red-700 hover:text-stone-900 sm:px-4 sm:text-sm">
                <LogOut className="h-4 w-4" />
                登出
              </button>
            </form>
            <Link href="/" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-stone-800 px-3 py-2 text-xs font-bold text-white sm:px-4 sm:text-sm">
              <ArrowLeft className="h-4 w-4" />
              回前台
            </Link>
          </div>
        </div>
      </header>

      {isForbidden && (
        <div className="mx-auto mt-4 max-w-7xl px-3 sm:mt-6 sm:px-4">
          <div className="rounded-2xl border border-red-800 bg-red-950/50 p-4 text-center sm:p-6">
            <h2 className="mb-2 text-lg font-bold text-red-500 sm:text-xl">權限不足</h2>
            <p className="text-sm text-red-300 sm:text-base">
              您目前的帳號沒有後台管理權限，無法執行新增、修改、刪除等操作。
              若需權限請聯絡系統管理員將您的 Email 加入白名單。
            </p>
          </div>
        </div>
      )}

      <section className="mx-auto grid max-w-7xl gap-4 px-3 py-4 sm:px-4 sm:py-6 lg:grid-cols-[360px_1fr] lg:gap-6">
        <aside className="space-y-4 sm:space-y-6">
          <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:rounded-3xl sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold sm:text-xl">資料庫狀態</h2>
              <button
                onClick={loadStats}
                disabled={isStatsLoading}
                className="rounded-xl bg-stone-200 p-2 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="重新讀取資料庫狀態"
              >
                <RefreshCw className={`h-4 w-4 ${isStatsLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
            {stats ? (
              <div className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-3">
                <div className="rounded-2xl bg-stone-50 p-3 sm:p-4">
                  <div className="text-xs text-stone-500 sm:text-sm">字圖總數</div>
                  <div className="text-2xl font-bold sm:text-3xl">{stats.totalGlyphs}</div>
                </div>
                <div className="rounded-2xl bg-stone-50 p-3 sm:p-4">
                  <div className="text-xs text-stone-500 sm:text-sm">不同字數</div>
                  <div className="text-2xl font-bold sm:text-3xl">{stats.totalChars}</div>
                </div>
                <div className="rounded-2xl bg-stone-50 p-3 sm:p-4">
                  <div className="text-xs text-stone-500 sm:text-sm">集字作品</div>
                  <div className="text-2xl font-bold sm:text-3xl">{stats.totalCollections}</div>
                </div>
                <div className="col-span-3 rounded-2xl bg-stone-50 p-3 sm:p-4 lg:col-span-1">
                  <div className="mb-2 text-sm text-stone-500">書體分布</div>
                  <div className="space-y-2">
                    {stats.scripts.map((item) => (
                      <div key={item.label} className="flex justify-between text-sm">
                        <span>{item.label}</span>
                        <span className="text-stone-500">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : isStatsLoading ? (
              <div className="text-stone-500">讀取中...</div>
            ) : (
              <div className="text-stone-500">無法讀取資料庫狀態</div>
            )}
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:rounded-3xl sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <ImagePlus className="h-5 w-5 text-red-600" />
              <h2 className="text-lg font-bold sm:text-xl">手動上傳字圖</h2>
            </div>
            <p className="mb-4 text-sm leading-6 text-stone-600">
              上傳工具已移到獨立頁面，手機版會提供更大的預覽與擦除區，適合拍照後連續整理入庫。
            </p>
            <Link
              href="/admin/upload"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-800 px-4 py-3 font-bold text-white hover:bg-red-700"
            >
              <Upload className="h-4 w-4" />
              開啟連續上傳
            </Link>
          </section>
        </aside>

        <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:rounded-3xl sm:p-5">
          <div className="mb-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-red-600" />
              <h2 className="text-lg font-bold sm:text-xl">字庫查詢</h2>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void search();
              }}
              className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_180px_auto_auto]"
            >
              <input
                value={keyword}
                onCompositionStart={() => setIsComposingKeyword(true)}
                onCompositionEnd={(e) => {
                  setIsComposingKeyword(false);
                  setKeyword(onlyChinese(e.currentTarget.value));
                }}
                onChange={(e) => {
                  const nativeEvent = e.nativeEvent as InputEvent;
                  setKeyword(
                    isComposingKeyword || nativeEvent.isComposing
                      ? e.target.value
                      : onlyChinese(e.target.value)
                  );
                }}
                placeholder="輸入中文，例如：小橋流水"
                disabled={isSearching}
                className="rounded-xl border border-stone-300 bg-stone-50 px-3 py-3 outline-none focus:border-red-700 sm:py-2"
                autoComplete="off"
              />
              <input
                value={queryAuthor}
                onChange={(e) => setQueryAuthor(e.target.value)}
                placeholder="作者"
                disabled={isSearching}
                className="rounded-xl border border-stone-300 bg-stone-50 px-3 py-3 outline-none focus:border-red-700 sm:py-2"
              />
              <button
                type="submit"
                disabled={isSearching || !hasSearchKeyword}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-stone-800 px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
              >
                {isSearching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {isSearching ? "查詢中" : "查詢"}
              </button>
              <button
                type="button"
                onClick={clearSearchFilters}
                disabled={isSearching}
                className="min-h-11 rounded-xl border border-stone-300 px-4 py-2 font-bold text-stone-600 hover:border-zinc-500 hover:text-stone-900 sm:min-h-0"
              >
                清除
              </button>
            </form>
            <div className="overflow-x-auto">
              <div className="inline-flex min-w-full gap-2 rounded-2xl border border-stone-200 bg-stone-50 p-1">
                {scriptFilters.map((script) => {
                  const active = queryScriptType === script;
                  return (
                    <button
                      key={`admin-script-filter-${script || "all"}`}
                      type="button"
                      onClick={() => {
                        setQueryScriptType(script);
                        void search(script);
                      }}
                      disabled={!hasSearchKeyword || (isSearching && active)}
                      aria-pressed={active}
                      className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition ${
                        active
                          ? "bg-red-800 text-white"
                          : "text-stone-500 hover:bg-stone-200 hover:text-stone-800"
                      }`}
                    >
                      {script || "全部書體"}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {queryMessage && (
            <div className="mb-4 rounded-xl bg-stone-50 p-3 text-sm text-stone-600">
              {queryMessage}
            </div>
          )}

          <div className="relative min-h-[260px] sm:min-h-[280px]">
          {isSearching && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-white/80 backdrop-blur-sm">
              <div className="flex animate-pulse items-center gap-2 opacity-80">
                <img src="/glyphs/%E5%A2%A8/%E7%8E%8B%E9%90%B8_%E8%A1%8C_%E7%8E%8B%E9%90%B8%20%E8%A1%8C%E6%9B%B8_0001.gif" alt="墨" className="h-16 w-16 object-contain mix-blend-multiply" />
                <img src="/glyphs/%E8%BF%B9/%E7%8E%8B%E9%90%B8_%E8%A1%8C_%E7%8E%8B%E9%90%B8%20%E8%A1%8C%E6%9B%B8_0001.gif" alt="跡" className="h-16 w-16 object-contain mix-blend-multiply" />
              </div>
              <p className="mt-4 font-serif text-lg font-bold text-stone-600">查詢中...</p>
            </div>
          )}

          {glyphs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 sm:p-10 sm:text-base">
              {isSearching ? "正在讀取字圖..." : "輸入字後，進行查詢！"}
            </div>
          ) : (
            <>
              {charTabs.length > 0 && (
                <div className="mb-4 overflow-x-auto">
                  <div className="inline-flex min-w-full gap-2 rounded-2xl border border-stone-200 bg-stone-50 p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveChar(null);
                      }}
                      aria-pressed={activeChar === null}
                      className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition ${
                        activeChar === null
                          ? "bg-red-800 text-white"
                          : "text-stone-500 hover:bg-stone-200 hover:text-stone-800"
                      }`}
                    >
                      全部 {glyphs.length}
                    </button>
                    {charTabs.map((char) => {
                      const active = activeChar === char;
                      return (
                        <button
                          key={`admin-char-tab-${char}`}
                          type="button"
                          onClick={() => {
                            setActiveChar(char);
                          }}
                          aria-pressed={active}
                          className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition ${
                            active
                              ? "bg-red-800 text-white"
                              : "text-stone-500 hover:bg-stone-200 hover:text-stone-800"
                          }`}
                        >
                          {char} {glyphsByChar[char]?.length ?? 0}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-5">
              {visibleGlyphs.map((glyph) => (
                <div key={glyph.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-2 sm:p-3">
                  <GlyphImage glyph={glyph} size={108} containerClassName="h-[96px] w-full sm:h-[108px] sm:w-full" />
                  <div className="mt-2 text-sm font-medium">{glyph.char}｜{glyph.author || "佚名"}</div>
                  <div className="truncate text-xs text-stone-500">{glyph.scriptType || "未標註"}｜{glyph.workTitle || "未標題"}</div>
                  <div className="mt-1 truncate text-xs text-zinc-600">ID {glyph.id}</div>
                  <div className="mt-3 flex gap-2">
                        <Link
                          href={glyphEditHref(glyph)}
                          aria-disabled={isForbidden}
                          className={`inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-stone-300 px-2 py-2 text-sm font-bold ${
                            isForbidden
                              ? "pointer-events-none cursor-not-allowed text-stone-400 opacity-50"
                              : "text-stone-600 hover:border-red-700 hover:text-stone-900"
                          }`}
                        >
                          <Pencil className="h-4 w-4" />
                          修改
                        </Link>
                        <button
                          onClick={() => void deleteGlyph(glyph.id)}
                          disabled={isForbidden || deletingGlyphId === glyph.id}
                          className="inline-flex items-center justify-center rounded-lg border border-red-900/70 px-2 py-2 text-red-300 hover:border-red-500 hover:text-red-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-red-900/70 disabled:hover:text-red-300"
                        >
                          {deletingGlyphId === glyph.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                  </div>
                </div>
              ))}
              </div>
            </>
          )}
          </div>
        </section>
      </section>
    </main>
  );
}
