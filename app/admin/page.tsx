"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Database, ImagePlus, LogOut, Pencil, RefreshCw, Save, Search, Trash2, Upload, X } from "lucide-react";
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

type GlyphEditDraft = {
  char: string;
  author: string;
  scriptType: string;
  workTitle: string;
  source: string;
  license: string;
  qualityScore: string;
};

type CurrentUser = {
  email: string;
  name: string | null;
};

function onlyChinese(value: string) {
  return Array.from(value).filter((char) => /\p{Script=Han}/u.test(char)).join("");
}

const commonScriptTypes = ["篆", "隸", "楷", "行", "草", "未標註"];

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [keyword, setKeyword] = useState("");
  const [isComposingKeyword, setIsComposingKeyword] = useState(false);
  const [uploadChar, setUploadChar] = useState("");
  const [uploadAuthor, setUploadAuthor] = useState("");
  const [uploadScriptType, setUploadScriptType] = useState("");
  const [isComposingUploadChar, setIsComposingUploadChar] = useState(false);
  const [isComposingUploadAuthor, setIsComposingUploadAuthor] = useState(false);
  const [queryAuthor, setQueryAuthor] = useState("");
  const [queryScriptType, setQueryScriptType] = useState("");
  const [glyphs, setGlyphs] = useState<GlyphDto[]>([]);
  const [message, setMessage] = useState("");
  const [queryMessage, setQueryMessage] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<GlyphEditDraft | null>(null);
  const [activeChar, setActiveChar] = useState<string | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [savingGlyphId, setSavingGlyphId] = useState<number | null>(null);
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
        window.location.href = `/api/auth/google?returnTo=${encodeURIComponent("/admin")}`;
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

  async function search(nextScriptType = queryScriptType) {
    setQueryMessage("");
    setEditingId(null);
    setEditDraft(null);
    const cleanedKeyword = onlyChinese(keyword);
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
    if (queryAuthor) params.set("author", queryAuthor);
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
        current && resultChars.includes(current)
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
    setEditingId(null);
    setEditDraft(null);
    setActiveChar(null);
  }

  function startEdit(glyph: GlyphDto) {
    setEditingId(glyph.id);
    setEditDraft({
      char: glyph.char,
      author: glyph.author ?? "",
      scriptType: glyph.scriptType ?? "",
      workTitle: glyph.workTitle ?? "",
      source: glyph.source ?? "",
      license: glyph.license ?? "",
      qualityScore: String(glyph.qualityScore ?? 0),
    });
    setQueryMessage("");
  }

  function updateDraft(field: keyof GlyphEditDraft, value: string) {
    setEditDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function saveGlyph(id: number) {
    if (!editDraft) return;
    setSavingGlyphId(id);
    setQueryMessage("儲存中...");
    try {
      const res = await fetch(`/api/glyphs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editDraft,
          qualityScore: Number(editDraft.qualityScore || 0),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setQueryMessage(json.error ?? "儲存失敗");
        return;
      }

      setGlyphs((prev) =>
        prev.map((glyph) =>
          glyph.id === id
            ? {
                ...glyph,
                char: editDraft.char,
                author: editDraft.author || null,
                scriptType: editDraft.scriptType || null,
                workTitle: editDraft.workTitle || null,
                source: editDraft.source || null,
                license: editDraft.license || null,
                qualityScore: Number(editDraft.qualityScore || 0),
              }
            : glyph
        )
      );
      setEditingId(null);
      setEditDraft(null);
      setActiveChar(editDraft.char);
      setQueryMessage("已更新字圖資料");
      await loadStats();
    } finally {
      setSavingGlyphId(null);
    }
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
      if (editingId === id) {
        setEditingId(null);
        setEditDraft(null);
      }
      setQueryMessage(json.changes ? "已刪除字圖" : "找不到要刪除的字圖");
      await loadStats();
    } finally {
      setDeletingGlyphId(null);
    }
  }

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsUploading(true);
    setMessage("上傳中...");
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("char", onlyChinese(uploadChar).slice(0, 1));
    formData.set("author", onlyChinese(uploadAuthor));
    formData.set("scriptType", uploadScriptType === "未標註" ? "" : uploadScriptType);

    try {
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error ?? "上傳失敗");
        return;
      }

      setMessage(`已新增字圖 ID：${json.id}`);
      form.reset();
      setUploadChar("");
      setUploadAuthor("");
      setUploadScriptType("");
      await loadStats();
    } finally {
      setIsUploading(false);
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
  }, []);

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <LogoMark />
            <div>
              <h1 className="text-2xl font-bold font-serif">後台管理</h1>
              <p className="text-sm text-stone-500">
                管理字圖資料、手動上傳、檢查資料庫數量{user ? `｜${user.email}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <form action="/api/auth/logout?returnTo=/" method="post">
              <button className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-stone-900">
                <LogOut className="h-4 w-4" />
                登出
              </button>
            </form>
            <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-stone-800 px-4 py-2 text-sm font-bold text-white">
              <ArrowLeft className="h-4 w-4" />
              回前台
            </Link>
          </div>
        </div>
      </header>

      {isForbidden && (
        <div className="mx-auto mt-6 max-w-7xl px-4">
          <div className="rounded-2xl border border-red-800 bg-red-950/50 p-6 text-center">
            <h2 className="text-xl font-bold text-red-500 mb-2">權限不足</h2>
            <p className="text-red-300">
              您目前的帳號沒有後台管理權限，無法執行新增、修改、刪除等操作。
              若需權限請聯絡系統管理員將您的 Email 加入白名單。
            </p>
          </div>
        </div>
      )}

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-6">
          <section className="rounded-3xl border border-stone-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">資料庫狀態</h2>
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
              <div className="grid gap-3">
                <div className="rounded-2xl bg-stone-50 p-4">
                  <div className="text-sm text-stone-500">字圖總數</div>
                  <div className="text-3xl font-bold">{stats.totalGlyphs}</div>
                </div>
                <div className="rounded-2xl bg-stone-50 p-4">
                  <div className="text-sm text-stone-500">不同字數</div>
                  <div className="text-3xl font-bold">{stats.totalChars}</div>
                </div>
                <div className="rounded-2xl bg-stone-50 p-4">
                  <div className="text-sm text-stone-500">集字作品</div>
                  <div className="text-3xl font-bold">{stats.totalCollections}</div>
                </div>
                <div className="rounded-2xl bg-stone-50 p-4">
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

          <section className="rounded-3xl border border-stone-200 bg-white p-5">
            <div className="mb-4 flex items-center gap-2">
              <ImagePlus className="h-5 w-5 text-red-600" />
              <h2 className="text-xl font-bold">手動上傳字圖</h2>
            </div>
            <form onSubmit={upload} className="space-y-3">
              <input
                name="char"
                required
                value={uploadChar}
                onCompositionStart={() => setIsComposingUploadChar(true)}
                onCompositionEnd={(e) => {
                  setIsComposingUploadChar(false);
                  setUploadChar(onlyChinese(e.currentTarget.value).slice(0, 1));
                }}
                onChange={(e) => {
                  const nativeEvent = e.nativeEvent as InputEvent;
                  const nextValue =
                    isComposingUploadChar || nativeEvent.isComposing
                      ? e.target.value
                      : onlyChinese(e.target.value).slice(0, 1);
                  setUploadChar(nextValue);
                }}
                placeholder="單字，例如：小"
                disabled={isUploading}
                className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 outline-none focus:border-red-700"
                autoComplete="off"
              />
              <input
                name="author"
                value={uploadAuthor}
                onCompositionStart={() => setIsComposingUploadAuthor(true)}
                onCompositionEnd={(e) => {
                  setIsComposingUploadAuthor(false);
                  setUploadAuthor(onlyChinese(e.currentTarget.value));
                }}
                onChange={(e) => {
                  const nativeEvent = e.nativeEvent as InputEvent;
                  setUploadAuthor(
                    isComposingUploadAuthor || nativeEvent.isComposing
                      ? e.target.value
                      : onlyChinese(e.target.value)
                  );
                }}
                placeholder="作者，例如：孫過庭"
                disabled={isUploading}
                className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 outline-none focus:border-red-700"
                autoComplete="off"
              />
              <select
                name="scriptType"
                value={uploadScriptType}
                onChange={(e) => setUploadScriptType(e.target.value)}
                disabled={isUploading}
                className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 outline-none focus:border-red-700"
              >
                <option value="">書體</option>
                {uploadScriptOptions.map((scriptType) => (
                  <option key={scriptType} value={scriptType}>
                    {scriptType}
                  </option>
                ))}
              </select>
              <input name="workTitle" placeholder="作品，例如：書譜" disabled={isUploading} className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 outline-none focus:border-red-700 disabled:opacity-70" />
              <input name="source" placeholder="來源，例如：local-dataset" disabled={isUploading} className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 outline-none focus:border-red-700 disabled:opacity-70" />
              <input name="license" placeholder="授權，例如：non-commercial-research" disabled={isUploading} className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 outline-none focus:border-red-700 disabled:opacity-70" />
              <input name="qualityScore" type="number" defaultValue="0" placeholder="品質分數(排序用)" disabled={isUploading} className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 outline-none focus:border-red-700 disabled:opacity-70" />
              <input name="file" required type="file" accept="image/*,.svg" disabled={isUploading} className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-sm disabled:opacity-70" />
              <button disabled={isForbidden || isUploading} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-800 px-4 py-3 font-bold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-800 text-white">
                {isUploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {isUploading ? "上傳中" : "上傳並寫入資料庫"}
              </button>
              {message && <div className="rounded-xl bg-stone-50 p-3 text-sm text-stone-600">{message}</div>}
            </form>
          </section>
        </aside>

        <section className="rounded-3xl border border-stone-200 bg-white p-5">
          <div className="mb-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-red-600" />
              <h2 className="text-xl font-bold">字庫查詢</h2>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void search();
              }}
              className="grid gap-2 lg:grid-cols-[1fr_180px_auto_auto]"
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
                className="rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 outline-none focus:border-red-700"
                autoComplete="off"
              />
              <input
                value={queryAuthor}
                onChange={(e) => setQueryAuthor(e.target.value)}
                placeholder="作者"
                disabled={isSearching}
                className="rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 outline-none focus:border-red-700"
              />
              <button
                type="submit"
                disabled={isSearching || !hasSearchKeyword}
                className="inline-flex items-center gap-2 rounded-xl bg-stone-800 px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSearching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {isSearching ? "查詢中" : "查詢"}
              </button>
              <button
                type="button"
                onClick={clearSearchFilters}
                disabled={isSearching}
                className="rounded-xl border border-stone-300 px-4 py-2 font-bold text-stone-600 hover:border-zinc-500 hover:text-stone-900"
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

          <div className="relative min-h-[280px]">
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
            <div className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-stone-500">
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
                        setEditingId(null);
                        setEditDraft(null);
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
                            setEditingId(null);
                            setEditDraft(null);
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
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {visibleGlyphs.map((glyph) => (
                <div key={glyph.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
                  <GlyphImage glyph={glyph} size={108} />
                  {editingId === glyph.id && editDraft ? (
                    <div className="mt-3 space-y-2">
                      <input
                        value={editDraft.char}
                        onChange={(e) => updateDraft("char", e.target.value)}
                        maxLength={2}
                        className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm outline-none focus:border-red-700"
                        placeholder="字"
                      />
                      <input
                        value={editDraft.author}
                        onChange={(e) => updateDraft("author", e.target.value)}
                        className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm outline-none focus:border-red-700"
                        placeholder="作者"
                      />
                      <input
                        value={editDraft.scriptType}
                        onChange={(e) => updateDraft("scriptType", e.target.value)}
                        className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm outline-none focus:border-red-700"
                        placeholder="書體"
                      />
                      <input
                        value={editDraft.workTitle}
                        onChange={(e) => updateDraft("workTitle", e.target.value)}
                        className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm outline-none focus:border-red-700"
                        placeholder="作品"
                      />
                      <input
                        value={editDraft.source}
                        onChange={(e) => updateDraft("source", e.target.value)}
                        className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm outline-none focus:border-red-700"
                        placeholder="來源"
                      />
                      <input
                        value={editDraft.license}
                        onChange={(e) => updateDraft("license", e.target.value)}
                        className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm outline-none focus:border-red-700"
                        placeholder="授權"
                      />
                      <input
                        value={editDraft.qualityScore}
                        onChange={(e) => updateDraft("qualityScore", e.target.value)}
                        type="number"
                        className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm outline-none focus:border-red-700"
                        placeholder="品質分數(排序用)"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => void saveGlyph(glyph.id)}
                          disabled={savingGlyphId === glyph.id}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-red-800 px-2 py-2 text-sm font-bold hover:bg-red-700 text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {savingGlyphId === glyph.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          {savingGlyphId === glyph.id ? "儲存中" : "儲存"}
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditDraft(null);
                          }}
                          disabled={savingGlyphId === glyph.id}
                          className="inline-flex items-center justify-center rounded-lg border border-stone-300 px-2 py-2 text-stone-600 hover:border-zinc-500"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-2 text-sm font-medium">{glyph.char}｜{glyph.author || "佚名"}</div>
                      <div className="truncate text-xs text-stone-500">{glyph.scriptType || "未標註"}｜{glyph.workTitle || "未標題"}</div>
                      <div className="mt-1 truncate text-xs text-zinc-600">ID {glyph.id}</div>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => startEdit(glyph)}
                          disabled={isForbidden}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-stone-300 px-2 py-2 text-sm font-bold text-stone-600 hover:border-red-700 hover:text-stone-900 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-stone-300 disabled:hover:text-stone-600"
                        >
                          <Pencil className="h-4 w-4" />
                          修改
                        </button>
                        <button
                          onClick={() => void deleteGlyph(glyph.id)}
                          disabled={isForbidden || deletingGlyphId === glyph.id}
                          className="inline-flex items-center justify-center rounded-lg border border-red-900/70 px-2 py-2 text-red-300 hover:border-red-500 hover:text-red-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-red-900/70 disabled:hover:text-red-300"
                        >
                          {deletingGlyphId === glyph.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </div>
                    </>
                  )}
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
