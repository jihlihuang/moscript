"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Database, ImagePlus, LogOut, Pencil, RefreshCw, Save, Search, Trash2, Upload, X } from "lucide-react";
import { GlyphImage, type GlyphLike } from "@/components/GlyphImage";

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
  }

  async function search(nextScriptType = queryScriptType) {
    setQueryMessage("");
    setEditingId(null);
    setEditDraft(null);
    const cleanedKeyword = onlyChinese(keyword);
    if (cleanedKeyword !== keyword) {
      setKeyword(cleanedKeyword);
    }
    const params = new URLSearchParams();
    if (cleanedKeyword) params.set("q", cleanedKeyword);
    if (queryAuthor) params.set("author", queryAuthor);
    if (nextScriptType) params.set("scriptType", nextScriptType);
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
    setQueryMessage("儲存中...");
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
  }

  async function deleteGlyph(id: number) {
    if (!window.confirm(`確定刪除字圖 ID ${id}？相關集字作品中的這個字圖也會被移除。`)) return;

    setQueryMessage("刪除中...");
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
  }

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("上傳中...");
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("char", onlyChinese(uploadChar).slice(0, 1));
    formData.set("author", onlyChinese(uploadAuthor));
    formData.set("scriptType", uploadScriptType === "未標註" ? "" : uploadScriptType);

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
    <main className="min-h-screen bg-[#0f1012] text-zinc-50">
      <header className="border-b border-zinc-800 bg-[#15171a]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-2xl font-bold">MoScript 後台</h1>
            <p className="text-sm text-zinc-400">
              管理字圖資料、手動上傳、檢查資料庫數量{user ? `｜${user.email}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <form action="/api/auth/logout?returnTo=/" method="post">
              <button className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2 text-sm font-bold text-zinc-200 hover:border-fuchsia-500 hover:text-white">
                <LogOut className="h-4 w-4" />
                登出
              </button>
            </form>
            <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-950">
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
          <section className="rounded-3xl border border-zinc-800 bg-[#181a1f] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">資料庫狀態</h2>
              <button onClick={loadStats} className="rounded-xl bg-zinc-900 p-2 hover:bg-zinc-800">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            {stats ? (
              <div className="grid gap-3">
                <div className="rounded-2xl bg-zinc-950 p-4">
                  <div className="text-sm text-zinc-500">字圖總數</div>
                  <div className="text-3xl font-bold">{stats.totalGlyphs}</div>
                </div>
                <div className="rounded-2xl bg-zinc-950 p-4">
                  <div className="text-sm text-zinc-500">不同字數</div>
                  <div className="text-3xl font-bold">{stats.totalChars}</div>
                </div>
                <div className="rounded-2xl bg-zinc-950 p-4">
                  <div className="text-sm text-zinc-500">集字作品</div>
                  <div className="text-3xl font-bold">{stats.totalCollections}</div>
                </div>
                <div className="rounded-2xl bg-zinc-950 p-4">
                  <div className="mb-2 text-sm text-zinc-500">書體分布</div>
                  <div className="space-y-2">
                    {stats.scripts.map((item) => (
                      <div key={item.label} className="flex justify-between text-sm">
                        <span>{item.label}</span>
                        <span className="text-zinc-400">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-zinc-500">讀取中...</div>
            )}
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-[#181a1f] p-5">
            <div className="mb-4 flex items-center gap-2">
              <ImagePlus className="h-5 w-5 text-fuchsia-400" />
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
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-fuchsia-500"
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
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-fuchsia-500"
                autoComplete="off"
              />
              <select
                name="scriptType"
                value={uploadScriptType}
                onChange={(e) => setUploadScriptType(e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-fuchsia-500"
              >
                <option value="">書體</option>
                {uploadScriptOptions.map((scriptType) => (
                  <option key={scriptType} value={scriptType}>
                    {scriptType}
                  </option>
                ))}
              </select>
              <input name="workTitle" placeholder="作品，例如：書譜" className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-fuchsia-500" />
              <input name="source" placeholder="來源，例如：local-dataset" className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-fuchsia-500" />
              <input name="license" placeholder="授權，例如：non-commercial-research" className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-fuchsia-500" />
              <input name="qualityScore" type="number" defaultValue="0" placeholder="品質分數(排序用)" className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-fuchsia-500" />
              <input name="file" required type="file" accept="image/*,.svg" className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
              <button disabled={isForbidden} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-fuchsia-600 px-4 py-3 font-bold hover:bg-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-fuchsia-600">
                <Upload className="h-4 w-4" />
                上傳並寫入資料庫
              </button>
              {message && <div className="rounded-xl bg-zinc-950 p-3 text-sm text-zinc-300">{message}</div>}
            </form>
          </section>
        </aside>

        <section className="rounded-3xl border border-zinc-800 bg-[#181a1f] p-5">
          <div className="mb-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-fuchsia-400" />
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
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-fuchsia-500"
                autoComplete="off"
              />
              <input
                value={queryAuthor}
                onChange={(e) => setQueryAuthor(e.target.value)}
                placeholder="作者"
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-fuchsia-500"
              />
              <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-zinc-100 px-4 py-2 font-bold text-zinc-950">
                <Search className="h-4 w-4" />
                查詢
              </button>
              <button
                type="button"
                onClick={clearSearchFilters}
                className="rounded-xl border border-zinc-700 px-4 py-2 font-bold text-zinc-300 hover:border-zinc-500 hover:text-white"
              >
                清除
              </button>
            </form>
            <div className="overflow-x-auto">
              <div className="inline-flex min-w-full gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-1">
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
                      aria-pressed={active}
                      className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition ${
                        active
                          ? "bg-fuchsia-600 text-white"
                          : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
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
            <div className="mb-4 rounded-xl bg-zinc-950 p-3 text-sm text-zinc-300">
              {queryMessage}
            </div>
          )}

          {glyphs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-700 p-10 text-center text-zinc-500">
              輸入字後查詢，或先執行 npm run seed:demo / npm run import:glyphs。
            </div>
          ) : (
            <>
              {charTabs.length > 0 && (
                <div className="mb-4 overflow-x-auto">
                  <div className="inline-flex min-w-full gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-1">
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
                          ? "bg-fuchsia-600 text-white"
                          : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
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
                              ? "bg-fuchsia-600 text-white"
                              : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
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
                <div key={glyph.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
                  <GlyphImage glyph={glyph} size={108} />
                  {editingId === glyph.id && editDraft ? (
                    <div className="mt-3 space-y-2">
                      <input
                        value={editDraft.char}
                        onChange={(e) => updateDraft("char", e.target.value)}
                        maxLength={2}
                        className="w-full rounded-lg border border-zinc-700 bg-[#181a1f] px-2 py-1 text-sm outline-none focus:border-fuchsia-500"
                        placeholder="字"
                      />
                      <input
                        value={editDraft.author}
                        onChange={(e) => updateDraft("author", e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-[#181a1f] px-2 py-1 text-sm outline-none focus:border-fuchsia-500"
                        placeholder="作者"
                      />
                      <input
                        value={editDraft.scriptType}
                        onChange={(e) => updateDraft("scriptType", e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-[#181a1f] px-2 py-1 text-sm outline-none focus:border-fuchsia-500"
                        placeholder="書體"
                      />
                      <input
                        value={editDraft.workTitle}
                        onChange={(e) => updateDraft("workTitle", e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-[#181a1f] px-2 py-1 text-sm outline-none focus:border-fuchsia-500"
                        placeholder="作品"
                      />
                      <input
                        value={editDraft.source}
                        onChange={(e) => updateDraft("source", e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-[#181a1f] px-2 py-1 text-sm outline-none focus:border-fuchsia-500"
                        placeholder="來源"
                      />
                      <input
                        value={editDraft.license}
                        onChange={(e) => updateDraft("license", e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-[#181a1f] px-2 py-1 text-sm outline-none focus:border-fuchsia-500"
                        placeholder="授權"
                      />
                      <input
                        value={editDraft.qualityScore}
                        onChange={(e) => updateDraft("qualityScore", e.target.value)}
                        type="number"
                        className="w-full rounded-lg border border-zinc-700 bg-[#181a1f] px-2 py-1 text-sm outline-none focus:border-fuchsia-500"
                        placeholder="品質分數(排序用)"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => void saveGlyph(glyph.id)}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-fuchsia-600 px-2 py-2 text-sm font-bold hover:bg-fuchsia-500"
                        >
                          <Save className="h-4 w-4" />
                          儲存
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditDraft(null);
                          }}
                          className="inline-flex items-center justify-center rounded-lg border border-zinc-700 px-2 py-2 text-zinc-300 hover:border-zinc-500"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-2 text-sm font-medium">{glyph.char}｜{glyph.author || "佚名"}</div>
                      <div className="truncate text-xs text-zinc-500">{glyph.scriptType || "未標註"}｜{glyph.workTitle || "未標題"}</div>
                      <div className="mt-1 truncate text-xs text-zinc-600">ID {glyph.id}</div>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => startEdit(glyph)}
                          disabled={isForbidden}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-zinc-700 px-2 py-2 text-sm font-bold text-zinc-300 hover:border-fuchsia-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-zinc-700 disabled:hover:text-zinc-300"
                        >
                          <Pencil className="h-4 w-4" />
                          修改
                        </button>
                        <button
                          onClick={() => void deleteGlyph(glyph.id)}
                          disabled={isForbidden}
                          className="inline-flex items-center justify-center rounded-lg border border-red-900/70 px-2 py-2 text-red-300 hover:border-red-500 hover:text-red-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-red-900/70 disabled:hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
