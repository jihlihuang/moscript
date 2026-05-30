"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BookOpen, Check, CheckCircle2, Database, ExternalLink, Filter, LogIn, Menu, RefreshCw, Search, UserRound, X } from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";
import { ImageLightbox } from "@/components/ImageLightbox";
import { toast } from "sonner";
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
  sourceSetId?: number | null;
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
  const [searchTab, setSearchTab] = useState<"glyphs" | "sets">("glyphs");
  const [setsQuery, setSetsQuery] = useState("");
  const [isComposingSetsQuery, setIsComposingSetsQuery] = useState(false);
  type SetSearchMember = { id: number; char: string; author: string | null; scriptType: string | null; workTitle: string | null; qualityScore: number; imageUrl: string; thumbnailUrl: string | null };
  type SetSearchResult = { id: number; name: string | null; members: SetSearchMember[]; sourceImageUrl: string | null; createdAt: string };
  const [setsResults, setSetsResults] = useState<SetSearchResult[]>([]);
  const [selectedSetSource, setSelectedSetSource] = useState<{ id: number; name: string | null; sourceImageUrl: string | null } | null>(null);
  const [selectedSetResultGlyphs, setSelectedSetResultGlyphs] = useState<GlyphDto[]>([]);
  const [setsLoading, setSetsLoading] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [isComposingQuery, setIsComposingQuery] = useState(false);
  const [author, setAuthor] = useState("");
  const [collectionTitle, setCollectionTitle] = useState("");
  const [editingCollectionId, setEditingCollectionId] = useState<number | null>(null);
  const [selectedScriptTypes, setSelectedScriptTypes] = useState<string[]>([]);
  const [availableScripts, setAvailableScripts] = useState<string[]>([]);
  const [resultScope, setResultScope] = useState<ResultScope>("all");
  const [resultSort, setResultSort] = useState<ResultSort>("popular");
  const [data, setData] = useState<ApiResult | null>(null);
  const [loadingMoreChars, setLoadingMoreChars] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<SelectedGlyph[]>([]);
  const [activePosition, setActivePosition] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSavingCollection, setIsSavingCollection] = useState(false);
  const [message, setMessage] = useState("");
  const [duplicateConflict, setDuplicateConflict] = useState<{ id: number; url: string; payload: CollectionSavePayload } | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [isAdminVisible, setIsAdminVisible] = useState(false);
  const [logoClickCount, setLogoClickCount] = useState(0);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);
  const [topChars, setTopChars] = useState<string[]>([]);
  const pendingSaveStartedRef = useRef(false);
  const collectionLoadStartedRef = useRef(false);
  const initialGlyphLoadStartedRef = useRef(false);
  const loadMoreSentinelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const loadingMoreCharsRef = useRef<Record<string, boolean>>({});
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const setsSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
  const isSetResultMode = selectedSetResultGlyphs.length > 0;

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
        description: "系統找到相同文字與相同字圖選擇，你可以更新集字作品或取消這次集字。",
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
    async function loadSuggestions() {
      try {
        const res = await fetch("/api/glyphs/top-chars");
        const json = (await res.json()) as { suggestions: string[] };
        setTopChars(json.suggestions ?? []);
      } catch {
        // non-critical, silently ignore
      }
    }
    void loadSuggestions();
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

  async function searchSets(keyword = setsQuery) {
    if (!keyword.trim()) { setSetsResults([]); return; }
    setSetsLoading(true);
    try {
      const res = await fetch(`/api/glyph-sets?q=${encodeURIComponent(keyword.trim())}&limit=30`);
      if (!res.ok) return;
      const json = await res.json() as { sets: typeof setsResults };
      setSetsResults(json.sets);
    } finally {
      setSetsLoading(false);
    }
  }

  function scheduleSetSearch(keyword: string) {
    if (setsSearchTimeoutRef.current) clearTimeout(setsSearchTimeoutRef.current);
    setsSearchTimeoutRef.current = setTimeout(() => void searchSets(keyword), 500);
  }

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
      setSelectedSetSource(null);
      setSelectedSetResultGlyphs([]);
      if (!preservePosition) setActivePosition(null);
    }

    if (!cleanedQ) {
      setData(null);
      setLoading(false);
      setMessage("");
      return;
    }

    if (!preservePosition) {
      setSelectedSetSource(null);
      setSelectedSetResultGlyphs([]);
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

  function setSearchDataFromSet(set: SetSearchResult) {
    const setText = onlyChinese(set.name ?? "") || set.members.map((member) => member.char).join("");
    const glyphsInOrder = set.members.map((member) => ({
      id: member.id,
      char: member.char,
      author: member.author,
      scriptType: member.scriptType,
      workTitle: member.workTitle,
      imageUrl: member.imageUrl,
      thumbnailUrl: member.thumbnailUrl,
      qualityScore: member.qualityScore,
      likeCount: 0,
      collectionCount: 0,
      likedByMe: false,
    }));
    const results = set.members.reduce<Record<string, GlyphDto[]>>((acc, member) => {
      const glyph: GlyphDto = {
        id: member.id,
        char: member.char,
        author: member.author,
        scriptType: member.scriptType,
        workTitle: member.workTitle,
        imageUrl: member.imageUrl,
        thumbnailUrl: member.thumbnailUrl,
        qualityScore: member.qualityScore,
        likeCount: 0,
        collectionCount: 0,
        likedByMe: false,
      };
      (acc[member.char] ??= []).push(glyph);
      return acc;
    }, {});

    setQ(setText);
    setCollectionTitle(set.name || setText);
    setSelectedSetSource({ id: set.id, name: set.name, sourceImageUrl: set.sourceImageUrl });
    setSelectedSetResultGlyphs(glyphsInOrder);
    setActivePosition(null);
    setData({
      query: setText,
      chars: [...new Set(Array.from(setText).filter((char) => char.trim() !== ""))],
      results,
      total: set.members.length,
      hasMoreByChar: {},
    });
  }

  function addSetToCollection(set: SetSearchResult) {
    setSearchDataFromSet(set);
    const selectedGlyphs = set.members.map((member, index) => ({
      id: member.id,
      char: member.char,
      author: member.author,
      scriptType: member.scriptType,
      workTitle: member.workTitle,
      imageUrl: member.imageUrl,
      thumbnailUrl: member.thumbnailUrl,
      qualityScore: member.qualityScore,
      likeCount: 0,
      collectionCount: 0,
      likedByMe: false,
      position: index,
    }));
    setSelected(selectedGlyphs);
    setMessage(`已將字組「${set.name || `#${set.id}`}」加入目前集字`);
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
    setSelectedSetSource(payload.sourceSetId ? {
      id: payload.sourceSetId,
      name: null,
      sourceImageUrl: `/api/glyph-sets/${payload.sourceSetId}/source`,
    } : null);
    setSelectedSetResultGlyphs([]);
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
      setSelectedSetSource(json.collection.source_set_id ? {
        id: Number(json.collection.source_set_id),
        name: json.collection.source_set_name ?? null,
        sourceImageUrl: `/api/glyph-sets/${json.collection.source_set_id}/source`,
      } : null);
      setSelectedSetResultGlyphs([]);
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
      if (!isUpdate && json.duplicate) {
        setDuplicateConflict({ id: Number(json.id), url: json.url, payload });
        setMessage(`已存在：${json.url}`);
        return;
      }
      setDuplicateConflict(null);
      setMessage(isUpdate ? `已更新：${json.url}` : `已儲存：${json.url}`);
    } finally {
      setIsSavingCollection(false);
    }
  }

  async function overwriteDuplicateCollection() {
    if (!duplicateConflict || isSavingCollection) return;
    setMessage("");
    await saveCollectionPayload(duplicateConflict.payload, { collectionId: duplicateConflict.id });
    setEditingCollectionId(duplicateConflict.id);
    setDuplicateConflict(null);
  }

  function cancelDuplicateCollection() {
    setDuplicateConflict(null);
    setMessage("");
    setSelected([]);
    setActivePosition(null);
    setSelectedSetSource(null);
    setSelectedSetResultGlyphs([]);
  }

  async function saveCollection() {
    if (isSavingCollection) return;
    if (selected.length === 0) {
      toast.error("請先從搜尋結果中選取至少一個字圖");
      return;
    }
    const payload: CollectionSavePayload = {
      title: collectionTitle.trim() || q,
      text: q,
      author,
      scriptType: selectedScriptTypes.join(","),
      sourceSetId: selectedSetSource?.id ?? null,
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
      sourceSetId: selectedSetSource?.id ?? null,
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
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-3 sm:px-4 sm:py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <LogoMark
                onClick={handleLogoClick}
                title={logoClickCount > 0 ? `距離解鎖還有 ${10 - logoClickCount} 步` : undefined}
                imageClassName="h-9 w-9 sm:h-12 sm:w-12"
                showAllMobile
              />
              <div>
                <h1 className="sr-only">墨跡字帖</h1>
                <p className="hidden text-xs font-medium leading-snug text-stone-500 sm:block sm:text-sm">從字形到心境，重新認識書法之美</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-2">
                <span className="hidden max-w-[180px] truncate text-sm text-stone-500 md:inline">
                  {user.email}
                </span>
                <LogoutButton
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700 hover:border-red-700 hover:text-stone-900 sm:px-4 sm:text-sm"
                  labelClassName="hidden sm:inline"
                  onBeforeLogout={handleLogout}
                />
              </div>
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
                className="hidden sm:inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700 hover:border-red-700 hover:text-stone-900 sm:px-4 sm:text-sm"
              >
                <UserRound className="h-4 w-4" />
                個人頁
              </Link>
            )}

            {isAdminVisible && (
              <Link
                href="/admin"
                className="hidden sm:inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-stone-800 px-3 py-2 text-xs font-bold text-white hover:bg-stone-900 sm:px-4 sm:text-sm"
              >
                <Database className="h-4 w-4" />
                後台管理
              </Link>
            )}

            {user && (
              <div className="relative sm:hidden">
                <button
                  type="button"
                  onClick={() => setIsNavMenuOpen((v) => !v)}
                  className="inline-flex min-h-10 w-10 items-center justify-center rounded-xl border border-stone-300 text-stone-700 hover:border-red-700 hover:text-stone-900"
                  aria-label="更多選項"
                >
                  {isNavMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                </button>
                {isNavMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsNavMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-full z-50 mt-1 min-w-[120px] rounded-xl border border-stone-200 bg-white py-1 shadow-lg">
                      <Link
                        href="/me"
                        onClick={() => setIsNavMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-stone-700 hover:bg-stone-50 hover:text-red-800"
                      >
                        <UserRound className="h-4 w-4" />
                        個人頁
                      </Link>
                      {isAdminVisible && (
                        <Link
                          href="/admin"
                          onClick={() => setIsNavMenuOpen(false)}
                          className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-stone-700 hover:bg-stone-50 hover:text-red-800"
                        >
                          <Database className="h-4 w-4" />
                          後台管理
                        </Link>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6 lg:grid lg:grid-cols-[272px_minmax(0,1fr)_296px] lg:items-start lg:gap-4">

        {/* LEFT: Search + Filters */}
        <aside className="space-y-3 lg:sticky lg:top-[81px]">
          {/* 頁籤切換 */}
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1">
            {([["glyphs", "字圖查詢"], ["sets", "字組查詢"]] as const).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => { setSearchTab(tab); setSetsResults([]); }}
                className={`min-h-9 rounded-lg text-sm font-bold transition ${
                  searchTab === tab ? "bg-white text-red-800 shadow-sm" : "text-stone-500 hover:text-stone-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {searchTab === "sets" ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
              <form onSubmit={(e) => { e.preventDefault(); void searchSets(); }} className="space-y-2">
                <div>
                  <label className="relative block">
                    <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-500" />
                    <input
                      value={setsQuery}
                      onCompositionStart={() => setIsComposingSetsQuery(true)}
                      onCompositionEnd={(e) => {
                        setIsComposingSetsQuery(false);
                        const nextQuery = e.currentTarget.value;
                        setSetsQuery(nextQuery);
                        scheduleSetSearch(nextQuery);
                      }}
                      onChange={(e) => {
                        const nativeEvent = e.nativeEvent as InputEvent;
                        const nextQuery = e.target.value;
                        setSetsQuery(nextQuery);
                        if (!isComposingSetsQuery && !nativeEvent.isComposing) {
                          scheduleSetSearch(nextQuery);
                        }
                      }}
                      placeholder="輸入字組關鍵字"
                      className="w-full rounded-xl border border-stone-300 bg-stone-50 py-2 pl-10 pr-10 outline-none focus:border-red-700"
                      autoComplete="off"
                    />
                    {setsQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setSetsQuery("");
                          setSetsResults([]);
                          setData(null);
                          setQ("");
                          setSelected([]);
                          setActivePosition(null);
                          setSelectedSetSource(null);
                          setSelectedSetResultGlyphs([]);
                          setMessage("");
                          setDuplicateConflict(null);
                          if (setsSearchTimeoutRef.current) clearTimeout(setsSearchTimeoutRef.current);
                        }}
                        className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-200 hover:text-stone-600"
                        aria-label="清除字組搜尋"
                        title="清除搜尋"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    )}
                  </label>
                </div>
              </form>
            </div>
          ) : (<>
          <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void searchGlyphs();
              }}
              className="space-y-2"
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
                      if (selected.length > 0) toast("已清除集字選取");
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
                        if (selected.length > 0) toast("已清除集字選取");
                        setSelected([]);
                        setActivePosition(null);
                        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                        searchTimeoutRef.current = setTimeout(() => void searchGlyphs(selectedScriptTypes, false, nextQ), 500);
                      }
                    }}
                    className="w-full rounded-xl border border-stone-300 bg-stone-50 py-3 pl-10 pr-10 text-base outline-none focus:border-red-700"
                    placeholder="輸入中文，例如：小橋流水人家"
                    inputMode="text"
                    autoComplete="off"
                  />
                  {q && (
                    <button
                      type="button"
                      onClick={() => {
                        setQ("");
                        if (selected.length > 0) toast("已清除集字選取");
                        setSelected([]);
                        setActivePosition(null);
                        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                        void searchGlyphs(selectedScriptTypes, false, "");
                      }}
                      className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-200 hover:text-stone-600"
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
                  className={`inline-flex items-center justify-center rounded-xl border px-3 lg:hidden ${
                    isFilterOpen || author || resultScope !== "all" || resultSort !== "popular" || selectedScriptTypes.length > 0
                      ? "border-red-700 bg-red-50 text-red-800"
                      : "border-stone-300 bg-stone-50 text-stone-600"
                  }`}
                >
                  <Filter className="h-5 w-5" />
                </button>
              </div>

              <div className={`space-y-2 ${isFilterOpen ? "block" : "hidden lg:block"}`}>
                <input
                  value={author}
                  onChange={(e) => {
                    setAuthor(e.target.value);
                    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                    searchTimeoutRef.current = setTimeout(() => void searchGlyphs(selectedScriptTypes, false, q), 500);
                  }}
                  className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2.5 outline-none focus:border-red-700"
                  placeholder="作者"
                />
                <input
                  value={collectionTitle}
                  onChange={(e) => setCollectionTitle(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2.5 outline-none focus:border-red-700"
                  placeholder={q ? `作品標題（預設：${q}）` : "作品標題"}
                />
              </div>
            </form>
          </div>

          <div className={`rounded-2xl border border-stone-200 bg-white p-3 text-sm text-stone-600 space-y-2.5 ${isFilterOpen ? "block" : "hidden lg:block"}`}>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-full font-bold text-stone-700">查詢範圍</span>
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
                    className={`rounded-xl px-3 py-1.5 text-sm font-bold ${
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
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-full font-bold text-stone-700">排序</span>
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
                    className={`rounded-xl px-3 py-1.5 text-sm font-bold ${
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

          {scriptFilters.length > 0 && (
            <div className={`rounded-2xl border border-stone-200 bg-white p-2 ${isFilterOpen ? "block" : "hidden lg:block"}`}>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedScriptTypes([]);
                    void searchGlyphs([]);
                  }}
                  disabled={loading && selectedScriptTypes.length === 0}
                  aria-pressed={selectedScriptTypes.length === 0}
                  className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-sm font-bold transition ${
                    selectedScriptTypes.length === 0
                      ? "bg-red-800 text-white"
                      : "text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                  }`}
                >
                  全部
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
                      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-xl px-3 py-1.5 text-sm font-bold transition ${
                        active
                          ? "bg-red-800 text-white"
                          : "text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                      }`}
                    >
                      {active ? <Check className="h-3.5 w-3.5" /> : null}
                      {script}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          </> )}
        </aside>

        {/* CENTER: Mobile strip + Results */}
        <section className="mt-3 min-w-0 space-y-3 lg:mt-0">

          {/* 字組查詢結果 */}
          {searchTab === "sets" && (
            <div>
              {setsLoading && (
                <div className="flex items-center justify-center py-12 text-stone-400">
                  <RefreshCw className="mr-2 h-5 w-5 animate-spin" />查詢中...
                </div>
              )}
              {!setsLoading && setsResults.length === 0 && setsQuery.trim() && (
                <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
                  找不到符合「{setsQuery}」的字組
                </div>
              )}
              {!setsLoading && setsResults.length === 0 && !setsQuery.trim() && (
                <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
                  輸入關鍵字搜尋字組
                </div>
              )}
              {setsResults.length > 0 && (
                <div>
                  <div className="mb-3 text-sm text-stone-500">共找到 {setsResults.length} 個字組</div>
                  {/* 黃金比例格線：2 欄，卡片寬高比 ≈ 1.618:1 */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {setsResults.map((set) => {
                      const authors = [...new Set(set.members.map((m) => m.author).filter(Boolean))];
                      const scripts = [...new Set(set.members.map((m) => m.scriptType).filter(Boolean))];
                      const works   = [...new Set(set.members.map((m) => m.workTitle).filter(Boolean))];
                      const display = set.members.slice(0, 8);
                      const extra   = set.members.length - 8;
                      return (
                      <div key={set.id} className={`flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm ${
                        selectedSetSource?.id === set.id ? "border-red-700 shadow-[0_0_0_3px_rgba(185,28,28,0.12)]" : "border-stone-200"
                      }`}>
                        {/* 頂：名稱 + 原圖縮圖 */}
                        <div className="flex items-start gap-3 border-b border-stone-100 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate font-serif text-base font-bold text-stone-900">
                              {set.name || <span className="italic text-stone-400 text-sm">未命名字組</span>}
                            </h3>
                            <p className="text-[11px] text-stone-400">{set.members.length} 個字圖</p>
                          </div>
                          {set.sourceImageUrl && (
                            <button type="button" onClick={() => setLightboxSrc(set.sourceImageUrl)}
                              title="查看拆字原圖" className="shrink-0 overflow-hidden rounded-lg border border-stone-100 hover:border-red-300 transition-colors">
                              <img src={set.sourceImageUrl} alt="原圖" className="h-12 w-12 object-contain bg-stone-50 p-0.5" />
                            </button>
                          )}
                        </div>

                        {/* 中：字圖格（黃金比例內容區，max 8 個） */}
                        <button type="button" onClick={() => setSearchDataFromSet(set)} className="block flex-1 px-3 py-3 text-left">
                          {display.length > 0 ? (
                            <div className="grid grid-cols-4 gap-2">
                              {display.map((m) => (
                                <span key={m.id}
                                  className="group flex flex-col items-center rounded-lg border border-stone-100 bg-stone-50 p-1 transition-all hover:border-red-300 hover:bg-red-50">
                                  <div className="aspect-square w-full overflow-hidden rounded-md border border-stone-100 bg-white">
                                    <img src={m.thumbnailUrl ?? m.imageUrl} alt={m.char}
                                      className="h-full w-full object-contain mix-blend-multiply" loading="lazy" />
                                  </div>
                                  <div className="mt-1 font-serif text-base font-bold text-stone-800 group-hover:text-red-800">{m.char}</div>
                                  {m.scriptType && (
                                    <span className="mt-0.5 truncate text-[9px] text-stone-400">{m.scriptType}</span>
                                  )}
                                </span>
                              ))}
                              {extra > 0 && (
                                <div className="flex items-center justify-center rounded-lg border border-dashed border-stone-200 bg-stone-50 text-sm font-bold text-stone-400">
                                  +{extra}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-stone-400">尚無字圖</div>
                          )}
                        </button>

                        {/* 底：彙總資訊 */}
                        {(authors.length > 0 || scripts.length > 0) && (
                          <div className="border-t border-stone-100 bg-stone-50 px-3 py-2 text-[11px] text-stone-500">
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                              {authors.length > 0 && <span><span className="font-bold text-stone-600">作者</span> {authors.slice(0, 2).join("、")}{authors.length > 2 ? "…" : ""}</span>}
                              {scripts.length > 0 && <span><span className="font-bold text-stone-600">書體</span> {scripts.join("、")}</span>}
                              {works.length > 0   && <span className="hidden sm:inline"><span className="font-bold text-stone-600">作品</span> {works[0]}{works.length > 1 ? "…" : ""}</span>}
                            </div>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2 border-t border-stone-100 px-3 py-2">
                          <button
                            type="button"
                            onClick={() => setSearchDataFromSet(set)}
                            className="min-h-9 rounded-xl border border-stone-300 bg-white px-3 text-xs font-bold text-stone-700 hover:border-red-700 hover:text-red-800"
                          >
                            查看字圖
                          </button>
                          <button
                            type="button"
                            onClick={() => addSetToCollection(set)}
                            disabled={set.members.length === 0}
                            className="min-h-9 rounded-xl bg-red-800 px-3 text-xs font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            加入集字
                          </button>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mobile character strip */}
          {queryChars.length > 0 && (
            <div className="lg:hidden rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="flex flex-1 gap-1.5 overflow-x-auto pb-1">
                  {queryChars.map((char, index) => {
                    const glyph = selected.find((item) => item.position === index);
                    const active = activePosition === index;
                    return (
                      <div key={`${char}-strip-${index}`} className="relative shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleActivePosition(index)}
                          className={`block rounded-xl border p-0.5 transition ${
                            active ? "border-red-700 bg-red-700/10" : "border-transparent hover:border-stone-300"
                          }`}
                        >
                          {glyph ? (
                            <GlyphImage glyph={glyph} size={64} containerClassName="h-16 w-16" />
                          ) : (
                            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-zinc-200 bg-stone-50 font-serif text-2xl text-zinc-600">
                              {char}
                            </div>
                          )}
                        </button>
                        {glyph && (
                          <button
                            type="button"
                            onClick={() => removeSelected(index)}
                            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  {editingCollectionId ? (
                    <>
                      <button
                        type="button"
                        onClick={updateLoadedCollection}
                        disabled={isSavingCollection}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-800 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSavingCollection ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        更新
                      </button>
                      <button
                        type="button"
                        onClick={saveCollection}
                        disabled={isSavingCollection}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700 hover:border-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        另存
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={saveCollection}
                      disabled={isSavingCollection}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-stone-800 px-3 py-2 text-xs font-bold text-white hover:bg-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSavingCollection ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      {isSavingCollection ? "儲存中" : "儲存集字"}
                    </button>
                  )}
                </div>
              </div>
              {message && (
                saveResult ? (
                  <div
                    className={`mt-3 rounded-2xl border p-3 ${
                      saveResult.type === "duplicate"
                        ? "border-amber-300 bg-amber-50 text-amber-950"
                        : "border-emerald-300 bg-emerald-50 text-emerald-950"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`rounded-full p-1.5 ${
                            saveResult.type === "duplicate" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {saveResult.type === "duplicate" ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                        </div>
                        <div className="text-sm font-bold">{saveResult.title}</div>
                      </div>
                      {saveResult.type === "duplicate" && duplicateConflict ? (
                        <div className="flex shrink-0 gap-1.5">
                          <button
                            type="button"
                            onClick={overwriteDuplicateCollection}
                            disabled={isSavingCollection}
                            className="inline-flex items-center rounded-xl bg-amber-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-800 disabled:opacity-50"
                          >
                            {isSavingCollection ? "更新中" : "更新集字作品"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelDuplicateCollection}
                            disabled={isSavingCollection}
                            className="inline-flex items-center rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                          >
                            取消集字
                          </button>
                        </div>
                      ) : (
                        <Link
                          href={saveResult.url}
                          className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
                        >
                          查看
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 rounded-xl border border-stone-200 bg-stone-50 p-2 text-xs text-stone-600">
                    {message}
                  </div>
                )
              )}
            </div>
          )}

          {/* Search results */}
          <div className="relative min-h-[320px] rounded-2xl border border-stone-200 bg-white p-3 sm:min-h-[400px]">
            {loading && (
              <div className="absolute left-0 right-0 top-0 h-1 overflow-hidden rounded-t-2xl">
                <div className="h-full w-full origin-left animate-[progress_1s_ease-in-out_infinite] bg-red-700/80" />
              </div>
            )}
            <style dangerouslySetInnerHTML={{ __html: `
              @keyframes progress {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
              }
            `}} />
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-stone-600">
              <Filter className="h-5 w-5" />
              <span>搜尋結果</span>
              {selectedSetSource && (
                <span className="rounded-lg border border-red-100 bg-red-50 px-2 py-1 text-xs font-bold text-red-800">
                  來源字組：{selectedSetSource.name || `#${selectedSetSource.id}`}
                </span>
              )}
              {selectedSetSource?.sourceImageUrl && (
                <button
                  type="button"
                  onClick={() => setLightboxSrc(selectedSetSource.sourceImageUrl)}
                  className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-bold text-stone-600 hover:border-red-700 hover:text-red-800"
                >
                  預覽原圖
                </button>
              )}
              {data && (
                <>
                  <span className="text-sm text-stone-500">共 {data.total} 筆</span>
                  {!isSetResultMode && (
                    <>
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
                </>
              )}
            </div>

            {!data && (
              <div className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-stone-500 sm:p-10">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-stone-100">
                  <Search className="h-8 w-8 text-stone-400" />
                </div>
                <h3 className="mb-2 text-lg font-bold text-stone-700">開始探索書法之美</h3>
                <p className="text-sm sm:text-base">在左側輸入文字，系統會依每個字顯示可用的書法字圖。</p>
                {topChars.length > 0 && (
                  <div className="mt-6">
                    <p className="mb-2 text-xs text-stone-400">試試這些詞句</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {topChars.slice(0, 8).map((phrase) => (
                        <button
                          key={phrase}
                          type="button"
                          onClick={() => {
                            setQ(phrase);
                            void searchGlyphs(selectedScriptTypes, false, phrase);
                          }}
                          className="rounded-xl border border-stone-300 bg-white px-4 py-2 font-serif text-sm font-bold text-stone-700 hover:border-red-700 hover:text-red-800"
                        >
                          {phrase}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {data && isSetResultMode && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4">
                {selectedSetResultGlyphs.map((glyph, index) => {
                  const selectedAtPosition = selected.some((item) => item.position === index && item.id === glyph.id);
                  const selectedElsewhere = !selectedAtPosition && selected.some((item) => item.id === glyph.id);
                  return (
                    <div
                      key={`${glyph.id}-${index}`}
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
                        <div className="mt-2 flex items-baseline gap-2">
                          <span className="font-serif text-lg font-bold text-stone-900">{glyph.char}</span>
                          <span className="text-sm font-medium text-stone-700">{glyph.author || "佚名"}</span>
                        </div>
                        <div className="truncate text-xs text-stone-500">{glyph.scriptType || "未標註"}｜{glyph.workTitle || "未標題"}</div>
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
            )}

            {data && !isSetResultMode && visibleChars.map(({ char, index }) => {
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
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4">
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
          </div>
        </section>

        {/* RIGHT: Collection workspace */}
        <aside className="hidden lg:block lg:sticky lg:top-[81px]">
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <BookOpen className="h-5 w-5 shrink-0 text-red-600" />
                <div className="min-w-0">
                  <h2 className="font-bold font-serif">目前集字</h2>
                  <p className="truncate text-xs text-stone-500">
                    {editingCollectionId
                      ? `編輯：${collectionTitle.trim() || q || "未命名"}`
                      : "點選單字聚焦搜尋結果"}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {activePosition !== null && (
                  <button
                    type="button"
                    onClick={() => setActivePosition(null)}
                    className="rounded-xl border border-stone-300 px-2 py-1.5 text-xs font-bold text-stone-600 hover:border-red-700 hover:text-stone-900"
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
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-800 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSavingCollection ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      更新作品
                    </button>
                    <button
                      type="button"
                      onClick={saveCollection}
                      disabled={isSavingCollection}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-700 hover:border-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      另存新作品
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={saveCollection}
                    disabled={isSavingCollection}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-stone-800 px-3 py-2 text-xs font-bold text-white hover:bg-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSavingCollection ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    儲存集字作品
                  </button>
                )}
              </div>
            </div>

            {queryChars.length === 0 ? (
              <p className="text-sm text-stone-500">請輸入文字。</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {queryChars.map((char, index) => {
                  const glyph = selected.find((item) => item.position === index);
                  const active = activePosition === index;
                  return (
                    <div key={`${char}-ws-${index}`} className="group relative">
                      <button
                        type="button"
                        onClick={() => toggleActivePosition(index)}
                        aria-pressed={active}
                        className={`block w-full rounded-xl border p-1 transition ${
                          active
                            ? "border-red-700 bg-red-700/10"
                            : "border-transparent hover:border-stone-400"
                        }`}
                      >
                        {glyph ? (
                          <GlyphImage glyph={glyph} size={96} containerClassName="h-[80px] w-full" />
                        ) : (
                          <div className="flex h-[80px] w-full items-center justify-center rounded-xl border border-zinc-200 bg-white font-serif text-4xl text-zinc-600">
                            {char}
                          </div>
                        )}
                      </button>
                      {glyph && (
                        <button
                          type="button"
                          onClick={() => removeSelected(index)}
                          className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white group-hover:flex"
                        >
                          <X className="h-3 w-3" />
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

            {selectedSetSource && (
              <div className="mt-3 rounded-2xl border border-red-100 bg-white p-3 text-sm">
                <div className="text-xs font-bold text-stone-400">集字來源</div>
                <div className="mt-1 truncate font-serif font-bold text-stone-900">
                  {selectedSetSource.name || `字組 #${selectedSetSource.id}`}
                </div>
                {selectedSetSource.sourceImageUrl && (
                  <button
                    type="button"
                    onClick={() => setLightboxSrc(selectedSetSource.sourceImageUrl)}
                    className="mt-2 inline-flex w-full items-center justify-center rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700 hover:border-red-700 hover:text-red-800"
                  >
                    預覽來源原圖
                  </button>
                )}
              </div>
            )}

            {message && (
              saveResult ? (
                <div
                  className={`mt-3 rounded-2xl border p-3 ${
                    saveResult.type === "duplicate"
                      ? "border-amber-300 bg-amber-50 text-amber-950"
                      : "border-emerald-300 bg-emerald-50 text-emerald-950"
                  }`}
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start gap-2">
                      <div
                        className={`mt-0.5 rounded-full p-1.5 ${
                          saveResult.type === "duplicate"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {saveResult.type === "duplicate" ? (
                          <AlertTriangle className="h-4 w-4" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-bold">{saveResult.title}</div>
                        <p className="mt-0.5 text-xs opacity-80">{saveResult.description}</p>
                      </div>
                    </div>
                    {saveResult.type === "duplicate" && duplicateConflict ? (
                      <div className="grid gap-2">
                        <button
                          type="button"
                          onClick={overwriteDuplicateCollection}
                          disabled={isSavingCollection}
                          className="inline-flex w-full items-center justify-center rounded-xl bg-amber-700 px-3 py-2 text-sm font-bold text-white hover:bg-amber-800 disabled:opacity-50"
                        >
                          {isSavingCollection ? "更新中..." : "更新集字作品"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelDuplicateCollection}
                          disabled={isSavingCollection}
                          className="inline-flex w-full items-center justify-center rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                        >
                          取消集字
                        </button>
                      </div>
                    ) : (
                      <Link
                        href={saveResult.url}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-800"
                      >
                        查看作品
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-3 text-sm text-stone-600">
                  {message}
                </div>
              )
            )}
          </div>
        </aside>
      </div>
      {lightboxSrc && <ImageLightbox src={lightboxSrc} alt="拆字原圖" onClose={() => setLightboxSrc(null)} />}
    </main>
  );
}
