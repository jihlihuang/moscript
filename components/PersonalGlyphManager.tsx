"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { GlyphImage } from "@/components/GlyphImage";

export type PersonalGlyph = {
  id: number;
  char: string;
  author: string | null;
  scriptType: string | null;
  workTitle: string | null;
  imageUrl: string;
  thumbnailUrl: string | null;
  visibility: "public" | "private";
  likeCount: number;
  collectionCount: number;
  createdAt: string;
};

const unknownScriptLabel = "未標註";

function getScriptLabel(scriptType: string | null) {
  return scriptType?.trim() || unknownScriptLabel;
}

export function PersonalGlyphManager({
  initialGlyphs,
  initialHasMore = false,
}: {
  initialGlyphs: PersonalGlyph[];
  initialHasMore?: boolean;
}) {
  const [glyphs, setGlyphs] = useState(initialGlyphs);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [queryChar, setQueryChar] = useState("");
  const [queryAuthor, setQueryAuthor] = useState("");
  const [selectedScriptTypes, setSelectedScriptTypes] = useState<string[]>([]);
  const [queryWorkTitle, setQueryWorkTitle] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<
    "all" | "public" | "private"
  >("all");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [isBatchDeleteConfirming, setIsBatchDeleteConfirming] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isBatchBusy, setIsBatchBusy] = useState(false);
  const [batchAuthor, setBatchAuthor] = useState("");
  const [batchScriptType, setBatchScriptType] = useState("");
  const [batchWorkTitle, setBatchWorkTitle] = useState("");
  const [density, setDensity] = useState<"comfortable" | "compact">(
    "comfortable",
  );
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const scriptTypeOptions = useMemo(
    () =>
      Array.from(
        new Set(glyphs.map((glyph) => getScriptLabel(glyph.scriptType))),
      ).sort((a, b) => a.localeCompare(b, "zh-Hant")),
    [glyphs],
  );

  const filteredGlyphs = glyphs.filter((glyph) => {
    const charMatch =
      !queryChar.trim() || glyph.char.includes(queryChar.trim());
    const authorMatch =
      !queryAuthor.trim() ||
      (glyph.author && glyph.author.includes(queryAuthor.trim()));
    const scriptMatch =
      selectedScriptTypes.length === 0 ||
      selectedScriptTypes.includes(getScriptLabel(glyph.scriptType));
    const workMatch =
      !queryWorkTitle.trim() ||
      (glyph.workTitle && glyph.workTitle.includes(queryWorkTitle.trim()));
    const matchesVisibility =
      visibilityFilter === "all" || glyph.visibility === visibilityFilter;

    return (
      charMatch && authorMatch && scriptMatch && workMatch && matchesVisibility
    );
  });

  function toggleScriptType(scriptType: string) {
    setSelectedScriptTypes((current) =>
      current.includes(scriptType)
        ? current.filter((item) => item !== scriptType)
        : [...current, scriptType],
    );
  }

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCount = selectedIds.length;
  const allFilteredSelected =
    filteredGlyphs.length > 0 &&
    filteredGlyphs.every((glyph) => selectedSet.has(glyph.id));

  function toggleGlyphSelection(id: number) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleFilteredSelection() {
    const filteredIds = filteredGlyphs.map((glyph) => glyph.id);
    setSelectedIds((current) => {
      if (filteredIds.every((id) => current.includes(id))) {
        return current.filter((id) => !filteredIds.includes(id));
      }
      return [...new Set([...current, ...filteredIds])];
    });
  }

  async function batchRequest(body: Record<string, unknown>) {
    if (selectedIds.length === 0 || isBatchBusy) return null;
    setIsBatchBusy(true);
    try {
      const res = await fetch("/api/me/glyphs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, ...body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "批次操作失敗");
      return json as {
        ids: number[];
        visibility?: "public" | "private";
        author?: string | null;
        scriptType?: string | null;
        workTitle?: string | null;
      };
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批次操作失敗");
      return null;
    } finally {
      setIsBatchBusy(false);
    }
  }

  async function batchUpdateVisibility(visibility: "public" | "private") {
    const json = await batchRequest({ action: "visibility", visibility });
    if (!json) return;
    setGlyphs((items) =>
      items.map((item) =>
        json.ids.includes(item.id) ? { ...item, visibility } : item,
      ),
    );
    setSelectedIds([]);
    toast.success(`已將 ${json.ids.length} 個字圖設為${visibility === "public" ? "公開" : "私人"}`);
  }

  async function batchDeleteGlyphs() {
    if (!isBatchDeleteConfirming) {
      setIsBatchDeleteConfirming(true);
      return;
    }
    setIsBatchDeleteConfirming(false);
    const json = await batchRequest({ action: "delete" });
    if (!json) return;
    setGlyphs((items) => items.filter((item) => !json.ids.includes(item.id)));
    setSelectedIds([]);
    toast.success(`已刪除 ${json.ids.length} 個字圖`);
  }

  async function batchUpdateMetadata() {
    const body: Record<string, unknown> = { action: "metadata" };
    if (batchAuthor.trim()) body.author = batchAuthor;
    if (batchScriptType.trim())
      body.scriptType =
        batchScriptType === unknownScriptLabel ? "" : batchScriptType;
    if (batchWorkTitle.trim()) body.workTitle = batchWorkTitle;
    if (Object.keys(body).length === 1) {
      toast.error("請至少填寫作者、書體或作品名其中一項");
      return;
    }
    const json = await batchRequest(body);
    if (!json) return;
    setGlyphs((items) =>
      items.map((item) =>
        json.ids.includes(item.id)
          ? {
              ...item,
              author: json.author !== undefined ? json.author : item.author,
              scriptType:
                json.scriptType !== undefined
                  ? json.scriptType
                  : item.scriptType,
              workTitle:
                json.workTitle !== undefined ? json.workTitle : item.workTitle,
            }
          : item,
      ),
    );
    setSelectedIds([]);
    setBatchAuthor("");
    setBatchScriptType("");
    setBatchWorkTitle("");
    toast.success(`已更新 ${json.ids.length} 個字圖的資料`);
  }

  async function loadMoreGlyphs() {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const params = new URLSearchParams({
        offset: String(glyphs.length),
        limit: "24",
      });
      const res = await fetch(`/api/me/glyphs?${params.toString()}`);
      const json = (await res.json()) as {
        glyphs?: PersonalGlyph[];
        hasMore?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "讀取更多字圖失敗");
      setGlyphs((items) => [...items, ...(json.glyphs ?? [])]);
      setHasMore(Boolean(json.hasMore));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "讀取更多字圖失敗");
    } finally {
      setIsLoadingMore(false);
    }
  }

  useEffect(() => {
    if (confirmDeleteId === null) return;
    const timer = setTimeout(() => setConfirmDeleteId(null), 3000);
    return () => clearTimeout(timer);
  }, [confirmDeleteId]);

  useEffect(() => {
    if (!isBatchDeleteConfirming) return;
    const timer = setTimeout(() => setIsBatchDeleteConfirming(false), 3000);
    return () => clearTimeout(timer);
  }, [isBatchDeleteConfirming]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMoreGlyphs();
        }
      },
      { rootMargin: "360px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [glyphs.length, hasMore, isLoadingMore]);

  async function updateVisibility(
    id: number,
    visibility: "public" | "private",
  ) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/me/glyphs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "更新失敗");
      setGlyphs((items) =>
        items.map((item) =>
          item.id === id ? { ...item, visibility: json.visibility } : item,
        ),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新失敗");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteGlyph(id: number) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setConfirmDeleteId(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/me/glyphs/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "刪除失敗");
      setGlyphs((items) => items.filter((item) => item.id !== id));
      toast.success("已刪除字圖");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "刪除失敗");
      setBusyId(null);
    }
  }

  if (glyphs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 py-12 text-center text-sm text-stone-400">
        <p>尚未上傳個人字圖。</p>
        <Link
          href="/upload"
          className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-stone-800 px-4 py-2 text-sm font-bold text-white hover:bg-stone-900"
        >
          上傳字圖
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <input
            value={queryChar}
            onChange={(event) => setQueryChar(event.target.value)}
            placeholder="單字"
            className="w-full rounded-sm border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-700"
          />
          <input
            value={queryAuthor}
            onChange={(event) => setQueryAuthor(event.target.value)}
            placeholder="作者"
            className="w-full rounded-sm border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-700"
          />
          <input
            value={queryWorkTitle}
            onChange={(event) => setQueryWorkTitle(event.target.value)}
            placeholder="作品"
            className="w-full rounded-sm border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-700"
          />
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-sm bg-stone-100 p-1">
          {[
            ["all", "全部"],
            ["public", "公開"],
            ["private", "私人"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() =>
                setVisibilityFilter(value as "all" | "public" | "private")
              }
              className={`rounded-lg px-3 py-2 text-sm font-bold ${
                visibilityFilter === value
                  ? "bg-white text-red-800 shadow-sm"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-sm border border-stone-200 bg-[#fdfbf7] p-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedScriptTypes([])}
            className={`inline-flex min-h-9 items-center justify-center rounded-sm px-3 py-2 text-sm font-bold transition ${
              selectedScriptTypes.length === 0
                ? "bg-red-800 text-white"
                : "bg-white text-stone-600 hover:text-stone-900"
            }`}
          >
            全部書體
          </button>
          {scriptTypeOptions.map((scriptType) => {
            const isSelected = selectedScriptTypes.includes(scriptType);
            return (
              <button
                key={scriptType}
                type="button"
                onClick={() => toggleScriptType(scriptType)}
                className={`inline-flex min-h-9 items-center justify-center gap-1 rounded-sm px-3 py-2 text-sm font-bold transition ${
                  isSelected
                    ? "bg-red-800 text-white"
                    : "bg-white text-stone-600 hover:text-stone-900"
                }`}
                aria-pressed={isSelected}
              >
                {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
                {scriptType}
              </button>
            );
          })}
          <div className="ml-auto grid grid-cols-2 gap-1 rounded-sm bg-stone-200 p-1">
            {[
              ["comfortable", "舒適"],
              ["compact", "緊湊"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setDensity(value as "comfortable" | "compact")}
                className={`rounded-lg px-3 py-2 text-sm font-bold ${
                  density === value
                    ? "bg-white text-red-800 shadow-sm"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredGlyphs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 py-12 text-center text-sm text-stone-400">
          <p>查無符合條件的個人字圖。</p>
          <button
            type="button"
            onClick={() => {
              setQueryChar("");
              setQueryAuthor("");
              setQueryWorkTitle("");
              setSelectedScriptTypes([]);
              setVisibilityFilter("all");
            }}
            className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-stone-900"
          >
            清除篩選
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-sm border border-stone-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={toggleFilteredSelection}
                className="inline-flex min-h-10 items-center justify-center rounded-sm border border-stone-300 px-3 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-red-800"
              >
                {allFilteredSelected ? "取消本頁選取" : "選取目前結果"}
              </button>
              <div className="text-sm font-bold text-stone-600">
                已選 {selectedCount} 個
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void batchUpdateVisibility("public")}
                  disabled={selectedCount === 0 || isBatchBusy}
                  className="rounded-sm border border-stone-300 px-3 py-2 text-sm font-bold text-stone-700 hover:border-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  批次公開
                </button>
                <button
                  type="button"
                  onClick={() => void batchUpdateVisibility("private")}
                  disabled={selectedCount === 0 || isBatchBusy}
                  className="rounded-sm border border-stone-300 px-3 py-2 text-sm font-bold text-stone-700 hover:border-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  批次私人
                </button>
                <button
                  type="button"
                  onClick={() => void batchDeleteGlyphs()}
                  disabled={selectedCount === 0 || isBatchBusy}
                  className={`rounded-sm border px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 ${
                    isBatchDeleteConfirming
                      ? "border-red-600 bg-red-50 text-red-700 hover:bg-red-100"
                      : "border-red-200 text-red-700 hover:border-red-700"
                  }`}
                >
                  {isBatchDeleteConfirming ? "確認刪除？" : "批次刪除"}
                </button>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <input
                value={batchAuthor}
                onChange={(event) => setBatchAuthor(event.target.value)}
                placeholder="批次作者"
                className="rounded-sm border border-stone-300 bg-[#fdfbf7] px-3 py-2 text-sm outline-none focus:border-red-700"
              />
              <input
                value={batchScriptType}
                onChange={(event) => setBatchScriptType(event.target.value)}
                placeholder="批次書體"
                className="rounded-sm border border-stone-300 bg-[#fdfbf7] px-3 py-2 text-sm outline-none focus:border-red-700"
              />
              <input
                value={batchWorkTitle}
                onChange={(event) => setBatchWorkTitle(event.target.value)}
                placeholder="批次作品名"
                className="rounded-sm border border-stone-300 bg-[#fdfbf7] px-3 py-2 text-sm outline-none focus:border-red-700"
              />
              <button
                type="button"
                onClick={() => void batchUpdateMetadata()}
                disabled={selectedCount === 0 || isBatchBusy}
                className="rounded-sm bg-stone-800 px-4 py-2 text-sm font-bold text-white hover:bg-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                套用資料
              </button>
            </div>
          </div>
          <div
            className={`animate-in fade-in duration-300 ${density === "compact" ? "grid gap-2 sm:grid-cols-3 lg:grid-cols-4" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"}`}
          >
            {filteredGlyphs.map((glyph) => (
              <div
                key={glyph.id}
                className={`rounded-sm border bg-[#fdfbf7] ${density === "compact" ? "p-2" : "p-3"} ${selectedSet.has(glyph.id) ? "border-red-700" : "border-stone-200"}`}
              >
                <label className="mb-2 inline-flex items-center gap-2 text-sm font-bold text-stone-600">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(glyph.id)}
                    onChange={() => toggleGlyphSelection(glyph.id)}
                    className="h-4 w-4 accent-red-800"
                  />
                  選取
                </label>
                <GlyphImage
                  glyph={glyph}
                  size={density === "compact" ? 84 : 112}
                  containerClassName={
                    density === "compact"
                      ? "h-[84px] w-full"
                      : "h-[112px] w-full"
                  }
                />
                <div
                  className={`${density === "compact" ? "mt-2" : "mt-3"} flex items-start justify-between gap-3`}
                >
                  <div className="min-w-0">
                    <div
                      className={`font-serif font-bold ${density === "compact" ? "text-base" : "text-lg"}`}
                    >
                      {glyph.char}
                    </div>
                    <div className="truncate text-sm text-stone-600">
                      {glyph.author || "佚名"}｜{glyph.scriptType || "未標註"}
                    </div>
                    <div className="truncate text-xs text-stone-500">
                      {glyph.workTitle || "未標題"}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${
                      glyph.visibility === "public"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-stone-200 text-stone-700"
                    }`}
                  >
                    {glyph.visibility === "public" ? "公開" : "私人"}
                  </span>
                </div>
                <div className="mt-2 text-xs text-stone-500">
                  讚 {glyph.likeCount}｜集字 {glyph.collectionCount}｜
                  {glyph.createdAt}
                </div>
                <div
                  className={`${density === "compact" ? "mt-2" : "mt-3"} grid grid-cols-[1fr_auto] gap-2`}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      href={`/glyph/${glyph.id}`}
                      className="inline-flex min-h-10 items-center justify-center rounded-sm border border-stone-300 bg-white px-3 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-red-800"
                    >
                      詳情
                    </Link>
                    <Link
                      href={`/upload/edit/${glyph.id}`}
                      className="inline-flex min-h-10 items-center justify-center rounded-sm border border-stone-300 bg-white px-3 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-red-800"
                    >
                      編輯
                    </Link>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateVisibility(
                          glyph.id,
                          glyph.visibility === "public" ? "private" : "public",
                        )
                      }
                      disabled={busyId === glyph.id}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-sm border border-stone-300 bg-white px-3 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busyId === glyph.id ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : null}
                      {glyph.visibility === "public" ? "私人" : "公開"}
                    </button>
                  </div>
                  {confirmDeleteId === glyph.id ? (
                    <button
                      type="button"
                      onClick={() => void deleteGlyph(glyph.id)}
                      className="inline-flex min-h-10 items-center justify-center rounded-sm border border-red-600 bg-red-50 px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-100"
                      title="再按一次確認刪除"
                    >
                      確認？
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void deleteGlyph(glyph.id)}
                      disabled={busyId === glyph.id}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-red-200 bg-white text-red-700 hover:border-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="刪除個人字圖"
                      title="刪除"
                    >
                      {busyId === glyph.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div ref={loadMoreRef} className="col-span-full min-h-1" />
          </div>
        </>
      )}
      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void loadMoreGlyphs()}
            disabled={isLoadingMore}
            className="inline-flex min-h-10 items-center justify-center rounded-sm border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoadingMore ? "載入中..." : "載入更多"}
          </button>
        </div>
      )}
    </div>
  );
}
