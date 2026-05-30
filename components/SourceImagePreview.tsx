"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { ImageLightbox } from "@/components/ImageLightbox";

export function SourceImagePreview({
  src,
  char,
  setId,
  variant = "default",
}: {
  src: string;
  char: string;
  setId: number;
  variant?: "default" | "compact";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "compact"
            ? "inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-stone-300 px-3 py-1 text-sm font-bold text-stone-600 hover:border-red-700 hover:text-red-800 sm:px-2"
            : "mb-3 flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600 hover:border-red-700 hover:text-red-800"
        }
      >
        {variant === "compact" ? (
          <>
            <ImageIcon className="h-3 w-3" />
            原圖
          </>
        ) : (
          <>
            <img src={src} alt={`${char} 字組原圖`} className="h-12 w-12 rounded-lg object-contain bg-white" />
            <div className="text-left">
              <div className="font-medium">查看字組原圖參考</div>
              <div className="text-stone-400">字組 #{setId} · 點擊放大</div>
            </div>
          </>
        )}
      </button>
      {open && <ImageLightbox src={src} alt={`${char} 字組原圖`} onClose={() => setOpen(false)} />}
    </>
  );
}
