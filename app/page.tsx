"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Check, Database, Filter, Images, LogIn, LogOut, Search, Trash2 } from "lucide-react";
import { GlyphImage, type GlyphLike } from "@/components/GlyphImage";

type GlyphDto = GlyphLike & {
  source?: string | null;
  license?: string | null;
  qualityScore?: number;
};

type ApiResult = {
  query: string;
  chars: string[];
  results: Record<string, GlyphDto[]>;
  total: number;
};

type SelectedGlyph = GlyphDto & {
  position: number;
};

type ScriptResponse = {
  scripts: { label: string; count: number }[];
};

type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
};

function onlyChinese(value: string) {
  return Array.from(value).filter((char) => /\p{Script=Han}/u.test(char)).join("");
}

export default function FrontStagePage() {
  const [q, setQ] = useState("");
  const [isComposingQuery, setIsComposingQuery] = useState(false);
  const [author, setAuthor] = useState("");
  const [scriptType, setScriptType] = useState("");
  const [availableScripts, setAvailableScripts] = useState<string[]>([]);
  const [data, setData] = useState<ApiResult | null>(null);
  const [selected, setSelected] = useState<SelectedGlyph[]>([]);
  const [activePosition, setActivePosition] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isAdminVisible, setIsAdminVisible] = useState(false);
  const [logoClickCount, setLogoClickCount] = useState(0);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("loggedOut") === "1") {
      localStorage.removeItem("admin_revealed_at");
      setIsAdminVisible(false);
      setLogoClickCount(0);
      url.searchParams.delete("loggedOut");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      return;
    }

    const revealedAt = localStorage.getItem("admin_revealed_at");
    if (revealedAt) {
      const timeDiff = Date.now() - parseInt(revealedAt, 10);
      if (timeDiff < 60 * 60 * 1000) {
        setIsAdminVisible(true);
      } else {
        localStorage.removeItem("admin_revealed_at");
      }
    }
  }, []);

  const handleLogoClick = () => {
    const newCount = logoClickCount + 1;
    if (newCount >= 10) {
      setIsAdminVisible(true);
      localStorage.setItem("admin_revealed_at", Date.now().toString());
      setLogoClickCount(0);
    } else {
      setLogoClickCount(newCount);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_revealed_at");
    setIsAdminVisible(false);
    setLogoClickCount(0);
  };

  const queryChars = useMemo(
    () => [...new Set(Array.from(onlyChinese(q)).filter((c) => c.trim() !== ""))],
    [q]
  );

  const visibleChars = useMemo(
    () =>
      activePosition === null
        ? queryChars.map((char, index) => ({ char, index }))
        : queryChars[activePosition]
          ? [{ char: queryChars[activePosition], index: activePosition }]
          : [],
    [activePosition, queryChars]
  );

  const scriptFilters = useMemo(
    () => ["", ...availableScripts],
    [availableScripts]
  );

  useEffect(() => {
    async function loadCurrentUser() {
      const res = await fetch("/api/auth/me");
      const json = (await res.json()) as { user: CurrentUser | null };
      setUser(json.user);
    }

    void loadCurrentUser();
  }, []);

  useEffect(() => {
    async function loadAvailableScripts() {
      if (queryChars.length === 0) {
        setAvailableScripts([]);
        setScriptType("");
        return;
      }

      const params = new URLSearchParams({ q });
      if (author) params.set("author", author);

      const res = await fetch(`/api/glyphs/scripts?${params.toString()}`);
      const json = (await res.json()) as ScriptResponse;
      const scripts = json.scripts.map((script) => script.label);
      setAvailableScripts(scripts);
      setScriptType((current) => (current && !scripts.includes(current) ? "" : current));
    }

    void loadAvailableScripts();
  }, [author, q, queryChars.length]);

  async function searchGlyphs(nextScriptType = scriptType, preservePosition = false) {
    const cleanedQ = onlyChinese(q);
    if (cleanedQ !== q) {
      setQ(cleanedQ);
      setSelected([]);
      if (!preservePosition) setActivePosition(null);
    }

    setLoading(true);
    setMessage("");
    const params = new URLSearchParams({ q: cleanedQ });
    if (author) params.set("author", author);
    if (nextScriptType) params.set("scriptType", nextScriptType);

    const res = await fetch(`/api/glyphs?${params.toString()}`);
    const json = (await res.json()) as ApiResult;
    setData(json);
    setLoading(false);
  }

  function pickGlyph(glyph: GlyphDto, position: number) {
    setSelected((prev) => {
      const next = [...prev];
      const existingIndex = next.findIndex((item) => item.position === position);
      const chosen = { ...glyph, position };
      if (existingIndex >= 0) next[existingIndex] = chosen;
      else next.push(chosen);
      return next.sort((a, b) => a.position - b.position);
    });
  }

  function removeSelected(position: number) {
    setSelected((prev) => prev.filter((item) => item.position !== position));
  }

  function toggleActivePosition(position: number) {
    setActivePosition((prev) => (prev === position ? null : position));
    if (!data || data.query !== onlyChinese(q)) {
      void searchGlyphs(scriptType, true);
    }
  }

  async function saveCollection() {
    setMessage("");
    if (!user) {
      window.location.href = `/api/auth/google?returnTo=${encodeURIComponent("/")}`;
      return;
    }

    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: q,
        text: q,
        items: selected.map((item) => ({
          glyphId: item.id,
          char: item.char,
          position: item.position,
        })),
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      if (res.status === 401) {
        window.location.href = `/api/auth/google?returnTo=${encodeURIComponent("/")}`;
        return;
      }
      setMessage(json.error ?? "儲存失敗");
      return;
    }

    setMessage(`已儲存：${json.url}`);
  }

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <div 
              className="flex items-center -ml-2 cursor-pointer select-none"
              onClick={handleLogoClick}
              title={logoClickCount > 0 ? `距離解鎖還有 ${10 - logoClickCount} 步` : undefined}
            >
              <img src="/glyphs/%E5%A2%A8/%E7%8E%8B%E9%90%B8_%E8%A1%8C_%E7%8E%8B%E9%90%B8%20%E8%A1%8C%E6%9B%B8_0001.gif" alt="墨" className="h-12 w-12 object-contain mix-blend-multiply pointer-events-none" />
              <img src="/glyphs/%E8%BF%B9/%E7%8E%8B%E9%90%B8_%E8%A1%8C_%E7%8E%8B%E9%90%B8%20%E8%A1%8C%E6%9B%B8_0001.gif" alt="跡" className="h-12 w-12 object-contain mix-blend-multiply pointer-events-none" />
              <h1 className="sr-only">墨跡</h1>
            </div>
            <p className="text-sm font-medium text-stone-500">從字形到心境，重新認識書法之美</p>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <form action="/api/auth/logout?returnTo=/" method="post" onSubmit={handleLogout} className="flex items-center gap-2">
                <span className="hidden max-w-[220px] truncate text-sm text-stone-500 md:inline">
                  {user.email}
                </span>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-stone-900"
                >
                  <LogOut className="h-4 w-4" />
                  登出
                </button>
              </form>
            ) : (
              <Link
                href="/api/auth/google?returnTo=/"
                className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-stone-900"
              >
                <LogIn className="h-4 w-4" />
                Google 登入
              </Link>
            )}
            <Link
              href="/collections"
              className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-stone-900"
            >
              <Images className="h-4 w-4" />
              集字作品
            </Link>
            {isAdminVisible && (
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-xl bg-stone-800 px-4 py-2 text-sm font-bold text-white hover:bg-stone-900"
              >
                <Database className="h-4 w-4" />
                後台管理
              </Link>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-6">
        <div className="space-y-6">
          <section className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void searchGlyphs();
              }}
              className="grid gap-3 lg:grid-cols-[1fr_160px_auto]"
            >
              <label className="relative block">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-500" />
                <input
                  value={q}
                  onCompositionStart={() => setIsComposingQuery(true)}
                  onCompositionEnd={(e) => {
                    setIsComposingQuery(false);
                    const nextQ = onlyChinese(e.currentTarget.value);
                    setQ(nextQ);
                    setSelected([]);
                    setActivePosition(null);
                  }}
                  onChange={(e) => {
                    const nativeEvent = e.nativeEvent as InputEvent;
                    const nextQ =
                      isComposingQuery || nativeEvent.isComposing
                        ? e.target.value
                        : onlyChinese(e.target.value);
                    setQ(nextQ);
                    setSelected([]);
                    setActivePosition(null);
                  }}
                  className="w-full rounded-2xl border border-stone-300 bg-stone-50 py-3 pl-10 pr-4 text-lg outline-none focus:border-red-700"
                  placeholder="輸入中文，例如：小橋流水人家"
                  inputMode="text"
                  autoComplete="off"
                />
              </label>
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 outline-none focus:border-red-700"
                placeholder="作者"
              />
              <button
                type="submit"
                disabled={loading}
                className="rounded-2xl bg-red-800 px-6 py-3 font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? "搜尋中" : "搜尋"}
              </button>
            </form>
            <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-red-600" />
                  <div>
                    <h2 className="font-bold font-serif">目前集字</h2>
                    <p className="text-sm text-stone-500">點選單字可聚焦搜尋結果</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {activePosition !== null && (
                    <button
                      type="button"
                      onClick={() => setActivePosition(null)}
                      className="rounded-xl border border-stone-300 px-3 py-2 text-sm font-bold text-stone-600 hover:border-red-700 hover:text-stone-900"
                    >
                      顯示全部
                    </button>
                  )}
                  <button
                    onClick={saveCollection}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-800 px-3 py-2 text-sm font-bold text-white hover:bg-stone-900"
                  >
                    <Check className="h-4 w-4" />
                    儲存集字作品
                  </button>
                </div>
              </div>

              {queryChars.length === 0 ? (
                <p className="text-sm text-stone-500">請輸入文字。</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {queryChars.map((char, index) => {
                    const glyph = selected.find((item) => item.position === index);
                    const active = activePosition === index;
                    return (
                      <div key={`${char}-selected-${index}`} className="group relative">
                        <button
                          type="button"
                          onClick={() => toggleActivePosition(index)}
                          aria-pressed={active}
                          className={`rounded-xl border p-1 transition ${
                            active
                              ? "border-red-700 bg-red-700/10"
                              : "border-transparent hover:border-stone-400"
                          }`}
                        >
                          {glyph ? (
                            <GlyphImage glyph={glyph} size={110} />
                          ) : (
                            <div className="flex h-[110px] w-[110px] items-center justify-center rounded-xl border border-dashed border-stone-300 font-serif text-5xl text-zinc-600">
                              {char}
                            </div>
                          )}
                        </button>
                        {glyph && (
                          <button
                            onClick={() => removeSelected(index)}
                            className="absolute -right-2 -top-2 hidden rounded-full bg-red-500 p-1 group-hover:block"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {message && (
                <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-3 text-sm text-stone-600">
                  {message.startsWith("已儲存") ? (
                    <Link href={message.replace("已儲存：", "")} className="text-red-500 underline">
                      {message}
                    </Link>
                  ) : message}
                </div>
              )}
            </div>
            <div className="mt-3 overflow-x-auto">
              <div className="inline-flex min-w-full gap-2 rounded-2xl border border-stone-200 bg-stone-50 p-1">
                {scriptFilters.map((script) => {
                  const active = scriptType === script;
                  return (
                    <button
                      key={script || "all"}
                      type="button"
                      onClick={() => {
                        setScriptType(script);
                        void searchGlyphs(script);
                      }}
                      disabled={loading && active}
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
          </section>

          <section className="relative min-h-[400px] rounded-3xl border border-stone-200 bg-white p-4">
            {loading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-3xl bg-white/80 backdrop-blur-sm">
                <div className="flex animate-pulse items-center gap-2 opacity-80">
                  <img src="/glyphs/%E5%A2%A8/%E7%8E%8B%E9%90%B8_%E8%A1%8C_%E7%8E%8B%E9%90%B8%20%E8%A1%8C%E6%9B%B8_0001.gif" alt="墨" className="h-20 w-20 object-contain mix-blend-multiply" />
                  <img src="/glyphs/%E8%BF%B9/%E7%8E%8B%E9%90%B8_%E8%A1%8C_%E7%8E%8B%E9%90%B8%20%E8%A1%8C%E6%9B%B8_0001.gif" alt="跡" className="h-20 w-20 object-contain mix-blend-multiply" />
                </div>
                <p className="mt-4 font-serif text-lg font-bold tracking-widest text-stone-600">研墨中...</p>
              </div>
            )}
            <div className="mb-4 flex flex-wrap items-center gap-2 text-stone-600">
              <Filter className="h-5 w-5" />
              <span>搜尋結果</span>
              {data && (
                <>
                  <span className="text-sm text-stone-500">共 {data.total} 筆</span>
                  <span className="text-sm text-zinc-600">/</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {visibleChars.map(({ char }) => {
                      const count = data.results[char]?.length ?? 0;
                      return (
                        <span
                          key={`result-summary-${char}`}
                          className="rounded-lg bg-stone-50 px-2 py-1 text-sm text-stone-600"
                        >
                          {char} {count} 筆
                        </span>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {!data && (
              <div className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-stone-500">
                先按「搜尋」，系統會依每個字顯示可用的書法字圖。
              </div>
            )}

            {data && visibleChars.map(({ char, index }) => {
              const glyphs = data.results[char] ?? [];
              return (
                <div key={`${char}-${index}`} className="mb-6 last:mb-0">
                  {glyphs.length === 0 ? (
                    <div className="rounded-2xl bg-stone-50 p-6 text-stone-500">目前資料庫沒有這個字。</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                      {glyphs.map((glyph) => (
                        <button
                          key={glyph.id}
                          onClick={() => pickGlyph(glyph, index)}
                          className="rounded-2xl border border-stone-200 bg-stone-50 p-3 text-left hover:border-red-700"
                        >
                          <GlyphImage glyph={glyph} size={110} />
                          <div className="mt-2 text-sm font-medium text-stone-700">{glyph.author || "佚名"}</div>
                          <div className="truncate text-xs text-stone-500">{glyph.scriptType || "未標註"}｜{glyph.workTitle || "未標題"}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </div>
      </section>
    </main>
  );
}
