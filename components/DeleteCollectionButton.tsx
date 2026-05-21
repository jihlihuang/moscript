"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

type Props = {
  id: number;
  redirectOnSuccess?: boolean;
};

export function DeleteCollectionButton({ id, redirectOnSuccess = false }: Props) {
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
          router.push("/me");
          router.refresh();
        } else {
          router.refresh();
        }
      } else {
        alert("刪除失敗");
        setIsDeleting(false);
      }
    } catch (err) {
      alert("發生錯誤");
      setIsDeleting(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      className="inline-flex items-center gap-1.5 rounded-lg p-2 text-zinc-500 hover:bg-red-500/10 hover:text-red-400 focus:outline-none disabled:opacity-50 transition"
      title="刪除"
    >
      <Trash2 className="h-5 w-5" />
    </button>
  );
}
