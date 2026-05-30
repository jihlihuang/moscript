"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Database, GripVertical, ImagePlus, Pencil, RefreshCw, Search, Trash2, Upload, X } from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";
import { ImageLightbox } from "@/components/ImageLightbox";
import { GlyphImage, type GlyphLike } from "@/components/GlyphImage";
import { LogoMark } from "@/components/LogoMark";
import { AdminSecurityDashboard } from "@/components/AdminSecurityDashboard";

type Stats = {
  totalGlyphs: number;
  totalChars: number;
  totalCollections: number;
  scripts: { label: string; count: number }[];
  observability?: {
    searchCount: number;
    popularSearchChars: { subject: string; count: number }[];
    uploadFailures: { details: string | null; count: number }[];
    uploadProcessing: { count: number; avgMs: number | null; maxMs: number | null };
  };
};

type GlyphDto = GlyphLike & {
  source?: string | null;
  license?: string | null;
  qualityScore?: number;
  ownerUserId?: string | null;
  visibility?: string;
  likeCount?: number;
  collectionCount?: number;
  setId?: number | null;
  setPosition?: number | null;
};

type GlyphResponse = {
  results: Record<string, GlyphDto[]>;
  total: number;
};

type CurrentUser = {
  email: string;
  name: string | null;
};

const unknownScriptLabels = new Set(["未標註", "未知書體"]);
const preferredScriptOrder = ["草", "行", "隸", "楷"];

function onlyChinese(value: string) {
  return Array.from(value).filter((char) => /\p{Script=Han}/u.test(char)).join("");
}

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

function uploadFailureLabel(details: string | null) {
  if (!details) return "未知原因";
  try {
    const parsed = JSON.parse(details) as { reason?: string };
    return parsed.reason || details;
  } catch {
    return details;
  }
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [keyword, setKeyword] = useState("");
  const [isComposingKeyword, setIsComposingKeyword] = useState(false);
  const [queryAuthor, setQueryAuthor] = useState("");
  const [queryWorkTitle, setQueryWorkTitle] = useState("");
  const [queryScriptType, setQueryScriptType] = useState("");
  const [glyphs, setGlyphs] = useState<GlyphDto[]>([]);
  const [queryMessage, setQueryMessage] = useState("");
  const [activeChar, setActiveChar] = useState<string | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [deletingGlyphId, setDeletingGlyphId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"management" | "dashboard" | "security" | "sets">("dashboard");
  type SetMember = { id: number; char: string; author: string | null; scriptType: string | null; workTitle: string | null; qualityScore: number; visibility: string; imageUrl: string; thumbnailUrl: string | null; setPosition?: number | null };
  type GlyphSetItem = { id: number; name: string | null; sourceImageUrl: string | null; createdAt: string; members: SetMember[] };
  const [setsListData, setSetsListData] = useState<GlyphSetItem[]>([]);
  const [setsListQuery, setSetsListQuery] = useState("");
  const [isSetsLoading, setIsSetsLoading] = useState(false);
  const [editingSetId, setEditingSetId] = useState<number | null>(null);
  const [editingSetName, setEditingSetName] = useState("");
  const [isSavingSetName, setIsSavingSetName] = useState(false);
  const [deletingSetId, setDeletingSetId] = useState<number | null>(null);
  const [expandedSetId, setExpandedSetId] = useState<number | null>(null);
  const [addGlyphQuery, setAddGlyphQuery] = useState("");
  const [addGlyphAuthor, setAddGlyphAuthor] = useState("");
  const [addGlyphWorkTitle, setAddGlyphWorkTitle] = useState("");
  const [addGlyphScriptType, setAddGlyphScriptType] = useState("");
  const [isComposingAddGlyphQuery, setIsComposingAddGlyphQuery] = useState(false);
  const [addGlyphResults, setAddGlyphResults] = useState<GlyphDto[]>([]);
  const [activeAddGlyphChar, setActiveAddGlyphChar] = useState<string | null>(null);
  const [isSearchingForAdd, setIsSearchingForAdd] = useState(false);
  const [uploadingSourceForSet, setUploadingSourceForSet] = useState<number | null>(null);
  const [draggingMember, setDraggingMember] = useState<{ setId: number; glyphId: number } | null>(null);
  const [dragOverGlyphId, setDragOverGlyphId] = useState<number | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [selectedGlyphIds, setSelectedGlyphIds] = useState<Set<number>>(() => new Set());
  const [setSourceFile, setSetSourceFile] = useState<File | null>(null);
  const [setName, setSetName] = useState("");
  const [isCreatingSet, setIsCreatingSet] = useState(false);
  const [setCreationMsg, setSetCreationMsg] = useState("");

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

  const addGlyphQueryChars = useMemo(
    () => [...new Set(Array.from(onlyChinese(addGlyphQuery)).filter((char) => char.trim() !== ""))],
    [addGlyphQuery]
  );

  const addGlyphResultCounts = useMemo(
    () =>
      addGlyphResults.reduce<Record<string, number>>((acc, glyph) => {
        acc[glyph.char] = (acc[glyph.char] ?? 0) + 1;
        return acc;
      }, {}),
    [addGlyphResults]
  );

  const visibleAddGlyphResults = activeAddGlyphChar
    ? addGlyphResults.filter((glyph) => glyph.char === activeAddGlyphChar)
    : addGlyphResults;
  const hasAddGlyphSearchKeyword = addGlyphQueryChars.length > 0 || addGlyphAuthor.trim().length > 0 || addGlyphWorkTitle.trim().length > 0;

  const visibleGlyphs = activeChar ? glyphsByChar[activeChar] ?? [] : glyphs;
  const hasSearchKeyword = onlyChinese(keyword).length > 0 || queryAuthor.trim().length > 0 || queryWorkTitle.trim().length > 0;

  const scriptFilters = useMemo(
    () => ["", ...sortScriptLabels(stats?.scripts.filter((script) => script.count > 0).map((script) => script.label) ?? [])],
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
    if (queryWorkTitle) params.set("workTitle", queryWorkTitle);
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

  async function search(nextScriptType = queryScriptType, options?: { keyword?: string; author?: string; workTitle?: string; activeChar?: string | null }) {
    setQueryMessage("");
    const searchKeyword = options?.keyword ?? keyword;
    const searchAuthor = options?.author ?? queryAuthor;
    const searchWorkTitle = options?.workTitle ?? queryWorkTitle;
    const cleanedKeyword = onlyChinese(searchKeyword);
    if (cleanedKeyword !== keyword) {
      setKeyword(cleanedKeyword);
    }
    if (!cleanedKeyword && !searchAuthor && !searchWorkTitle) {
      setGlyphs([]);
      setActiveChar(null);
      setQueryMessage("請輸入中文字、作者或作品名稱再查詢");
      return;
    }
    const params = new URLSearchParams();
    if (cleanedKeyword) params.set("q", cleanedKeyword);
    if (searchAuthor) params.set("author", searchAuthor);
    if (searchWorkTitle) params.set("workTitle", searchWorkTitle);
    if (nextScriptType) params.set("scriptType", nextScriptType);
    params.set("includeAllPersonal", "1");
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
    setQueryWorkTitle("");
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

  async function createGlyphSet() {
    if (selectedGlyphIds.size === 0) return;
    setIsCreatingSet(true);
    setSetCreationMsg("建立字組中...");
    try {
      const fd = new FormData();
      fd.set("glyphIds", JSON.stringify([...selectedGlyphIds]));
      fd.set("visibility", "private");
      if (setName.trim()) fd.set("name", setName.trim());
      if (setSourceFile) fd.set("sourceImage", setSourceFile, setSourceFile.name);
      const res = await fetch("/api/glyph-sets", { method: "POST", body: fd });
      const json = await res.json() as { id?: number; assignedCount?: number; error?: string };
      if (!res.ok) { setSetCreationMsg(json.error ?? "建立失敗"); return; }
      setSetCreationMsg(`字組 #${json.id} 建立完成，已歸組 ${json.assignedCount} 個字圖`);
      // 更新本地 glyphs 的 setId
      const setId = json.id!;
      setGlyphs((prev) => prev.map((g) => selectedGlyphIds.has(g.id) ? { ...g, setId } : g));
      setSelectedGlyphIds(new Set());
      setSetSourceFile(null);
      setSetName("");
    } catch {
      setSetCreationMsg("建立失敗，請稍後再試");
    } finally {
      setIsCreatingSet(false);
    }
  }

  async function loadSetsList(q = setsListQuery) {
    setIsSetsLoading(true);
    try {
      const res = await fetch(`/api/glyph-sets?admin=1&limit=100${q ? `&q=${encodeURIComponent(q)}` : ""}`);
      if (!res.ok) return;
      const json = await res.json() as { sets: typeof setsListData };
      setSetsListData(json.sets);
    } finally {
      setIsSetsLoading(false);
    }
  }

  async function saveSetName(id: number) {
    setIsSavingSetName(true);
    try {
      const res = await fetch(`/api/glyph-sets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingSetName }),
      });
      if (!res.ok) return;
      setSetsListData((prev) => prev.map((s) => s.id === id ? { ...s, name: editingSetName } : s));
      setEditingSetId(null);
    } finally {
      setIsSavingSetName(false);
    }
  }

  async function removeMemberFromSet(setId: number, glyphId: number) {
    const res = await fetch(`/api/glyph-sets/${setId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeGlyphIds: [glyphId] }),
    });
    if (!res.ok) return;
    setSetsListData((prev) => prev.map((s) =>
      s.id === setId ? { ...s, members: s.members.filter((m) => m.id !== glyphId) } : s
    ));
  }

  async function loadSetDetail(setId: number) {
    const setRes = await fetch(`/api/glyph-sets/${setId}`);
    if (!setRes.ok) return;
    const setJson = await setRes.json() as { id: number; name: string | null; sourceImageUrl: string | null; createdAt: string; members: SetMember[] };
    setSetsListData((prev) => prev.map((s) => s.id === setId ? { ...s, ...setJson, sourceImageUrl: s.sourceImageUrl } : s));
  }

  async function saveMemberOrder(setId: number, members: SetMember[]) {
    const res = await fetch(`/api/glyph-sets/${setId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberOrder: members.map((member) => member.id) }),
    });
    if (!res.ok) {
      await loadSetDetail(setId);
    }
  }

  function moveMemberInSet(setId: number, fromGlyphId: number, toGlyphId: number) {
    if (fromGlyphId === toGlyphId) return;
    let nextMembers: SetMember[] | null = null;
    setSetsListData((prev) => prev.map((s) => {
      if (s.id !== setId) return s;
      const fromIndex = s.members.findIndex((member) => member.id === fromGlyphId);
      const toIndex = s.members.findIndex((member) => member.id === toGlyphId);
      if (fromIndex < 0 || toIndex < 0) return s;
      const members = [...s.members];
      const [moved] = members.splice(fromIndex, 1);
      members.splice(toIndex, 0, moved);
      nextMembers = members.map((member, index) => ({ ...member, setPosition: index + 1 }));
      return { ...s, members: nextMembers };
    }));
    if (nextMembers) void saveMemberOrder(setId, nextMembers);
  }

  async function deleteGlyphSet(id: number) {
    if (!window.confirm(`確定刪除字組 ID ${id}？字組內的字圖不會被刪除，但會取消分組。`)) return;
    setDeletingSetId(id);
    try {
      const res = await fetch(`/api/glyph-sets/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      setSetsListData((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setDeletingSetId(null);
    }
  }

  function clearAddGlyphSearchFilters() {
    setAddGlyphQuery("");
    setAddGlyphAuthor("");
    setAddGlyphWorkTitle("");
    setAddGlyphScriptType("");
    setAddGlyphResults([]);
    setActiveAddGlyphChar(null);
  }

  async function searchGlyphsForSet(nextScriptType = addGlyphScriptType) {
    const cleaned = onlyChinese(addGlyphQuery);
    if (cleaned !== addGlyphQuery) {
      setAddGlyphQuery(cleaned);
    }
    const author = addGlyphAuthor.trim();
    const workTitle = addGlyphWorkTitle.trim();
    if (!cleaned && !author && !workTitle) {
      setAddGlyphResults([]);
      setActiveAddGlyphChar(null);
      return;
    }
    setIsSearchingForAdd(true);
    try {
      const params = new URLSearchParams({ includeAllPersonal: "1", perChar: "5" });
      const queryChars = [...new Set(Array.from(cleaned).filter((char) => char.trim() !== ""))];
      if (cleaned) params.set("q", cleaned);
      if (author) params.set("author", author);
      if (workTitle) params.set("workTitle", workTitle);
      if (nextScriptType) params.set("scriptType", nextScriptType);
      if (!cleaned) params.set("limit", "40");
      const res = await fetch(`/api/glyphs?${params}`);
      if (!res.ok) return;
      const json = await res.json() as { results: Record<string, GlyphDto[]> };
      const nextResults = queryChars.length > 1
        ? queryChars.flatMap((char) => (json.results[char] ?? []).slice(0, 12))
        : Object.values(json.results).flat().slice(0, 40);
      const firstResultChar = queryChars.find((char) => nextResults.some((glyph) => glyph.char === char)) ?? null;
      setAddGlyphResults(nextResults);
      setActiveAddGlyphChar(queryChars.length > 1 ? firstResultChar : null);
    } finally {
      setIsSearchingForAdd(false);
    }
  }

  async function addGlyphToSet(setId: number, glyphId: number) {
    const res = await fetch(`/api/glyph-sets/${setId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addGlyphIds: [glyphId] }),
    });
    if (!res.ok) return;
    await loadSetDetail(setId);
  }

  async function uploadSetSource(setId: number, file: File) {
    setUploadingSourceForSet(setId);
    try {
      const fd = new FormData();
      fd.set("sourceImage", file, file.name);
      const res = await fetch(`/api/glyph-sets/${setId}/source`, { method: "PUT", body: fd });
      if (!res.ok) return;
      setSetsListData((prev) => prev.map((s) =>
        s.id === setId ? { ...s, sourceImageUrl: `/api/glyph-sets/${setId}/source?t=${Date.now()}` } : s
      ));
    } finally {
      setUploadingSourceForSet(null);
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
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-3 pt-3 sm:px-4 sm:pt-4">
          <div className="flex min-w-0 items-center gap-3">
            <LogoMark imageClassName="h-9 w-9 sm:h-12 sm:w-12" />
            <div className="min-w-0">
              <h1 className="truncate font-serif text-xl font-bold sm:text-2xl">後台管理</h1>
              <p className="hidden truncate text-xs text-stone-500 sm:block sm:text-sm">
                管理字圖資料、手動上傳、檢查資料庫數量{user ? `｜${user.email}` : ""}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 pl-3">
            <Link href="/" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-stone-800 px-3 py-2 text-xs font-bold text-white sm:px-4 sm:text-sm">
              <ArrowLeft className="h-4 w-4" />
              回前台
            </Link>
            <LogoutButton
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-stone-300 px-2.5 py-2 text-stone-700 hover:border-red-700 hover:text-stone-900"
              labelClassName="hidden"
            />
          </div>
        </div>
        <div className="mx-auto mt-2 max-w-[1600px] px-3 sm:px-4">
          <div className="flex gap-6 border-b border-stone-200">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`pb-3 text-sm font-bold transition-colors ${
                activeTab === "dashboard"
                  ? "border-b-2 border-red-700 text-red-800"
                  : "border-b-2 border-transparent text-stone-500 hover:text-stone-800"
              }`}
            >
              系統狀態
            </button>
            <button
              onClick={() => setActiveTab("management")}
              className={`pb-3 text-sm font-bold transition-colors ${
                activeTab === "management"
                  ? "border-b-2 border-red-700 text-red-800"
                  : "border-b-2 border-transparent text-stone-500 hover:text-stone-800"
              }`}
            >
              字圖管理
            </button>
            <button
              onClick={() => { setActiveTab("sets"); void loadSetsList(""); }}
              className={`pb-3 text-sm font-bold transition-colors ${
                activeTab === "sets"
                  ? "border-b-2 border-red-700 text-red-800"
                  : "border-b-2 border-transparent text-stone-500 hover:text-stone-800"
              }`}
            >
              字組管理
            </button>
            <button
              onClick={() => setActiveTab("security")}
              className={`pb-3 text-sm font-bold transition-colors ${
                activeTab === "security"
                  ? "border-b-2 border-red-700 text-red-800"
                  : "border-b-2 border-transparent text-stone-500 hover:text-stone-800"
              }`}
            >
              資安監控
            </button>
          </div>
        </div>
      </header>

      {isForbidden && (
        <div className="mx-auto mt-4 max-w-[1600px] px-3 sm:mt-6 sm:px-4">
          <div className="rounded-2xl border border-red-800 bg-red-950/50 p-4 text-center sm:p-6">
            <h2 className="mb-2 text-lg font-bold text-red-500 sm:text-xl">權限不足</h2>
            <p className="text-sm text-red-300 sm:text-base">
              您目前的帳號沒有後台管理權限，無法執行新增、修改、刪除等操作。
              若需權限請聯絡系統管理員將您的 Email 加入白名單。
            </p>
          </div>
        </div>
      )}

      {activeTab === "dashboard" && (
        <section className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
          <div className="grid gap-4 md:grid-cols-2 lg:gap-6">
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
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                  <div className="rounded-2xl bg-stone-50 p-3 sm:p-4">
                    <div className="text-xs text-stone-500 sm:text-sm">字圖總數</div>
                    <div className="text-2xl font-bold sm:text-3xl">{stats.totalGlyphs.toLocaleString()}</div>
                  </div>
                  <div className="rounded-2xl bg-stone-50 p-3 sm:p-4">
                    <div className="text-xs text-stone-500 sm:text-sm">不同字數</div>
                    <div className="text-2xl font-bold sm:text-3xl">{stats.totalChars.toLocaleString()}</div>
                  </div>
                  <div className="rounded-2xl bg-stone-50 p-3 sm:p-4">
                    <div className="text-xs text-stone-500 sm:text-sm">集字作品</div>
                    <div className="text-2xl font-bold sm:text-3xl">{stats.totalCollections.toLocaleString()}</div>
                  </div>
                  <div className="col-span-2 rounded-2xl bg-stone-50 p-3 sm:col-span-3 sm:p-4">
                    <div className="mb-2 text-sm text-stone-500">書體分布</div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {stats.scripts.map((item) => (
                        <div key={item.label} className="flex flex-col rounded-xl bg-white p-2 shadow-sm text-sm">
                          <span className="font-bold">{item.label}</span>
                          <span className="text-stone-500">{item.count.toLocaleString()}</span>
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

            {stats?.observability && (
              <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:rounded-3xl sm:p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Search className="h-5 w-5 text-red-600" />
                  <h2 className="text-lg font-bold sm:text-xl">使用觀測</h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-stone-50 p-3">
                    <div className="text-xs text-stone-500">搜尋次數</div>
                    <div className="text-2xl font-bold">{stats.observability.searchCount.toLocaleString()}</div>
                  </div>
                  <div className="rounded-2xl bg-stone-50 p-3 text-sm">
                    <div className="font-bold text-stone-700">圖片處理時間</div>
                    <div className="mt-1 text-stone-600">
                      平均 {Math.round(stats.observability.uploadProcessing.avgMs ?? 0).toLocaleString()}ms<br/>最高 {Math.round(stats.observability.uploadProcessing.maxMs ?? 0).toLocaleString()}ms
                    </div>
                  </div>
                  <div className="rounded-2xl bg-stone-50 p-3 sm:col-span-2">
                    <div className="mb-2 text-sm font-bold text-stone-700">熱門搜尋</div>
                    <div className="flex flex-wrap gap-2">
                      {stats.observability.popularSearchChars.slice(0, 8).map((item) => (
                        <div key={item.subject} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1 text-sm shadow-sm border border-stone-200">
                          <span className="font-bold">{item.subject}</span>
                          <span className="text-xs text-stone-500">{item.count.toLocaleString()}</span>
                        </div>
                      ))}
                      {stats.observability.popularSearchChars.length === 0 && <div className="text-sm text-stone-500">尚無資料</div>}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-stone-50 p-3 sm:col-span-2">
                    <div className="mb-2 text-sm font-bold text-stone-700">上傳失敗原因</div>
                    <div className="space-y-1">
                      {stats.observability.uploadFailures.slice(0, 5).map((item, index) => (
                        <div key={`${item.details}-${index}`} className="flex justify-between gap-3 text-sm border-b border-stone-200 pb-1 last:border-0 last:pb-0">
                          <span className="truncate">{uploadFailureLabel(item.details)}</span>
                          <span className="text-stone-500">{item.count.toLocaleString()}</span>
                        </div>
                      ))}
                      {stats.observability.uploadFailures.length === 0 && <div className="text-sm text-stone-500">尚無失敗紀錄</div>}
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>
        </section>
      )}

      {activeTab === "sets" && (
        <section className="mx-auto max-w-[1600px] px-3 py-4 sm:px-4 sm:py-6">
          {/* 搜尋列 */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <form
              onSubmit={(e) => { e.preventDefault(); void loadSetsList(setsListQuery); }}
              className="flex flex-1 items-center gap-2"
            >
              <input
                value={setsListQuery}
                onCompositionEnd={(e) => setSetsListQuery(onlyChinese(e.currentTarget.value))}
                onChange={(e) => {
                  const nativeEvent = e.nativeEvent as InputEvent;
                  if (nativeEvent.isComposing) {
                    setSetsListQuery(e.target.value);
                  } else {
                    setSetsListQuery(onlyChinese(e.target.value));
                  }
                }}
                placeholder="搜尋字組名稱、字圖、作者或作品"
                className="flex-1 rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 outline-none focus:border-red-700"
              />
              <button
                type="submit"
                disabled={isSetsLoading}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-stone-800 px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                {isSetsLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                查詢
              </button>
              <button type="button" onClick={() => { setSetsListQuery(""); void loadSetsList(""); }} className="min-h-10 rounded-xl border border-stone-300 px-4 text-sm font-bold text-stone-600 hover:border-stone-500">
                全部
              </button>
            </form>
            <span className="text-sm text-stone-500">共 {setsListData.length} 個字組</span>
          </div>

          {isSetsLoading && (
            <div className="flex items-center justify-center py-16 text-stone-400">
              <RefreshCw className="mr-2 h-5 w-5 animate-spin" />載入中...
            </div>
          )}

          {!isSetsLoading && setsListData.length === 0 && (
            <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-stone-500">
              目前沒有字組資料
            </div>
          )}

          {/* 黃金比例格線：2→3 欄；展開時該卡片自動跨全寬 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {setsListData.map((set) => {
              const isExpanded = expandedSetId === set.id;
              const authors = [...new Set(set.members.map((m) => m.author).filter(Boolean))];
              const scripts = [...new Set(set.members.map((m) => m.scriptType).filter(Boolean))];
              const works = [...new Set(set.members.map((m) => m.workTitle).filter(Boolean))];
              const display = set.members;
              return (
              <div key={set.id}
                className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition-all"
                style={isExpanded ? { gridColumn: "1 / -1" } : {}}>

                {/* ── 卡片頂部：名稱 + 原圖 + 操作按鈕 ── */}
                <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-serif text-xl font-bold text-stone-900">
                      {set.name || <span className="italic text-stone-400 text-base">未命名字組</span>}
                    </h3>
                    <p className="mt-0.5 text-xs text-stone-400">
                      字組 #{set.id} · {set.members.length} 個字圖 · {new Date(set.createdAt).toLocaleDateString("zh-Hant")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {set.sourceImageUrl && (
                      <button type="button" onClick={() => setLightboxSrc(set.sourceImageUrl)} title="查看拆字原圖">
                        <img src={set.sourceImageUrl} alt="原圖" className="h-14 w-14 rounded-xl border-2 border-stone-100 object-contain bg-stone-50 p-0.5 hover:border-red-300 transition-colors" />
                      </button>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <button
                        onClick={() => setExpandedSetId(isExpanded ? null : set.id)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${isExpanded ? "border-red-700 bg-red-700 text-white" : "border-stone-300 text-stone-600 hover:border-red-400 hover:text-red-700"}`}>
                        <Pencil className="h-3 w-3" />{isExpanded ? "收起管理" : "管理"}
                      </button>
                      <button onClick={() => void deleteGlyphSet(set.id)} disabled={deletingSetId === set.id}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-500 hover:border-red-400 hover:bg-red-50 disabled:opacity-40">
                        {deletingSetId === set.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        刪除
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── 字圖展示區（黃金比例格線，max 8）── */}
                {!isExpanded && <div className="px-3 py-3">
                  {display.length > 0 ? (
                    <div className={`grid gap-2 ${isExpanded ? "grid-cols-6 sm:grid-cols-8 lg:grid-cols-10" : "grid-cols-4"}`}>
                      {display.map((m) => (
                        <a key={m.id} href={`/glyph/${m.id}`}
                          className="group flex flex-col items-center rounded-lg border border-stone-100 bg-stone-50 p-1 transition-all hover:border-red-300 hover:bg-red-50">
                          <div className="aspect-square w-full overflow-hidden rounded-md border border-stone-100 bg-white">
                            <img src={m.thumbnailUrl ?? m.imageUrl} alt={m.char}
                              className="h-full w-full object-contain mix-blend-multiply" loading="lazy" />
                          </div>
                          <div className="mt-0.5 font-serif text-base font-bold text-stone-800 group-hover:text-red-800">{m.char}</div>
                          {m.scriptType && <span className="text-[9px] text-stone-400">{m.scriptType}</span>}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="py-4 text-center text-xs text-stone-400">此字組尚無字圖</div>
                  )}
                </div>}

                {/* ── 彙總資訊列 ── */}
                {(authors.length > 0 || scripts.length > 0 || works.length > 0) && (
                  <div className="border-t border-stone-100 bg-stone-50 px-4 py-2.5 text-xs text-stone-500">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {authors.length > 0 && <span><span className="font-bold text-stone-600">作者</span> {authors.join("、")}</span>}
                      {scripts.length > 0 && <span><span className="font-bold text-stone-600">書體</span> {scripts.join("、")}</span>}
                      {works.length > 0 && <span><span className="font-bold text-stone-600">作品</span> {works.join("、")}</span>}
                    </div>
                  </div>
                )}

                {/* 管理面板（展開時顯示） */}
                {isExpanded && (
                  <div className="divide-y divide-stone-100 border-t border-stone-100">

                    {/* ── 區塊 1：字組設定 ── */}
                    <div className="px-4 py-4 space-y-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400">字組設定</h3>

                      {/* 名稱 */}
                      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                        <span className="w-16 shrink-0 text-sm font-bold text-stone-600">名稱</span>
                        {editingSetId === set.id ? (
                          <div className="flex flex-1 items-center gap-2">
                            <input value={editingSetName} onChange={(e) => setEditingSetName(e.target.value)} autoFocus
                              className="flex-1 rounded-xl border border-red-400 px-3 py-2 text-sm outline-none" />
                            <button onClick={() => void saveSetName(set.id)} disabled={isSavingSetName}
                              className="shrink-0 rounded-xl bg-red-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                              {isSavingSetName ? "儲存中..." : "儲存"}
                            </button>
                            <button onClick={() => setEditingSetId(null)}
                              className="shrink-0 rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-500 hover:text-stone-800">
                              取消
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-1 items-center gap-3">
                            <span className="text-sm">{set.name || <span className="italic text-stone-400">（未命名）</span>}</span>
                            <button onClick={() => { setEditingSetId(set.id); setEditingSetName(set.name ?? ""); }}
                              className="inline-flex items-center gap-1 rounded-lg border border-stone-300 px-2 py-1 text-xs text-stone-500 hover:border-red-400 hover:text-red-700">
                              <Pencil className="h-3 w-3" />編輯名稱
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 原圖 */}
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                        <span className="w-16 shrink-0 pt-1 text-sm font-bold text-stone-600">原圖</span>
                        <div className="flex flex-wrap items-start gap-3">
                          {set.sourceImageUrl ? (
                            <button type="button" onClick={() => setLightboxSrc(set.sourceImageUrl)} title="點擊放大預覽">
                              <img src={set.sourceImageUrl} alt="拆字原圖"
                                className="h-28 w-28 rounded-xl border-2 border-stone-200 object-contain bg-white p-1 hover:border-red-300 transition-colors" />
                            </button>
                          ) : (
                            <div className="flex h-28 w-28 items-center justify-center rounded-xl border-2 border-dashed border-stone-200 text-xs text-stone-400">無原圖</div>
                          )}
                          <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-stone-300 px-4 py-3 text-sm font-medium text-stone-600 hover:border-red-400 hover:text-red-700 self-start">
                            {uploadingSourceForSet === set.id
                              ? <><RefreshCw className="h-4 w-4 animate-spin" />上傳中...</>
                              : <><Upload className="h-4 w-4" />{set.sourceImageUrl ? "重新上傳原圖" : "上傳原圖（灰階）"}</>}
                            <input type="file" accept="image/*" className="hidden"
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadSetSource(set.id, f); e.target.value = ""; }}
                              disabled={uploadingSourceForSet === set.id} />
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* ── 區塊 2：成員字圖 ── */}
                    <div className="px-4 py-4">
                      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-stone-400">
                        目前成員 · {set.members.length} 個字圖
                      </h3>
                      {set.members.length > 0 ? (
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-8">
                          {set.members.map((m) => (
                            <div
                              key={m.id}
                              draggable
                              onDragStart={(event) => {
                                setDraggingMember({ setId: set.id, glyphId: m.id });
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", String(m.id));
                              }}
                              onDragEnter={() => setDragOverGlyphId(m.id)}
                              onDragOver={(event) => {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                              }}
                              onDragEnd={() => {
                                setDraggingMember(null);
                                setDragOverGlyphId(null);
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                const draggedGlyphId = draggingMember?.setId === set.id ? draggingMember.glyphId : Number(event.dataTransfer.getData("text/plain"));
                                setDraggingMember(null);
                                setDragOverGlyphId(null);
                                if (Number.isFinite(draggedGlyphId)) moveMemberInSet(set.id, draggedGlyphId, m.id);
                              }}
                              className={`grid min-h-[84px] grid-cols-[54px_1fr] overflow-hidden rounded-lg border bg-white shadow-sm transition-all sm:grid-cols-[60px_1fr] ${
                                draggingMember?.glyphId === m.id
                                  ? "scale-[0.98] border-red-300 opacity-60"
                                  : dragOverGlyphId === m.id
                                  ? "border-red-300 ring-2 ring-red-100"
                                  : "border-stone-200 hover:border-stone-300"
                              }`}
                            >
                              <a href={`/glyph/${m.id}`} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center justify-center border-r border-stone-100 bg-stone-50 p-1.5">
                                <img src={m.thumbnailUrl ?? m.imageUrl} alt={m.char}
                                  className="h-full max-h-24 w-full object-contain mix-blend-multiply" loading="lazy" />
                              </a>
                              <div className="flex min-w-0 flex-col justify-between gap-1.5 p-2">
                                <div className="flex items-start gap-1.5">
                                  <button type="button" className="cursor-grab rounded-md p-0.5 text-stone-300 hover:bg-stone-100 hover:text-stone-600" title="拖拉排序">
                                    <GripVertical className="h-3.5 w-3.5" />
                                  </button>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline gap-1.5">
                                      <span className="font-serif text-2xl font-bold leading-none text-stone-900">{m.char}</span>
                                      <span className="truncate text-xs font-medium text-stone-500">{m.author || "佚名"}</span>
                                    </div>
                                    <div className="truncate text-[11px] text-stone-500">{m.scriptType || "未標"}｜{m.workTitle || "未標題"}</div>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-1 text-[10px] text-stone-500">
                                  <span className="rounded bg-stone-100 px-1 py-0.5">品質 {m.qualityScore}</span>
                                  <span className="rounded bg-stone-100 px-1 py-0.5">ID {m.id}</span>
                                  {m.visibility === "private" && <span className="rounded bg-red-100 px-1 py-0.5 font-medium text-red-600">私密</span>}
                                </div>
                                <div className="flex justify-end gap-1">
                                  <a href={`/admin/upload?replaceGlyphId=${m.id}&returnTo=/admin`}
                                    className="inline-flex min-h-7 w-12 items-center justify-center gap-0.5 rounded-md border border-stone-300 px-1 text-[11px] font-medium text-stone-600 hover:border-stone-500 hover:text-stone-900">
                                    <Pencil className="h-3 w-3" />修改
                                  </a>
                                  <button onClick={() => void removeMemberFromSet(set.id, m.id)}
                                    className="inline-flex min-h-7 w-12 items-center justify-center gap-0.5 rounded-md border border-red-200 bg-red-50 px-1 text-[11px] font-medium text-red-600 hover:border-red-400 hover:bg-red-100">
                                    <X className="h-3 w-3" />移出
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-xl border-2 border-dashed border-stone-200 py-8 text-center text-sm text-stone-400">
                          此字組目前沒有字圖，可從下方搜尋加入
                        </div>
                      )}
                    </div>

                    {/* ── 區塊 3：搜尋並加入字圖 ── */}
                    <div className="bg-stone-50 px-4 py-4">
                      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-stone-400">搜尋並加入字圖</h3>
                      <form onSubmit={(e) => { e.preventDefault(); void searchGlyphsForSet(); }} className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
                        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                          <input
                            value={addGlyphQuery}
                            onCompositionStart={() => setIsComposingAddGlyphQuery(true)}
                            onCompositionEnd={(e) => {
                              setIsComposingAddGlyphQuery(false);
                              setAddGlyphQuery(onlyChinese(e.currentTarget.value));
                            }}
                            onChange={(e) => {
                              const nativeEvent = e.nativeEvent as InputEvent;
                              setAddGlyphQuery(
                                isComposingAddGlyphQuery || nativeEvent.isComposing
                                  ? e.target.value
                                  : onlyChinese(e.target.value)
                              );
                            }}
                            placeholder="輸入中文"
                            disabled={isSearchingForAdd}
                            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 outline-none focus:border-red-700 sm:w-40"
                            autoComplete="off"
                          />
                          <input
                            value={addGlyphAuthor}
                            onChange={(e) => setAddGlyphAuthor(e.target.value)}
                            placeholder="作者"
                            disabled={isSearchingForAdd}
                            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 outline-none focus:border-red-700 sm:w-28"
                          />
                          <input
                            value={addGlyphWorkTitle}
                            onChange={(e) => setAddGlyphWorkTitle(e.target.value)}
                            placeholder="作品名稱"
                            disabled={isSearchingForAdd}
                            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 outline-none focus:border-red-700 sm:w-32"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="submit" disabled={isSearchingForAdd || !hasAddGlyphSearchKeyword}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-stone-800 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                            {isSearchingForAdd ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                            {isSearchingForAdd ? "查詢中" : "查詢"}
                          </button>
                          <button
                            type="button"
                            onClick={clearAddGlyphSearchFilters}
                            disabled={isSearchingForAdd}
                            className="min-h-10 rounded-xl border border-stone-300 px-4 py-2 text-sm font-bold text-stone-600 hover:border-zinc-500 hover:text-stone-900"
                          >
                            清除
                          </button>
                        </div>
                      </form>
                      <div className="mb-4 overflow-x-auto">
                        <div className="inline-flex min-w-full gap-2 rounded-2xl border border-stone-200 bg-white p-1">
                          {scriptFilters.map((script) => {
                            const active = addGlyphScriptType === script;
                            return (
                              <button
                                key={`add-glyph-script-filter-${script || "all"}`}
                                type="button"
                                onClick={() => {
                                  setAddGlyphScriptType(script);
                                  void searchGlyphsForSet(script);
                                }}
                                disabled={!hasAddGlyphSearchKeyword || (isSearchingForAdd && active)}
                                aria-pressed={active}
                                className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition ${
                                  active
                                    ? "bg-red-800 text-white"
                                    : "text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                                }`}
                              >
                                {script || "全部書體"}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {addGlyphResults.length > 0 && (
                        <div className="max-h-[520px] overflow-y-auto pr-1">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
                            <span>找到 {visibleAddGlyphResults.length} / {addGlyphResults.length} 筆結果，點擊「加入字組」即可加入</span>
                            {addGlyphQueryChars.length > 1 && (
                              <div className="flex flex-wrap gap-1">
                                {addGlyphQueryChars.map((char) => (
                                  <button
                                    key={char}
                                    type="button"
                                    onClick={() => setActiveAddGlyphChar(char)}
                                    className={`inline-flex min-h-7 items-center gap-1 rounded-md border px-2 text-xs font-bold transition-colors ${
                                      activeAddGlyphChar === char
                                        ? "border-red-700 bg-red-700 text-white"
                                        : "border-stone-200 bg-white text-stone-600 hover:border-red-300 hover:text-red-700"
                                    }`}
                                  >
                                    <span className="font-serif text-base leading-none">{char}</span>
                                    <span>{addGlyphResultCounts[char] ?? 0}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-8">
                          {visibleAddGlyphResults.map((g) => {
                            const alreadyIn = set.members.some((m) => m.id === g.id);
                            return (
                              <div key={g.id}
                                className={`grid min-h-[84px] grid-cols-[54px_1fr] overflow-hidden rounded-lg border shadow-sm sm:grid-cols-[60px_1fr] ${alreadyIn ? "border-emerald-200 bg-emerald-50" : "border-stone-200 bg-white"}`}>
                                <a href={`/glyph/${g.id}`} target="_blank" rel="noopener noreferrer"
                                  className="flex min-w-0 items-center justify-center border-r border-stone-100 bg-white/70 p-1.5">
                                  <img src={g.thumbnailUrl ?? g.imageUrl} alt={g.char}
                                    className="h-full max-h-24 w-full object-contain mix-blend-multiply" loading="lazy" />
                                </a>
                                <div className="flex min-w-0 flex-col justify-between gap-1.5 p-2">
                                  <div className="min-w-0">
                                    <div className="flex items-baseline gap-1.5">
                                      <span className="font-serif text-2xl font-bold leading-none text-stone-900">{g.char}</span>
                                      <span className="truncate text-xs font-medium text-stone-500">{g.author || "佚名"}</span>
                                    </div>
                                    <div className="truncate text-[11px] text-stone-500">{g.scriptType || "未標"}｜{g.workTitle || "未標題"}</div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1 text-[10px] text-stone-500">
                                    <span className="rounded bg-stone-100 px-1 py-0.5">品質 {g.qualityScore ?? 0}</span>
                                    <span className="rounded bg-stone-100 px-1 py-0.5">ID {g.id}</span>
                                    {g.visibility === "private" && <span className="rounded bg-red-100 px-1 py-0.5 font-medium text-red-600">私密</span>}
                                  </div>
                                  {alreadyIn ? (
                                    <span className="inline-flex min-h-7 items-center justify-center gap-1 rounded-md bg-emerald-100 px-2 text-[11px] font-bold text-emerald-700">
                                      <Check className="h-3.5 w-3.5" />已在字組
                                    </span>
                                  ) : (
                                    <button onClick={() => void addGlyphToSet(set.id, g.id)}
                                      className="inline-flex min-h-7 items-center justify-center gap-1 rounded-md bg-red-800 px-2 text-[11px] font-bold text-white hover:bg-red-700">
                                      加入字組
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          </div>
                          {visibleAddGlyphResults.length === 0 && (
                            <div className="rounded-lg border border-dashed border-stone-200 bg-white py-6 text-center text-sm text-stone-400">
                              這個字目前沒有搜尋結果
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </section>
      )}

      {activeTab === "security" && (
        <section className="mx-auto max-w-[1600px] px-3 py-4 sm:px-4 sm:py-6">
          <AdminSecurityDashboard />
        </section>
      )}

      {activeTab === "management" && (
        <section className="mx-auto max-w-[1600px] px-3 py-4 sm:px-4 sm:py-6">
          <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2 lg:hidden">
              <Database className="h-5 w-5 text-red-600" />
              <h2 className="text-lg font-bold sm:text-xl">字庫查詢</h2>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void search();
              }}
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              <div className="flex flex-1 items-center gap-2">
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
                  placeholder="輸入中文"
                  disabled={isSearching}
                  className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 outline-none focus:border-red-700 sm:w-40"
                  autoComplete="off"
                />
                <input
                  value={queryAuthor}
                  onChange={(e) => setQueryAuthor(e.target.value)}
                  placeholder="作者"
                  disabled={isSearching}
                  className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 outline-none focus:border-red-700 sm:w-28"
                />
                <input
                  value={queryWorkTitle}
                  onChange={(e) => setQueryWorkTitle(e.target.value)}
                  placeholder="作品名稱"
                  disabled={isSearching}
                  className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 outline-none focus:border-red-700 sm:w-32"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isSearching || !hasSearchKeyword}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-stone-800 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSearching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {isSearching ? "查詢中" : "查詢"}
                </button>
                <button
                  type="button"
                  onClick={clearSearchFilters}
                  disabled={isSearching}
                  className="min-h-10 rounded-xl border border-stone-300 px-4 py-2 text-sm font-bold text-stone-600 hover:border-zinc-500 hover:text-stone-900"
                >
                  清除
                </button>
              </div>
            </form>

            <Link
              href="/admin/upload"
              className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-red-800 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 lg:mt-0 lg:w-auto"
            >
              <ImagePlus className="h-4 w-4" />
              手動上傳字圖
            </Link>
          </div>

          <div className="mb-4 overflow-x-auto">
            <div className="inline-flex min-w-full gap-2 rounded-2xl border border-stone-200 bg-white p-1 shadow-sm">
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
                        : "text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                    }`}
                  >
                    {script || "全部書體"}
                  </button>
                );
              })}
            </div>
          </div>

          {queryMessage && (
            <div className="mb-4 rounded-xl bg-white p-3 text-sm text-stone-600 shadow-sm border border-stone-200">
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
              <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500 sm:p-10 sm:text-base">
                {isSearching ? "正在讀取字圖..." : "輸入字後，進行查詢！"}
              </div>
            ) : (
              <>
                {charTabs.length > 0 && (
                  <div className="mb-4 overflow-x-auto">
                    <div className="inline-flex min-w-full gap-2 rounded-2xl border border-stone-200 bg-white p-1 shadow-sm">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveChar(null);
                        }}
                        aria-pressed={activeChar === null}
                        className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition ${
                          activeChar === null
                            ? "bg-stone-800 text-white"
                            : "text-stone-500 hover:bg-stone-100 hover:text-stone-800"
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
                                ? "bg-stone-800 text-white"
                                : "text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                            }`}
                          >
                            {char} {glyphsByChar[char]?.length ?? 0}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
                {visibleGlyphs.map((glyph) => {
                  const isSelected = selectedGlyphIds.has(glyph.id);
                  return (
                  <div
                    key={glyph.id}
                    className={`flex flex-col rounded-2xl border p-2 shadow-sm transition-shadow hover:shadow-md sm:p-3 ${isSelected ? "border-red-700 bg-red-50" : "border-stone-200 bg-white"}`}
                  >
                    <div className="relative">
                      <GlyphImage glyph={glyph} size={140} containerClassName="h-[120px] w-full sm:h-[140px] sm:w-full" />
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => setSelectedGlyphIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(glyph.id)) next.delete(glyph.id); else next.add(glyph.id);
                          return next;
                        })}
                        className="absolute left-1 top-1 h-4 w-4 accent-red-700 cursor-pointer"
                        aria-label={`選取字圖 ID ${glyph.id}`}
                      />
                      {glyph.setId && (
                        <span className="absolute right-1 top-1 rounded bg-red-700 px-1 py-0.5 text-[9px] font-bold text-white">
                          字組 #{glyph.setId}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-sm font-medium">{glyph.char}｜{glyph.author || "佚名"}</div>
                    <div className="truncate text-xs text-stone-500">{glyph.scriptType || "未標註"}｜{glyph.workTitle || "未標題"}</div>
                    <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-zinc-600 sm:text-xs">
                      <span className="rounded bg-stone-100 px-1.5 py-0.5">讚 {glyph.likeCount ?? 0}</span>
                      <span className="rounded bg-stone-100 px-1.5 py-0.5">集字 {glyph.collectionCount ?? 0}</span>
                      <span className="rounded bg-stone-100 px-1.5 py-0.5">ID {glyph.id}</span>
                    </div>
                    {glyph.ownerUserId && (
                      <div className="mt-1 text-xs font-bold text-red-700">
                        {glyph.visibility === "private" ? "個人私人" : "個人公開"}
                      </div>
                    )}
                    <div className="mt-auto pt-3 flex gap-2">
                      <Link
                        href={glyphEditHref(glyph)}
                        aria-disabled={isForbidden}
                        className={`inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-stone-300 px-2 py-1.5 text-xs font-bold sm:text-sm ${
                          isForbidden
                            ? "pointer-events-none cursor-not-allowed text-stone-400 opacity-50"
                            : "text-stone-600 hover:border-red-700 hover:text-stone-900"
                        }`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        修改
                      </Link>
                      <button
                        onClick={() => void deleteGlyph(glyph.id)}
                        disabled={isForbidden || deletingGlyphId === glyph.id}
                        className="inline-flex items-center justify-center rounded-lg border border-red-900/70 px-2 py-1.5 text-red-400 hover:border-red-500 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-red-900/70 disabled:hover:text-red-400"
                      >
                        {deletingGlyphId === glyph.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  );
                })}
                </div>
                {/* 字組建立面板（固定底部，有選取時才顯示） */}
                {selectedGlyphIds.size > 0 && (
                  <div className="sticky bottom-3 mt-4 rounded-2xl border border-red-200 bg-white/95 p-4 shadow-xl backdrop-blur">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="font-bold text-stone-900">
                        已選取 {selectedGlyphIds.size} 個字圖，建立字組
                      </div>
                      <button
                        type="button"
                        onClick={() => { setSelectedGlyphIds(new Set()); setSetSourceFile(null); setSetCreationMsg(""); }}
                        className="text-xs text-stone-500 hover:text-red-700"
                      >
                        清除選取
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                      <div className="space-y-2">
                        <div>
                          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-stone-500">
                            <span>字組名稱（字圖內容所組成）</span>
                            <button
                              type="button"
                              onClick={() => {
                                const chars = [...selectedGlyphIds]
                                  .map((id) => glyphs.find((g) => g.id === id)?.char ?? "")
                                  .filter(Boolean).join("");
                                setSetName(chars);
                              }}
                              className="text-red-700 hover:text-red-900"
                            >
                              自動帶入字圖內容
                            </button>
                          </div>
                          <input
                            type="text"
                            value={setName}
                            onChange={(e) => setSetName(e.target.value)}
                            placeholder="例如：山水人家"
                            className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-red-700"
                          />
                        </div>
                        <div>
                          <div className="mb-1 text-xs text-stone-500">上傳拆字原圖（選填，自動轉灰階儲存）</div>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => setSetSourceFile(e.target.files?.[0] ?? null)}
                            className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-sm"
                          />
                          {setSourceFile && (
                            <div className="mt-1 text-xs text-stone-500">{setSourceFile.name}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void createGlyphSet()}
                          disabled={isForbidden || isCreatingSet}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-red-800 px-5 font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isCreatingSet ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                          建立字組
                        </button>
                        {setCreationMsg && (
                          <div className={`text-xs ${setCreationMsg.includes("完成") ? "text-emerald-700" : "text-red-700"}`}>
                            {setCreationMsg}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}
      {lightboxSrc && <ImageLightbox src={lightboxSrc} alt="拆字原圖" onClose={() => setLightboxSrc(null)} />}
    </main>
  );
}
