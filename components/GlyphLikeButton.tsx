"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";

type GlyphLikeStats = {
  liked: boolean;
  likeCount: number;
  collectionCount: number;
};

export function GlyphLikeButton({
  glyphId,
  initialLiked,
  initialLikeCount,
  initialCollectionCount = 0,
  isAuthenticated,
  returnTo,
  className = "",
  onChange,
}: {
  glyphId: number;
  initialLiked: boolean;
  initialLikeCount: number;
  initialCollectionCount?: number;
  isAuthenticated: boolean;
  returnTo: string;
  className?: string;
  onChange?: (stats: GlyphLikeStats) => void;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    setLiked(initialLiked);
    setLikeCount(initialLikeCount);
  }, [initialLiked, initialLikeCount]);

  async function toggleLike() {
    if (!isAuthenticated) {
      window.location.href = `/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`;
      return;
    }

    setIsBusy(true);
    try {
      const res = await fetch(`/api/glyphs/${glyphId}/like`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "按讚失敗");

      const nextStats = {
        liked: Boolean(json.liked),
        likeCount: Number(json.likeCount ?? 0),
        collectionCount: Number(json.collectionCount ?? initialCollectionCount),
      };
      setLiked(nextStats.liked);
      setLikeCount(nextStats.likeCount);
      onChange?.(nextStats);
    } catch (error) {
      alert(error instanceof Error ? error.message : "按讚失敗");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggleLike()}
      disabled={isBusy}
      className={`inline-flex items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
        liked
          ? "border-red-700 bg-red-50 text-red-800"
          : "border-stone-300 bg-white text-stone-600 hover:border-red-700 hover:text-red-800"
      } ${className}`}
      aria-pressed={liked}
      aria-label={liked ? "取消讚" : "按讚"}
      title={liked ? "取消讚" : "按讚"}
    >
      <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
      {likeCount}
    </button>
  );
}
