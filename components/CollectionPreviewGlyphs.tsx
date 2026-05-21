"use client";

import Link from "next/link";
import { Columns3, Rows3 } from "lucide-react";
import { GlyphImage } from "@/components/GlyphImage";
import { useCollectionDirectionPreference } from "@/components/useCollectionDirectionPreference";

type PreviewGlyph = {
  position: number;
  char: string;
  glyph_id: number;
  author: string | null;
  script_type: string | null;
  work_title: string | null;
  image_url: string;
};

export function CollectionPreviewGlyphs({
  collectionId,
  initialDirection,
  items,
  text,
  detailHref,
}: {
  collectionId: number;
  initialDirection: "horizontal" | "vertical";
  items: PreviewGlyph[];
  text: string;
  detailHref?: string;
}) {
  const [direction, setDirection] = useCollectionDirectionPreference(collectionId, initialDirection);
  const horizontalItems = items.slice(0, 8);
  const verticalItems = items.slice(0, 6);

  return (
    <div className="relative z-20 mb-4">
      <div className="mb-2 flex justify-end">
        <div className="inline-flex rounded-xl border border-stone-200 bg-white p-0.5">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDirection("horizontal");
            }}
            aria-pressed={direction === "horizontal"}
            className={`rounded-lg p-1.5 transition ${
              direction === "horizontal"
                ? "bg-red-800 text-white"
                : "text-stone-500 hover:bg-stone-100 hover:text-stone-800"
            }`}
            title="橫排"
          >
            <Rows3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDirection("vertical");
            }}
            aria-pressed={direction === "vertical"}
            className={`rounded-lg p-1.5 transition ${
              direction === "vertical"
                ? "bg-red-800 text-white"
                : "text-stone-500 hover:bg-stone-100 hover:text-stone-800"
            }`}
            title="直排"
          >
            <Columns3 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {items.length > 0 ? (
        direction === "horizontal" ? (
          <div className="rounded-2xl bg-stone-50 p-2 sm:p-3">
            <div className="grid grid-cols-4 gap-2 min-[420px]:grid-cols-5 sm:grid-cols-4">
              {horizontalItems.map((item) => (
                <Link
                  key={`${item.position}-${item.glyph_id}`}
                  href={detailHref ?? `/practice/${item.glyph_id}`}
                  className="rounded-xl focus:outline-none focus:ring-2 focus:ring-red-800"
                  title={detailHref ? `查看 ${text}` : `練習 ${item.char}`}
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <GlyphImage
                    size={64}
                    containerClassName="aspect-square h-auto w-full"
                    glyph={{
                      id: item.glyph_id,
                      char: item.char,
                      imageUrl: item.image_url,
                      author: item.author,
                      scriptType: item.script_type,
                      workTitle: item.work_title,
                    }}
                  />
                </Link>
              ))}
              {items.length > 8 && (
                <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-stone-200 bg-white text-sm font-bold text-stone-500">
                  +{items.length - 8}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-stone-50 p-2">
            <div className="mx-auto flex w-fit max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-stone-200 bg-white p-2 shadow-inner">
              <div className="flex snap-x snap-mandatory flex-col items-center gap-1.5 [direction:rtl]">
                {verticalItems.map((item) => (
                  <Link
                    key={`${item.position}-${item.glyph_id}`}
                    href={detailHref ?? `/practice/${item.glyph_id}`}
                    className="shrink-0 snap-center rounded-xl [direction:ltr] focus:outline-none focus:ring-2 focus:ring-red-800"
                    title={detailHref ? `查看 ${text}` : `練習 ${item.char}`}
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <GlyphImage
                      size={64}
                      containerClassName="h-16 w-16"
                      glyph={{
                        id: item.glyph_id,
                        char: item.char,
                        imageUrl: item.image_url,
                        author: item.author,
                        scriptType: item.script_type,
                        workTitle: item.work_title,
                      }}
                    />
                  </Link>
                ))}
                {items.length > 6 && (
                  <div className="flex h-8 w-16 shrink-0 snap-center items-center justify-center rounded-lg border border-stone-200 bg-stone-50 text-xs font-bold text-stone-500 [direction:ltr]">
                    +{items.length - 6}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      ) : (
        direction === "horizontal" ? (
          <Link
            href={detailHref ?? "#"}
            className={`block line-clamp-2 min-h-[88px] rounded-2xl bg-stone-50 p-3 text-lg tracking-[0.18em] text-stone-800 sm:text-xl sm:tracking-[0.25em] ${detailHref ? "hover:text-red-800" : "pointer-events-none"}`}
          >
            {text}
          </Link>
        ) : (
          <Link
            href={detailHref ?? "#"}
            className={`flex justify-center rounded-2xl bg-stone-50 p-3 ${detailHref ? "hover:text-red-800" : "pointer-events-none"}`}
          >
            <div className="max-h-48 whitespace-pre-wrap text-center font-serif text-2xl leading-relaxed text-stone-800 [writing-mode:vertical-rl]">
              {text}
            </div>
          </Link>
        )
      )}
    </div>
  );
}
