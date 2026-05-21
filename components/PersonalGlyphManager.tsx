"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, RefreshCw, Trash2 } from "lucide-react";
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
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "public" | "private">("all");
  const [busyId, setBusyId] = useState<number | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const scriptTypeOptions = useMemo(
    () =>
      Array.from(new Set(glyphs.map((glyph) => getScriptLabel(glyph.scriptType)))).sort((a, b) =>
        a.localeCompare(b, "zh-Hant")
      ),
    [glyphs]
  );
  
  const filteredGlyphs = glyphs.filter((glyph) => {
    const charMatch = !queryChar.trim() || glyph.char.includes(queryChar.trim());
    const authorMatch = !queryAuthor.trim() || (glyph.author && glyph.author.includes(queryAuthor.trim()));
    const scriptMatch = selectedScriptTypes.length === 0 || selectedScriptTypes.includes(getScriptLabel(glyph.scriptType));
    const workMatch = !queryWorkTitle.trim() || (glyph.workTitle && glyph.workTitle.includes(queryWorkTitle.trim()));
    const matchesVisibility = visibilityFilter === "all" || glyph.visibility === visibilityFilter;
    
    return charMatch && authorMatch && scriptMatch && workMatch && matchesVisibility;
  });

  function toggleScriptType(scriptType: string) {
    setSelectedScriptTypes((current) =>
      current.includes(scriptType)
        ? current.filter((item) => item !== scriptType)
        : [...current, scriptType]
    );
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
      const json = (await res.json()) as { glyphs?: PersonalGlyph[]; hasMore?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "讀取更多字圖失敗");
      setGlyphs((items) => [...items, ...(json.glyphs ?? [])]);
      setHasMore(Boolean(json.hasMore));
    } catch (error) {
      alert(error instanceof Error ? error.message : "讀取更多字圖失敗");
    } finally {
      setIsLoadingMore(false);
    }
  }

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMore) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadMoreGlyphs();
      }
    }, { rootMargin: "360px" });

    observer.observe(node);
    return () => observer.disconnect();
  }, [glyphs.length, hasMore, isLoadingMore]);

  async function updateVisibility(id: number, visibility: "public" | "private") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/me/glyphs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "更新失敗");
      setGlyphs((items) => items.map((item) => (item.id === id ? { ...item, visibility: json.visibility } : item)));
    } catch (error) {
      alert(error instanceof Error ? error.message : "更新失敗");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteGlyph(id: number) {
    if (!window.confirm("確定要刪除這個個人字圖嗎？")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/me/glyphs/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "刪除失敗");
      setGlyphs((items) => items.filter((item) => item.id !== id));
    } catch (error) {
      alert(error instanceof Error ? error.message : "刪除失敗");
      setBusyId(null);
    }
  }

  if (glyphs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
        尚未上傳個人字圖。
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
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-700"
          />
          <input
            value={queryAuthor}
            onChange={(event) => setQueryAuthor(event.target.value)}
            placeholder="作者"
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-700"
          />
          <input
            value={queryWorkTitle}
            onChange={(event) => setQueryWorkTitle(event.target.value)}
            placeholder="作品"
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-700"
          />
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-stone-100 p-1">
          {[
            ["all", "全部"],
            ["public", "公開"],
            ["private", "私人"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setVisibilityFilter(value as "all" | "public" | "private")}
              className={`rounded-lg px-3 py-2 text-sm font-bold ${
                visibilityFilter === value ? "bg-white text-red-800 shadow-sm" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-stone-200 bg-stone-50 p-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedScriptTypes([])}
            className={`inline-flex min-h-9 items-center justify-center rounded-xl px-3 py-2 text-sm font-bold transition ${
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
                className={`inline-flex min-h-9 items-center justify-center gap-1 rounded-xl px-3 py-2 text-sm font-bold transition ${
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
        </div>
      </div>

      {filteredGlyphs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
          查無符合條件的個人字圖。
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {filteredGlyphs.map((glyph) => (
        <div key={glyph.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
          <GlyphImage glyph={glyph} size={112} containerClassName="h-[112px] w-full" />
          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-serif text-lg font-bold">{glyph.char}</div>
              <div className="truncate text-sm text-stone-600">{glyph.author || "佚名"}｜{glyph.scriptType || "未標註"}</div>
              <div className="truncate text-xs text-stone-500">{glyph.workTitle || "未標題"}</div>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${
              glyph.visibility === "public" ? "bg-emerald-50 text-emerald-700" : "bg-stone-200 text-stone-700"
            }`}>
              {glyph.visibility === "public" ? "公開" : "私人"}
            </span>
          </div>
          <div className="mt-2 text-xs text-stone-500">
            讚 {glyph.likeCount}｜集字 {glyph.collectionCount}｜{glyph.createdAt}
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <div className="grid grid-cols-2 gap-2">
              <Link
                href={`/upload/edit/${glyph.id}`}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-red-800"
              >
                編輯
              </Link>
              <button
                type="button"
                onClick={() => updateVisibility(glyph.id, glyph.visibility === "public" ? "private" : "public")}
                disabled={busyId === glyph.id}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busyId === glyph.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                {glyph.visibility === "public" ? "私人" : "公開"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => void deleteGlyph(glyph.id)}
              disabled={busyId === glyph.id}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 bg-white text-red-700 hover:border-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="刪除個人字圖"
              title="刪除"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
          <div ref={loadMoreRef} className="col-span-full min-h-1" />
        </div>
      )}
      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void loadMoreGlyphs()}
            disabled={isLoadingMore}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoadingMore ? "載入中..." : "載入更多"}
          </button>
        </div>
      )}
    </div>
  );
}
