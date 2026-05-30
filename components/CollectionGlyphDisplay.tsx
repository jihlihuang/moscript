"use client";

import Link from "next/link";
import { Columns3, Rows3 } from "lucide-react";
import { GlyphImage } from "@/components/GlyphImage";
import { GlyphLikeButton } from "@/components/GlyphLikeButton";
import { useCollectionDirectionPreference } from "@/components/useCollectionDirectionPreference";

type CollectionGlyphItem = {
  position: number;
  char: string;
  glyph_id: number;
  author: string | null;
  script_type: string | null;
  work_title: string | null;
  image_url: string;
  thumbnail_url?: string | null;
  like_count?: number;
  collection_count?: number;
  liked_by_me?: number;
};

export function CollectionGlyphDisplay({
  collectionId,
  initialDirection,
  items,
  isAuthenticated = true,
  likeReturnTo = "/collections",
}: {
  collectionId: number;
  initialDirection: "horizontal" | "vertical";
  items: CollectionGlyphItem[];
  isAuthenticated?: boolean;
  likeReturnTo?: string;
}) {
  const [direction, setDirection] = useCollectionDirectionPreference(collectionId, initialDirection);
  const glyphSizeClass = "h-[clamp(132px,34vw,220px)] w-[clamp(132px,34vw,220px)] sm:h-[clamp(180px,20vw,240px)] sm:w-[clamp(180px,20vw,240px)]";
  const itemHref = (item: CollectionGlyphItem) => `/practice/${item.glyph_id}?collectionId=${collectionId}&position=${item.position}`;

  return (
    <div>
      <div className="mb-3 flex justify-end sm:mb-4">
        <div className="inline-flex rounded-2xl border border-stone-200 bg-stone-50 p-1">
          <button
            type="button"
            onClick={() => setDirection("horizontal")}
            aria-pressed={direction === "horizontal"}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${
              direction === "horizontal"
                ? "bg-red-800 text-white"
                : "text-stone-500 hover:bg-stone-200 hover:text-stone-800"
            }`}
          >
            <Rows3 className="h-4 w-4" />
            橫排
          </button>
          <button
            type="button"
            onClick={() => setDirection("vertical")}
            aria-pressed={direction === "vertical"}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${
              direction === "vertical"
                ? "bg-red-800 text-white"
                : "text-stone-500 hover:bg-stone-200 hover:text-stone-800"
            }`}
          >
            <Columns3 className="h-4 w-4" />
            直排
          </button>
        </div>
      </div>

      {direction === "horizontal" ? (
        <div className="rounded-3xl bg-stone-50 p-3 sm:p-6">
          <div className="overflow-x-auto overscroll-x-contain">
            <div className="flex w-max min-w-full snap-x snap-mandatory items-center justify-center gap-3 px-1 py-2 sm:gap-4">
              {items.map((item) => (
                <div key={`${item.position}-${item.glyph_id}`} className="shrink-0 snap-center space-y-2">
                  <Link
                    href={itemHref(item)}
                    className="block rounded-xl transition hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-red-800"
                    title={`練習 ${item.char}`}
                  >
                  <GlyphImage
                    size={240}
                    containerClassName={glyphSizeClass}
                    glyph={{
                      id: item.glyph_id,
                      char: item.char,
                      imageUrl: item.image_url,
                      thumbnailUrl: item.thumbnail_url,
                      author: item.author,
                      scriptType: item.script_type,
                      workTitle: item.work_title,
                    }}
                  />
                  </Link>
                  <GlyphLikeButton
                    glyphId={item.glyph_id}
                    initialLiked={Boolean(item.liked_by_me)}
                    initialLikeCount={Number(item.like_count ?? 0)}
                    initialCollectionCount={Number(item.collection_count ?? 0)}
                    isAuthenticated={isAuthenticated}
                    returnTo={likeReturnTo}
                    className="w-full bg-white"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl bg-stone-50 p-3 sm:p-6">
          <div className="overflow-x-auto overscroll-x-contain">
            <div className="flex w-max justify-center gap-4 rounded-[1.5rem] bg-white px-4 py-4 shadow-inner sm:px-8 sm:py-8">
              <div className="flex max-h-[min(76vh,720px)] flex-col flex-wrap content-start items-center gap-3 sm:gap-4 [transform:scaleX(-1)]">
                {items.map((item) => (
                  <div key={`${item.position}-${item.glyph_id}`} className="shrink-0 space-y-2 [transform:scaleX(-1)]">
                    <Link
                      href={itemHref(item)}
                      className="block rounded-xl transition hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-red-800"
                      title={`練習 ${item.char}`}
                    >
                    <GlyphImage
                      size={240}
                      containerClassName={glyphSizeClass}
                      glyph={{
                        id: item.glyph_id,
                        char: item.char,
                        imageUrl: item.image_url,
                        thumbnailUrl: item.thumbnail_url,
                        author: item.author,
                        scriptType: item.script_type,
                        workTitle: item.work_title,
                      }}
                    />
                    </Link>
                    <GlyphLikeButton
                      glyphId={item.glyph_id}
                      initialLiked={Boolean(item.liked_by_me)}
                      initialLikeCount={Number(item.like_count ?? 0)}
                      initialCollectionCount={Number(item.collection_count ?? 0)}
                      isAuthenticated={isAuthenticated}
                      returnTo={likeReturnTo}
                      className="w-full bg-white"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
