"use client";

import { useState } from "react";
import { Globe, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

type Props = {
  id: number;
  initialVisibility: "public" | "private";
};

export function ToggleCollectionVisibilityButton({ id, initialVisibility }: Props) {
  const [visibility, setVisibility] = useState<"public" | "private">(initialVisibility);
  const [isBusy, setIsBusy] = useState(false);

  const isPrivate = visibility === "private";

  async function handleToggle() {
    setIsBusy(true);
    const next = isPrivate ? "public" : "private";
    try {
      const res = await fetch(`/api/collections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: next }),
      });
      if (res.ok) {
        setVisibility(next);
        toast.success(next === "private" ? "已設為私人，僅自己可見" : "已設為公開，任何人可透過連結查看");
      } else {
        toast.error("變更失敗");
      }
    } catch {
      toast.error("發生錯誤");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isBusy}
      title={isPrivate ? "目前私人，點擊設為公開" : "目前公開，點擊設為私人"}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        isPrivate
          ? "border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100"
          : "border-stone-300 text-stone-700 hover:border-stone-400"
      }`}
    >
      {isBusy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isPrivate ? (
        <Lock className="h-4 w-4" />
      ) : (
        <Globe className="h-4 w-4" />
      )}
      {isPrivate ? "私人" : "公開"}
    </button>
  );
}
