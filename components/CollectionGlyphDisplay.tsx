"use client";

import { Columns3, Rows3 } from "lucide-react";
import { GlyphImage } from "@/components/GlyphImage";
import { useCollectionDirectionPreference } from "@/components/useCollectionDirectionPreference";

type CollectionGlyphItem = {
  position: number;
  char: string;
  glyph_id: number;
  author: string | null;
  script_type: string | null;
  work_title: string | null;
  image_url: string;
};

export function CollectionGlyphDisplay({
  collectionId,
  initialDirection,
  items,
}: {
  collectionId: number;
  initialDirection: "horizontal" | "vertical";
  items: CollectionGlyphItem[];
}) {
  const [direction, setDirection] = useCollectionDirectionPreference(collectionId, initialDirection);
  const glyphSizeClass = "h-[clamp(132px,34vw,220px)] w-[clamp(132px,34vw,220px)] sm:h-[clamp(180px,20vw,240px)] sm:w-[clamp(180px,20vw,240px)]";

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
                <GlyphImage
                  key={`${item.position}-${item.glyph_id}`}
                  size={240}
                  containerClassName={`${glyphSizeClass} shrink-0 snap-center`}
                  glyph={{
                    id: item.glyph_id,
                    char: item.char,
                    imageUrl: item.image_url,
                    author: item.author,
                    scriptType: item.script_type,
                    workTitle: item.work_title,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl bg-stone-50 p-3 sm:p-6">
          <div className="overflow-x-auto overscroll-x-contain">
            <div className="mx-auto flex w-fit max-w-full justify-center gap-4 rounded-[1.5rem] bg-white px-4 py-4 shadow-inner sm:px-8 sm:py-8">
              <div className="flex max-h-[min(76vh,720px)] snap-x snap-mandatory flex-col flex-wrap content-start items-center gap-3 [direction:rtl] sm:gap-4">
                {items.map((item) => (
                  <GlyphImage
                    key={`${item.position}-${item.glyph_id}`}
                    size={240}
                    containerClassName={`${glyphSizeClass} shrink-0 snap-center [direction:ltr]`}
                    glyph={{
                      id: item.glyph_id,
                      char: item.char,
                      imageUrl: item.image_url,
                      author: item.author,
                      scriptType: item.script_type,
                      workTitle: item.work_title,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
