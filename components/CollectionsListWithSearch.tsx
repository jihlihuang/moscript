"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, ImageIcon, Search, X } from "lucide-react";
import { CollectionPreviewGlyphs } from "@/components/CollectionPreviewGlyphs";
import { DeleteCollectionButton } from "@/components/DeleteCollectionButton";
import { ImageLightbox } from "@/components/ImageLightbox";

type CollectionSummary = {
  id: number;
  title: string;
  text: string;
  display_direction: "horizontal" | "vertical" | null;
  source_set_id: number | null;
  source_set_name: string | null;
  source_image_url: string | null;
  created_at: string;
  item_count: number;
};

type CollectionItemPreview = {
  collection_id: number;
  position: number;
  char: string;
  glyph_id: number;
  author: string | null;
  script_type: string | null;
  work_title: string | null;
  image_url: string;
  thumbnail_url: string | null;
  like_count: number;
  collection_count: number;
  liked_by_me: number;
};

export function CollectionsListWithSearch({
  collections,
  itemsByCollection,
}: {
  collections: CollectionSummary[];
  itemsByCollection: Record<number, CollectionItemPreview[]>;
}) {
  const [query, setQuery] = useState("");
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

  const filtered = query.trim()
    ? collections.filter((c) => {
        const q = query.trim().toLowerCase();
        return (
          c.title.toLowerCase().includes(q) ||
          c.text.toLowerCase().includes(q)
        );
      })
    : collections;

  return (
    <div>
      {/* Search bar */}
      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋作品名稱或文字內容…"
          className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-10 pr-10 text-sm text-stone-800 placeholder-stone-400 focus:border-red-700 focus:outline-none focus:ring-1 focus:ring-red-700"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
            aria-label="清除搜尋"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 sm:rounded-3xl sm:p-10">
          {query ? `找不到符合「${query}」的集字作品。` : "目前還沒有儲存的集字作品。"}
        </div>
      ) : (
        <>
          {query && (
            <p className="mb-3 text-xs text-stone-400">
              找到 {filtered.length} 卷符合結果
            </p>
          )}
          <div className="grid items-stretch gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((collection) => {
              const items = itemsByCollection[collection.id] ?? [];
              const sourceImageUrl = collection.source_set_id && collection.source_image_url
                ? `/api/glyph-sets/${collection.source_set_id}/source`
                : null;
              return (
                <div
                  key={collection.id}
                  className="group relative flex h-[460px] flex-col rounded-2xl border border-stone-200 bg-white p-3 transition hover:border-red-700 hover:bg-stone-50 sm:h-[500px] sm:p-4"
                >
                  <div className="relative z-0 mb-3 flex min-h-[54px] items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="line-clamp-1 font-serif text-base font-bold sm:text-lg">
                        {collection.title || "未命名集字作品"}
                      </h2>
                      <p className="mt-1 text-xs text-stone-500 sm:text-sm">
                        {collection.created_at}
                      </p>
                    </div>
                    <Link
                      href={`/collections/${collection.id}`}
                      className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-700 hover:bg-red-50 hover:text-red-800 focus:outline-none focus:ring-2 focus:ring-red-800"
                      aria-label={`查看 ${collection.title || "未命名集字作品"}`}
                      title="查看作品"
                    >
                      <BookOpen className="h-5 w-5" />
                    </Link>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto pr-1 pb-3">
                    <CollectionPreviewGlyphs
                      collectionId={collection.id}
                      initialDirection={
                        collection.display_direction === "vertical"
                          ? "vertical"
                          : "horizontal"
                      }
                      items={items}
                      text={collection.text}
                      isAuthenticated={true}
                      likeReturnTo="/collections"
                    />
                  </div>
                  <div className="relative z-20 mt-3 flex min-h-[76px] shrink-0 flex-col justify-center gap-2 border-t border-stone-100 bg-white pt-3 text-sm text-stone-500 sm:min-h-[68px] sm:flex-row sm:items-center sm:justify-between">
                    <span className="line-clamp-1 min-w-0">
                      {collection.text}｜{collection.item_count} 個字圖
                    </span>
                    <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                      {sourceImageUrl && (
                        <button
                          type="button"
                          onClick={() => setLightbox({
                            src: sourceImageUrl,
                            alt: `${collection.source_set_name || collection.title || collection.text} 原圖`,
                          })}
                          className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-stone-300 px-3 py-1 font-bold text-stone-600 hover:border-red-700 hover:text-red-800 sm:px-2"
                          title="預覽原圖"
                        >
                          <ImageIcon className="h-3 w-3" />
                          原圖
                        </button>
                      )}
                      <Link
                        href={`/?collectionId=${collection.id}`}
                        className="inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg border border-stone-300 px-3 py-1 font-bold text-stone-600 hover:border-red-700 hover:text-stone-900 sm:flex-none sm:px-2"
                      >
                        <Search className="h-3 w-3" />
                        載入
                      </Link>
                      <DeleteCollectionButton id={collection.id} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {lightbox && <ImageLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />}
        </>
      )}
    </div>
  );
}
