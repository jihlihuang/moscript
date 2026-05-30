"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** 全螢幕內嵌圖片預覽 — 按 Esc 或點空白區關閉 */
export function ImageLightbox({
  src,
  alt = "圖片預覽",
  onClose,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-stone-950/85 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-label={alt}
    >
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <img
          src={src}
          alt={alt}
          className="max-h-[85vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
        />
        <button
          type="button"
          onClick={onClose}
          className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-stone-700 shadow-lg hover:bg-stone-100"
          aria-label="關閉"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="mt-2 text-center text-xs text-white/60">點擊空白處或按 Esc 關閉</p>
      </div>
    </div>,
    document.body
  );
}
