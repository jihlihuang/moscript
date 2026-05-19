"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BookOpen, Check, CheckCircle2, Database, ExternalLink, Filter, Images, LogIn, LogOut, RefreshCw, Search, Trash2 } from "lucide-react";
import { GlyphImage, type GlyphLike } from "@/components/GlyphImage";
import { LogoMark } from "@/components/LogoMark";

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

type CollectionSavePayload = {
  title: string;
  text: string;
  author?: string;
  scriptType?: string;
  selectedGlyphs?: SelectedGlyph[];
  items: {
    glyphId: number;
    char: string;
    position: number;
  }[];
};

const pendingCollectionKey = "moscript_pending_collection";

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
  const [isSavingCollection, setIsSavingCollection] = useState(false);
  const [message, setMessage] = useState("");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [isAdminVisible, setIsAdminVisible] = useState(false);
  const [logoClickCount, setLogoClickCount] = useState(0);
  const pendingSaveStartedRef = useRef(false);
  const collectionLoadStartedRef = useRef(false);

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

  const saveResult = useMemo(() => {
    if (message.startsWith("已儲存：")) {
      return {
        type: "saved" as const,
        url: message.replace("已儲存：", ""),
        title: "集字作品已儲存",
        description: "已建立新的集字作品，可以前往作品頁查看完整內容。",
      };
    }
    if (message.startsWith("已存在：")) {
      return {
        type: "duplicate" as const,
        url: message.replace("已存在：", ""),
        title: "這份集字作品已存在",
        description: "系統找到相同文字與相同字圖選擇，已為你保留原本那一筆。",
      };
    }
    return null;
  }, [message]);

  useEffect(() => {
    async function loadCurrentUser() {
      const res = await fetch("/api/auth/me");
      const json = (await res.json()) as { user: CurrentUser | null };
      setUser(json.user);
      setIsAuthChecked(true);
    }

    void loadCurrentUser();
  }, []);

  useEffect(() => {
    if (!isAuthChecked || !user || pendingSaveStartedRef.current) return;

    const rawPendingCollection = localStorage.getItem(pendingCollectionKey);
    if (!rawPendingCollection) return;

    try {
      const payload = JSON.parse(rawPendingCollection) as CollectionSavePayload;
      if (!payload.text || payload.items.length === 0) {
        localStorage.removeItem(pendingCollectionKey);
        return;
      }

      pendingSaveStartedRef.current = true;
      restoreWorkspaceFromPayload(payload);
      setMessage("登入完成，正在儲存集字作品...");
      void saveCollectionPayload(payload, { clearPendingOnSuccess: true });
    } catch {
      localStorage.removeItem(pendingCollectionKey);
    }
  }, [isAuthChecked, user]);

  useEffect(() => {
    if (!isAuthChecked || collectionLoadStartedRef.current) return;

    const url = new URL(window.location.href);
    const collectionId = url.searchParams.get("collectionId");
    if (!collectionId) return;

    if (!user) {
      window.location.href = `/api/auth/google?returnTo=${encodeURIComponent(`/?collectionId=${collectionId}`)}`;
      return;
    }

    collectionLoadStartedRef.current = true;
    void loadCollectionToWorkspace(collectionId);
  }, [isAuthChecked, user]);

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

  function restoreWorkspaceFromPayload(payload: CollectionSavePayload) {
    setQ(payload.text);
    setAuthor(payload.author ?? "");
    setScriptType(payload.scriptType ?? "");
    setSelected(payload.selectedGlyphs ?? []);
    setActivePosition(null);
  }

  async function loadCollectionToWorkspace(collectionId: string) {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`/api/collections/${collectionId}`);
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error ?? "載入集字作品失敗");
        return;
      }

      const selectedGlyphs = json.items.map((item: {
        position: number;
        char: string;
        glyph_id: number;
        author: string | null;
        script_type: string | null;
        work_title: string | null;
        image_url: string;
        source: string | null;
        license: string | null;
      }) => ({
        id: item.glyph_id,
        char: item.char,
        imageUrl: item.image_url,
        author: item.author,
        scriptType: item.script_type,
        workTitle: item.work_title,
        source: item.source,
        license: item.license,
        position: item.position,
      }));
      const loadedScriptType = selectedGlyphs[0]?.scriptType ?? "";
      setQ(json.collection.text);
      setAuthor("");
      setScriptType(loadedScriptType);
      setSelected(selectedGlyphs);
      setActivePosition(null);
      setMessage("已載入集字作品，可繼續查詢或調整字圖");

      const url = new URL(window.location.href);
      url.searchParams.delete("collectionId");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    } finally {
      setLoading(false);
    }
  }

  async function saveCollectionPayload(
    payload: CollectionSavePayload,
    options: { clearPendingOnSuccess?: boolean } = {}
  ) {
    setIsSavingCollection(true);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.setItem(pendingCollectionKey, JSON.stringify(payload));
          window.location.href = `/api/auth/google?returnTo=${encodeURIComponent("/")}`;
          return;
        }
        setMessage(json.error ?? "儲存失敗");
        return;
      }

      if (options.clearPendingOnSuccess) {
        localStorage.removeItem(pendingCollectionKey);
      }
      setMessage(json.duplicate ? `已存在：${json.url}` : `已儲存：${json.url}`);
    } finally {
      setIsSavingCollection(false);
    }
  }

  async function saveCollection() {
    if (isSavingCollection) return;
    const payload: CollectionSavePayload = {
      title: q,
      text: q,
      author,
      scriptType,
      selectedGlyphs: selected,
      items: selected.map((item) => ({
        glyphId: item.id,
        char: item.char,
        position: item.position,
      })),
    };

    setMessage("");
    if (!user) {
      localStorage.setItem(pendingCollectionKey, JSON.stringify(payload));
      setMessage("請先登入，登入完成後會自動儲存集字作品...");
      window.location.href = `/api/auth/google?returnTo=${encodeURIComponent("/")}`;
      return;
    }

    await saveCollectionPayload(payload);
  }

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <LogoMark
                onClick={handleLogoClick}
                title={logoClickCount > 0 ? `距離解鎖還有 ${10 - logoClickCount} 步` : undefined}
              />
              <div>
                <h1 className="sr-only">墨跡</h1>
                <p className="text-sm font-medium text-stone-500">從字形到心境，重新認識書法之美</p>
              </div>
            </div>
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
                    disabled={isSavingCollection}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-800 px-3 py-2 text-sm font-bold text-white hover:bg-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSavingCollection ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {isSavingCollection ? "儲存中" : "儲存集字作品"}
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
                saveResult ? (
                  <div
                    className={`mt-3 rounded-2xl border p-4 shadow-sm ${
                      saveResult.type === "duplicate"
                        ? "border-amber-300 bg-amber-50 text-amber-950"
                        : "border-emerald-300 bg-emerald-50 text-emerald-950"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 rounded-full p-2 ${
                            saveResult.type === "duplicate"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {saveResult.type === "duplicate" ? (
                            <AlertTriangle className="h-5 w-5" />
                          ) : (
                            <CheckCircle2 className="h-5 w-5" />
                          )}
                        </div>
                        <div>
                          <div className="font-bold">{saveResult.title}</div>
                          <p className="mt-1 text-sm opacity-80">{saveResult.description}</p>
                        </div>
                      </div>
                      <Link
                        href={saveResult.url}
                        className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white ${
                          saveResult.type === "duplicate"
                            ? "bg-amber-700 hover:bg-amber-800"
                            : "bg-emerald-700 hover:bg-emerald-800"
                        }`}
                      >
                        查看作品
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-3 text-sm text-stone-600">
                    {message}
                  </div>
                )
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
