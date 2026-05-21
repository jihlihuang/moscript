"use client";

import { useState } from "react";
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
  const router = useRouter();

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!window.confirm("確定要刪除這個集字作品嗎？")) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/collections/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        if (redirectOnSuccess) {
          router.push(redirectTo);
        } else {
          router.refresh();
        }
      } else {
        toast.error("刪除失敗");
        setIsDeleting(false);
      }
    } catch (err) {
      toast.error("發生錯誤");
      setIsDeleting(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      className={`inline-flex items-center gap-1.5 rounded-lg p-2 focus:outline-none transition ${
        isDeleting ? "text-red-500 opacity-50 cursor-not-allowed" : "text-zinc-500 hover:bg-red-500/10 hover:text-red-400"
      }`}
      title="刪除"
    >
      {isDeleting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
    </button>
  );
}
