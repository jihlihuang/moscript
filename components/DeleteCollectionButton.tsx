"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  id: number;
  redirectOnSuccess?: boolean;
  redirectTo?: string;
};

export function DeleteCollectionButton({ id, redirectOnSuccess = false, redirectTo = "/me" }: Props) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPendingConfirm, setIsPendingConfirm] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!isPendingConfirm) return;
    const timer = setTimeout(() => setIsPendingConfirm(false), 3000);
    return () => clearTimeout(timer);
  }, [isPendingConfirm]);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isPendingConfirm) {
      setIsPendingConfirm(true);
      return;
    }

    setIsPendingConfirm(false);
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/collections/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("已刪除集字作品");
        if (redirectOnSuccess) {
          router.push(redirectTo);
        } else {
          router.refresh();
        }
      } else {
        toast.error("刪除失敗");
        setIsDeleting(false);
      }
    } catch {
      toast.error("發生錯誤");
      setIsDeleting(false);
    }
  };

  if (isDeleting) {
    return (
      <button disabled className="inline-flex items-center gap-1.5 rounded-lg p-2 text-red-500 opacity-50 cursor-not-allowed">
        <Loader2 className="h-5 w-5 animate-spin" />
      </button>
    );
  }

  if (isPendingConfirm) {
    return (
      <button
        onClick={handleClick}
        className="inline-flex items-center gap-1 rounded-lg border border-red-600 bg-red-50 px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-100 focus:outline-none"
        title="再按一次確認刪除"
      >
        確認？
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 rounded-lg p-2 text-zinc-500 transition hover:bg-red-500/10 hover:text-red-400 focus:outline-none"
      title="刪除"
    >
      <Trash2 className="h-5 w-5" />
    </button>
  );
}
