"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BookOpen, Check, CheckCircle2, Database, ExternalLink, Filter, LogIn, LogOut, RefreshCw, Search, Trash2, UserRound, X } from "lucide-react";
import { GlyphImage, type GlyphLike } from "@/components/GlyphImage";
import { LogoMark } from "@/components/LogoMark";
import { GlyphLikeButton } from "@/components/GlyphLikeButton";

type GlyphDto = GlyphLike & {
  source?: string | null;
  license?: string | null;
  qualityScore?: number;
  ownerUserId?: string | null;
  visibility?: string;
  likeCount?: number;
  collectionCount?: number;
  likedByMe?: boolean;
};

type ApiResult = {
  query: string;
  chars: string[];
  results: Record<string, GlyphDto[]>;
  total: number;
  hasMoreByChar?: Record<string, boolean>;
};

type SelectedGlyph = GlyphDto & {
  position: number;
};

type ScriptResponse = {
  scripts: { label: string; count: number }[];
};

type ResultScope = "library" | "all" | "liked" | "personal" | "public";
type ResultSort = "popular" | "newest" | "author" | "script";

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

export default function FrontStagePage() {
  const [q, setQ] = useState("");
  const [isComposingQuery, setIsComposingQuery] = useState(false);
  const [author, setAuthor] = useState("");
  const [collectionTitle, setCollectionTitle] = useState("");
  const [editingCollectionId, setEditingCollectionId] = useState<number | null>(null);
  const [selectedScriptTypes, setSelectedScriptTypes] = useState<string[]>([]);
  const [availableScripts, setAvailableScripts] = useState<string[]>([]);
  const [resultScope, setResultScope] = useState<ResultScope>("library");
  const [resultSort, setResultSort] = useState<ResultSort>("popular");
  const [data, setData] = useState<ApiResult | null>(null);
  const [loadingMoreChars, setLoadingMoreChars] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<SelectedGlyph[]>([]);
  const [activePosition, setActivePosition] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSavingCollection, setIsSavingCollection] = useState(false);
  const [message, setMessage] = useState("");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [isAdminVisible, setIsAdminVisible] = useState(false);
  const [logoClickCount, setLogoClickCount] = useState(0);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const pendingSaveStartedRef = useRef(false);
  const collectionLoadStartedRef = useRef(false);
  const initialGlyphLoadStartedRef = useRef(false);
  const loadMoreSentinelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const loadingMoreCharsRef = useRef<Record<string, boolean>>({});
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  const scriptFilters = useMemo(() => availableScripts, [availableScripts]);
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
    if (message.startsWith("已更新：")) {
      return {
        type: "saved" as const,
        url: message.replace("已更新：", ""),
        title: "集字作品已更新",
        description: "已把目前文字與字圖選擇更新到原本的集字作品。",
      };
    }
    return null;
  }, [message]);

  const resultScopeOptions: { value: ResultScope; label: string }[] = [
    { value: "library", label: "字庫" },
    { value: "all", label: "全部可用" },
    { value: "liked", label: "已按讚" },
    { value: "personal", label: "個人字圖" },
    { value: "public", label: "公開字圖" },
  ];
  const resultSortOptions: { value: ResultSort; label: string }[] = [
    { value: "popular", label: "熱門" },
    { value: "newest", label: "最新" },
    { value: "author", label: "作者" },
    { value: "script", label: "書體" },
  ];

  function toggleScriptFilter(script: string) {
    const next = selectedScriptTypes.includes(script)
      ? selectedScriptTypes.filter((item) => item !== script)
      : [...selectedScriptTypes, script];
    setSelectedScriptTypes(next);
    if (onlyChinese(q)) {
      void searchGlyphs(next, true);
    }
  }

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

    collectionLoadStartedRef.current = true;
    void loadCollectionToWorkspace(collectionId);
  }, [isAuthChecked, user]);

  useEffect(() => {
    if (!isAuthChecked || collectionLoadStartedRef.current || initialGlyphLoadStartedRef.current) return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("collectionId")) return;
    const addGlyphId = url.searchParams.get("addGlyphId");
    const initialQ = onlyChinese(url.searchParams.get("q") ?? "");
    if (!addGlyphId && !initialQ) return;

    initialGlyphLoadStartedRef.current = true;
    async function loadInitialGlyph() {
      let nextQ = initialQ;
      let glyphToSelect: GlyphDto | null = null;
      if (addGlyphId) {
        const res = await fetch(`/api/glyphs/${addGlyphId}`);
        if (res.ok) {
          glyphToSelect = (await res.json()) as GlyphDto;
          nextQ = nextQ || glyphToSelect.char;
          if (!Array.from(nextQ).includes(glyphToSelect.char)) {
            nextQ += glyphToSelect.char;
          }
        }
      }
      if (!nextQ) return;
      setQ(nextQ);
      setCollectionTitle((current) => current || nextQ);
      await searchGlyphs(selectedScriptTypes, true, nextQ);
      if (glyphToSelect) {
        const chars = Array.from(onlyChinese(nextQ));
        const position = Math.max(0, chars.findIndex((char) => char === glyphToSelect?.char));
        setSelected([{ ...glyphToSelect, position }]);
        setActivePosition(position);
        setMessage(`已加入「${glyphToSelect.char}」到目前集字`);
      }
      url.searchParams.delete("addGlyphId");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }

    void loadInitialGlyph();
  }, [isAuthChecked]);

  useEffect(() => {
    async function loadAvailableScripts() {
      if (queryChars.length === 0) {
        setAvailableScripts([]);
        setSelectedScriptTypes([]);
        return;
      }

      const params = new URLSearchParams({ q });
      if (author) params.set("author", author);
      params.set("resultScope", resultScope);

      const res = await fetch(`/api/glyphs/scripts?${params.toString()}`);
      const json = (await res.json()) as ScriptResponse;
      const scripts = sortScriptLabels(json.scripts.map((script) => script.label));
      setAvailableScripts(scripts);
      setSelectedScriptTypes((current) => current.filter((script) => scripts.includes(script)));
    }

    void loadAvailableScripts();
  }, [author, q, queryChars.length, resultScope]);

  async function searchGlyphs(
    nextScriptTypes = selectedScriptTypes,
    preservePosition = false,
    nextQ = q,
    nextResultScope = resultScope,
    nextResultSort = resultSort
  ) {
    const cleanedQ = onlyChinese(nextQ);
    if (cleanedQ !== q) {
      setQ(cleanedQ);
      setSelected([]);
      if (!preservePosition) setActivePosition(null);
    }

    if (!cleanedQ) {
      setData(null);
      setLoading(false);
      setMessage("");
      return;
    }

    setLoading(true);
    setMessage("");
    setLoadingMoreChars({});
    loadMoreSentinelRefs.current = {};
    loadingMoreCharsRef.current = {};
    const params = new URLSearchParams({ q: cleanedQ });
    if (author) params.set("author", author);
    nextScriptTypes.forEach((script) => params.append("scriptTypes", script));
    params.set("resultScope", nextResultScope);
    params.set("sort", nextResultSort);
    params.set("perChar", "24");

    const res = await fetch(`/api/glyphs?${params.toString()}`);
    const json = (await res.json()) as ApiResult;
    setData(json);
    setLoading(false);
  }

  function buildSearchParamsForChar(char: string, offset: number) {
    const params = new URLSearchParams({ char, limit: "24", offset: String(offset) });
    if (author) params.set("author", author);
    selectedScriptTypes.forEach((script) => params.append("scriptTypes", script));
    params.set("resultScope", resultScope);
    params.set("sort", resultSort);
    return params;
  }

  async function loadMoreForChar(char: string) {
    if (!data || loadingMoreCharsRef.current[char]) return;
    const offset = data.results[char]?.length ?? 0;
    loadingMoreCharsRef.current = { ...loadingMoreCharsRef.current, [char]: true };
    setLoadingMoreChars((current) => ({ ...current, [char]: true }));
    try {
      const res = await fetch(`/api/glyphs?${buildSearchParamsForChar(char, offset).toString()}`);
      const json = (await res.json()) as ApiResult;
      const nextGlyphs = json.results[char] ?? [];
      setData((current) => {
        if (!current) return current;
        const existing = current.results[char] ?? [];
        const existingIds = new Set(existing.map((glyph) => glyph.id));
        const merged = [...existing, ...nextGlyphs.filter((glyph) => !existingIds.has(glyph.id))];
        return {
          ...current,
          results: { ...current.results, [char]: merged },
          total: current.total + merged.length - existing.length,
          hasMoreByChar: {
            ...(current.hasMoreByChar ?? {}),
            [char]: Boolean(json.hasMoreByChar?.[char]),
          },
        };
      });
    } finally {
      loadingMoreCharsRef.current = { ...loadingMoreCharsRef.current, [char]: false };
      setLoadingMoreChars((current) => ({ ...current, [char]: false }));
    }
  }

  useEffect(() => {
    if (!data || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const char = entry.target.getAttribute("data-char");
          if (!char || !data.hasMoreByChar?.[char] || loadingMoreCharsRef.current[char]) continue;
          void loadMoreForChar(char);
        }
      },
      { rootMargin: "520px 0px" }
    );

    for (const { char } of visibleChars) {
      const node = loadMoreSentinelRefs.current[char];
      if (node && data.hasMoreByChar?.[char]) {
        observer.observe(node);
      }
    }

    return () => observer.disconnect();
  }, [data, loadingMoreChars, visibleChars]);

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

  function updateGlyphLike(glyphId: number, stats: { liked: boolean; likeCount: number; collectionCount: number }) {
    const patchGlyph = <T extends GlyphDto>(glyph: T): T =>
      glyph.id === glyphId
        ? { ...glyph, likedByMe: stats.liked, likeCount: stats.likeCount, collectionCount: stats.collectionCount }
        : glyph;
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        results: Object.fromEntries(
          Object.entries(current.results).map(([char, glyphs]) => [char, glyphs.map(patchGlyph)])
        ),
      };
    });
    setSelected((items) => items.map(patchGlyph));
  }

  useEffect(() => {
    function handleGlyphLikeUpdate(event: Event) {
      const detail = (event as CustomEvent<{ glyphId: number; liked: boolean; likeCount: number; collectionCount: number }>).detail;
      if (!detail) return;
      updateGlyphLike(detail.glyphId, {
        liked: detail.liked,
        likeCount: detail.likeCount,
        collectionCount: detail.collectionCount,
      });
    }

    window.addEventListener("moscript:glyph-like-updated", handleGlyphLikeUpdate);
    return () => window.removeEventListener("moscript:glyph-like-updated", handleGlyphLikeUpdate);
  }, []);

  function removeSelected(position: number) {
    setSelected((prev) => prev.filter((item) => item.position !== position));
  }

  function toggleActivePosition(position: number) {
    setActivePosition((prev) => (prev === position ? null : position));
    if (!data || data.query !== onlyChinese(q)) {
      void searchGlyphs(selectedScriptTypes, true);
    }
  }

  function restoreWorkspaceFromPayload(payload: CollectionSavePayload) {
    setQ(payload.text);
    setCollectionTitle(payload.title || payload.text);
    setAuthor(payload.author ?? "");
    setSelectedScriptTypes(payload.scriptType ? payload.scriptType.split(",").map((script) => script.trim()).filter(Boolean) : []);
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
      setCollectionTitle(json.collection.title || json.collection.text);
      setEditingCollectionId(Number(json.collection.id));
      setAuthor("");
      setSelectedScriptTypes(loadedScriptType ? [loadedScriptType] : []);
      setSelected(selectedGlyphs);
      setActivePosition(null);

      const params = new URLSearchParams({ q: onlyChinese(json.collection.text) });
      if (loadedScriptType) params.append("scriptTypes", loadedScriptType);
      params.set("resultScope", resultScope);
      params.set("sort", resultSort);
      const glyphsRes = await fetch(`/api/glyphs?${params.toString()}`);
      const glyphsJson = (await glyphsRes.json()) as ApiResult;
      setData(glyphsJson);
      setMessage("已載入集字作品，並帶出可替換的字圖");

      const url = new URL(window.location.href);
      url.searchParams.delete("collectionId");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    } finally {
      setLoading(false);
    }
  }

  async function saveCollectionPayload(
    payload: CollectionSavePayload,
    options: { clearPendingOnSuccess?: boolean; collectionId?: number | null } = {}
  ) {
    setIsSavingCollection(true);
    try {
      const isUpdate = Boolean(options.collectionId);
      const res = await fetch(isUpdate ? `/api/collections/${options.collectionId}` : "/api/collections", {
        method: isUpdate ? "PATCH" : "POST",
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
      setMessage(isUpdate ? `已更新：${json.url}` : json.duplicate ? `已存在：${json.url}` : `已儲存：${json.url}`);
    } finally {
      setIsSavingCollection(false);
    }
  }

  async function saveCollection() {
    if (isSavingCollection) return;
    const payload: CollectionSavePayload = {
      title: collectionTitle.trim() || q,
      text: q,
      author,
      scriptType: selectedScriptTypes.join(","),
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

  async function updateLoadedCollection() {
    if (!editingCollectionId || isSavingCollection) return;
    const payload: CollectionSavePayload = {
      title: collectionTitle.trim() || q,
      text: q,
      author,
      scriptType: selectedScriptTypes.join(","),
      selectedGlyphs: selected,
      items: selected.map((item) => ({
        glyphId: item.id,
        char: item.char,
        position: item.position,
      })),
    };
    setMessage("");
    await saveCollectionPayload(payload, { collectionId: editingCollectionId });
  }

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <LogoMark
                onClick={handleLogoClick}
                title={logoClickCount > 0 ? `距離解鎖還有 ${10 - logoClickCount} 步` : undefined}
                imageClassName="h-10 w-10 sm:h-12 sm:w-12"
              />
              <div>
                <h1 className="sr-only">墨跡字帖</h1>
                <p className="text-xs font-medium leading-snug text-stone-500 sm:text-sm">從字形到心境，重新認識書法之美</p>
              </div>
            </div>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
            {user ? (
              <form action="/api/auth/logout?returnTo=/" method="post" onSubmit={handleLogout} className="contents sm:flex sm:items-center sm:gap-2">
                <span className="hidden max-w-[220px] truncate text-sm text-stone-500 md:inline">
                  {user.email}
                </span>
                <button
                  type="submit"
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700 hover:border-red-700 hover:text-stone-900 sm:px-4 sm:text-sm"
                >
                  <LogOut className="h-4 w-4" />
                  登出
                </button>
              </form>
            ) : (
              <Link
                href="/api/auth/google?returnTo=/"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700 hover:border-red-700 hover:text-stone-900 sm:px-4 sm:text-sm"
              >
                <LogIn className="h-4 w-4" />
                Google 登入
              </Link>
            )}
            {user && (
              <Link
                href="/me"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700 hover:border-red-700 hover:text-stone-900 sm:px-4 sm:text-sm"
              >
                <UserRound className="h-4 w-4" />
                個人頁
              </Link>
            )}
            {isAdminVisible && (
              <Link
                href="/admin"
                className="col-span-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-stone-800 px-3 py-2 text-xs font-bold text-white hover:bg-stone-900 sm:col-span-1 sm:px-4 sm:text-sm"
              >
                <Database className="h-4 w-4" />
                後台管理
              </Link>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
        <div className="space-y-4 sm:space-y-6">
          <section className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm sm:rounded-3xl sm:p-4 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
            <div className="grid gap-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void searchGlyphs();
              }}
              className="grid gap-2 sm:gap-3"
            >
              <div className="flex gap-2">
                <label className="relative block flex-1">
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
                      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                      searchTimeoutRef.current = setTimeout(() => void searchGlyphs(selectedScriptTypes, false, nextQ), 500);
                    }}
                    onChange={(e) => {
                      const nativeEvent = e.nativeEvent as InputEvent;
                      const nextQ =
                        isComposingQuery || nativeEvent.isComposing
                          ? e.target.value
                          : onlyChinese(e.target.value);
                      setQ(nextQ);
                      
                      if (!isComposingQuery && !nativeEvent.isComposing) {
                        setSelected([]);
                        setActivePosition(null);
                        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                        searchTimeoutRef.current = setTimeout(() => void searchGlyphs(selectedScriptTypes, false, nextQ), 500);
                      }
                    }}
                    className="w-full rounded-xl border border-stone-300 bg-stone-50 py-3 pl-10 pr-10 text-base outline-none focus:border-red-700 sm:rounded-2xl sm:pr-12 sm:text-lg"
                    placeholder="輸入中文，例如：小橋流水人家"
                    inputMode="text"
                    autoComplete="off"
                  />
                  {q && (
                    <button
                      type="button"
                      onClick={() => {
                        setQ("");
                        setSelected([]);
                        setActivePosition(null);
                        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                        void searchGlyphs(selectedScriptTypes, false, "");
                      }}
                      className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-200 hover:text-stone-600 sm:right-3"
                      aria-label="清除搜尋"
                      title="清除搜尋"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  className={`inline-flex items-center justify-center rounded-xl border px-3 sm:hidden ${
                    isFilterOpen || author || resultScope !== "library" || resultSort !== "popular" || selectedScriptTypes.length > 0
                      ? "border-red-700 bg-red-50 text-red-800"
                      : "border-stone-300 bg-stone-50 text-stone-600"
                  }`}
                >
                  <Filter className="h-5 w-5" />
                </button>
              </div>
              
              <div className={`grid gap-2 sm:gap-3 ${isFilterOpen ? "block" : "hidden sm:grid"}`}>
                <input
                  value={author}
                  onChange={(e) => {
                    setAuthor(e.target.value);
                    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                    searchTimeoutRef.current = setTimeout(() => void searchGlyphs(selectedScriptTypes, false, q), 500);
                  }}
                  className="rounded-xl border border-stone-300 bg-stone-50 px-3 py-3 outline-none focus:border-red-700 sm:rounded-2xl sm:px-4"
                  placeholder="作者"
                />
                <input
                  value={collectionTitle}
                  onChange={(e) => setCollectionTitle(e.target.value)}
                  className="rounded-xl border border-stone-300 bg-stone-50 px-3 py-3 outline-none focus:border-red-700 sm:rounded-2xl sm:px-4"
                  placeholder="作品標題"
                />
              </div>
            </form>
            <div className={`grid gap-2 rounded-2xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600 ${isFilterOpen ? "block" : "hidden sm:grid"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-stone-700">查詢範圍</span>
                {resultScopeOptions.map((option) => {
                  const active = resultScope === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setResultScope(option.value);
                        if (onlyChinese(q)) {
                          void searchGlyphs(selectedScriptTypes, true, q, option.value, resultSort);
                        }
                      }}
                      className={`rounded-xl px-3 py-2 text-sm font-bold ${
                        active
                          ? "bg-red-800 text-white"
                          : "border border-stone-300 bg-white text-stone-700 hover:border-red-700"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-stone-700">排序</span>
                {resultSortOptions.map((option) => {
                  const active = resultSort === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setResultSort(option.value);
                        if (onlyChinese(q)) {
                          void searchGlyphs(selectedScriptTypes, true, q, resultScope, option.value);
                        }
                      }}
                      className={`rounded-xl px-3 py-2 text-sm font-bold ${
                        active
                          ? "bg-stone-800 text-white"
                          : "border border-stone-300 bg-white text-stone-700 hover:border-red-700"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className={`overflow-x-auto ${isFilterOpen ? "block" : "hidden sm:block"}`}>
              <div className="inline-flex min-w-full gap-2 rounded-2xl border border-stone-200 bg-stone-50 p-1 lg:flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedScriptTypes([]);
                    void searchGlyphs([]);
                  }}
                  disabled={loading && selectedScriptTypes.length === 0}
                  aria-pressed={selectedScriptTypes.length === 0}
                  className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition ${
                    selectedScriptTypes.length === 0
                      ? "bg-red-800 text-white"
                      : "text-stone-500 hover:bg-stone-200 hover:text-stone-800"
                  }`}
                >
                  全部書體
                </button>
                {scriptFilters.map((script) => {
                  const active = selectedScriptTypes.includes(script);
                  return (
                    <button
                      key={script}
                      type="button"
                      onClick={() => toggleScriptFilter(script)}
                      disabled={loading && active}
                      aria-pressed={active}
                      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition ${
                        active
                          ? "bg-red-800 text-white"
                          : "text-stone-500 hover:bg-stone-200 hover:text-stone-800"
                      }`}
                    >
                      {active ? <Check className="h-3.5 w-3.5" /> : null}
                      {script}
                    </button>
                  );
                })}
              </div>
            </div>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3 lg:min-h-full">
              <div className="mb-3 flex items-start justify-between gap-3 sm:items-center">
                <div className="flex min-w-0 items-center gap-2">
                  <BookOpen className="h-5 w-5 text-red-600" />
                  <div className="min-w-0">
                    <h2 className="font-bold font-serif">目前集字</h2>
                    <p className="text-xs text-stone-500 sm:text-sm">
                      {editingCollectionId
                        ? `正在編輯：${collectionTitle.trim() || q || "未命名集字作品"}`
                        : "點選單字可聚焦搜尋結果"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {activePosition !== null && (
                    <button
                      type="button"
                      onClick={() => setActivePosition(null)}
                      className="rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold text-stone-600 hover:border-red-700 hover:text-stone-900 sm:text-sm"
                    >
                      顯示全部
                    </button>
                  )}
                  {editingCollectionId ? (
                    <>
                      <button
                        type="button"
                        onClick={updateLoadedCollection}
                        disabled={isSavingCollection}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-800 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                      >
                        {isSavingCollection ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        <span>{isSavingCollection ? "更新中" : "更新作品"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={saveCollection}
                        disabled={isSavingCollection}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-700 hover:border-red-700 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                      >
                        另存新作品
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={saveCollection}
                      disabled={isSavingCollection}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-800 px-3 py-2 text-xs font-bold text-white hover:bg-stone-900 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                    >
                      {isSavingCollection ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      <span className="sm:hidden">{isSavingCollection ? "儲存中" : "儲存集字"}</span>
                      <span className="hidden sm:inline">{isSavingCollection ? "儲存中" : "儲存集字作品"}</span>
                    </button>
                  )}
                </div>
              </div>

              {queryChars.length === 0 ? (
                <p className="text-sm text-stone-500">請輸入文字。</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 min-[420px]:grid-cols-4 sm:flex sm:flex-wrap">
                  {queryChars.map((char, index) => {
                    const glyph = selected.find((item) => item.position === index);
                    const active = activePosition === index;
                    return (
                      <div key={`${char}-selected-${index}`} className="group relative w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => toggleActivePosition(index)}
                          aria-pressed={active}
                          className={`block w-full rounded-xl border p-1 transition sm:w-auto ${
                            active
                              ? "border-red-700 bg-red-700/10"
                              : "border-transparent hover:border-stone-400"
                          }`}
                        >
                          {glyph ? (
                            <GlyphImage glyph={glyph} size={110} containerClassName="h-[82px] w-full sm:h-[110px] sm:w-[110px]" />
                          ) : (
                            <div className="flex h-[82px] w-full items-center justify-center rounded-xl border border-zinc-200 bg-white font-serif text-4xl text-zinc-600 sm:h-[110px] sm:w-[110px] sm:text-5xl">
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
                        {glyph && (
                          <Link
                            href={`/practice/${glyph.id}`}
                            className="absolute bottom-1 left-1 rounded-lg bg-white/90 px-2 py-1 text-xs font-bold text-stone-700 shadow-sm hover:text-red-800"
                          >
                            練習
                          </Link>
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
          </section>

          <section className="relative min-h-[320px] rounded-2xl border border-stone-200 bg-white p-3 sm:min-h-[400px] sm:rounded-3xl sm:p-4">
            {loading && (
              <div className="absolute left-0 right-0 top-0 h-1 overflow-hidden rounded-t-2xl sm:rounded-t-3xl">
                <div className="h-full w-full origin-left animate-[progress_1s_ease-in-out_infinite] bg-red-700/80" />
              </div>
            )}
            <style dangerouslySetInnerHTML={{ __html: `
              @keyframes progress {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
              }
            `}} />
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-stone-600 sm:text-base">
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
              <div className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-stone-500 sm:p-10">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-stone-100">
                  <Search className="h-8 w-8 text-stone-400" />
                </div>
                <h3 className="mb-2 text-lg font-bold text-stone-700">開始探索書法之美</h3>
                <p className="text-sm sm:text-base">在上方輸入文字並按下搜尋，系統會依每個字顯示可用的書法字圖。</p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setQ("小橋流水人家");
                      void searchGlyphs(selectedScriptTypes, false, "小橋流水人家");
                    }}
                    className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-red-800"
                  >
                    試試「小橋流水人家」
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQ("墨跡");
                      void searchGlyphs(selectedScriptTypes, false, "墨跡");
                    }}
                    className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-red-800"
                  >
                    試試「墨跡」
                  </button>
                </div>
              </div>
            )}

            {data && visibleChars.map(({ char, index }) => {
              const glyphs = data.results[char] ?? [];
              return (
                <div key={`${char}-${index}`} className="mb-6 last:mb-0">
                  {glyphs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl bg-stone-50 p-6 text-center text-stone-500">
                      <p className="mb-3">目前資料庫沒有這個字「{char}」。</p>
                      {user ? (
                        <Link
                          href="/upload"
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-800 px-4 py-2 text-sm font-bold text-white hover:bg-stone-900"
                        >
                          上傳「{char}」的字圖
                        </Link>
                      ) : (
                        <Link
                          href="/api/auth/google?returnTo=/upload"
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-red-800"
                        >
                          登入以貢獻字圖
                        </Link>
                      )}
                    </div>
                  ) : (
                    <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 xl:grid-cols-6">
                      {glyphs.map((glyph) => {
                        const selectedAtPosition = selected.some((item) => item.position === index && item.id === glyph.id);
                        const selectedElsewhere = !selectedAtPosition && selected.some((item) => item.id === glyph.id);
                        return (
                        <div
                          key={glyph.id}
                          className={`relative rounded-2xl border p-2 text-left hover:border-red-700 sm:p-3 ${
                            selectedAtPosition
                              ? "border-red-700 bg-red-50 shadow-[0_0_0_3px_rgba(185,28,28,0.12)]"
                              : selectedElsewhere
                              ? "border-amber-300 bg-amber-50"
                              : "border-stone-200 bg-stone-50"
                          }`}
                        >
                          {(selectedAtPosition || selectedElsewhere) && (
                            <div className={`absolute right-2 top-2 z-10 rounded-full px-2 py-1 text-xs font-bold ${
                              selectedAtPosition ? "bg-red-800 text-white" : "bg-amber-600 text-white"
                            }`}>
                              {selectedAtPosition ? "已選" : "已在集字"}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => pickGlyph(glyph, index)}
                            className="block w-full text-left"
                          >
                            <GlyphImage glyph={glyph} size={110} containerClassName="h-[96px] w-full sm:h-[110px] sm:w-full" />
                            <div className="mt-2 text-sm font-medium text-stone-700">{glyph.author || "佚名"}</div>
                            <div className="truncate text-xs text-stone-500">{glyph.scriptType || "未標註"}｜{glyph.workTitle || "未標題"}</div>
                            {glyph.ownerUserId && (
                              <div className="mt-1 text-xs font-bold text-red-700">
                                {glyph.visibility === "private" ? "私人字圖" : "個人公開"}
                              </div>
                            )}
                          </button>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-stone-500">
                            <GlyphLikeButton
                              glyphId={glyph.id}
                              initialLiked={Boolean(glyph.likedByMe)}
                              initialLikeCount={glyph.likeCount ?? 0}
                              initialCollectionCount={glyph.collectionCount ?? 0}
                              isAuthenticated={Boolean(user)}
                              returnTo="/"
                              className="w-full"
                              onChange={(stats) => updateGlyphLike(glyph.id, stats)}
                            />
                            <div className="inline-flex items-center justify-center rounded-xl border border-stone-200 bg-white px-2 py-2 font-bold text-stone-600">
                              集字 {glyph.collectionCount ?? 0}
                            </div>
                          </div>
                          <Link
                            href={`/practice/${glyph.id}`}
                            className="mt-2 inline-flex w-full items-center justify-center rounded-xl border border-stone-300 px-3 py-2 text-sm font-bold text-stone-600 hover:border-red-700 hover:text-stone-900"
                          >
                            練習
                          </Link>
                          <Link
                            href={`/glyph/${glyph.id}`}
                            className="mt-2 inline-flex w-full items-center justify-center rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-stone-600 hover:border-red-700 hover:text-red-800"
                          >
                            字圖詳情
                          </Link>
                        </div>
                      );
                      })}
                    </div>
                    {data.hasMoreByChar?.[char] && (
                      <>
                        <div
                          ref={(node) => {
                            loadMoreSentinelRefs.current[char] = node;
                          }}
                          data-char={char}
                          className="h-1"
                        />
                        <div className="mt-3 flex justify-center">
                          <button
                            type="button"
                            onClick={() => void loadMoreForChar(char)}
                            disabled={Boolean(loadingMoreChars[char])}
                            className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {loadingMoreChars[char] ? "載入中..." : `載入更多「${char}」`}
                          </button>
                        </div>
                      </>
                    )}
                    </>
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
