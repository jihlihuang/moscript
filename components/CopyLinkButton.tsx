"use client";

import { useState } from "react";
import { Link as LinkIcon, Check } from "lucide-react";
import { toast } from "sonner";

export function CopyLinkButton({ url, title = "複製連結", className, hideLabel }: { url: string; title?: string; className?: string; hideLabel?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("連結已複製到剪貼簿");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error("複製失敗，請手動複製網址");
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl text-sm font-bold transition ${hideLabel ? "px-2.5 py-2" : "px-4 py-2"} ${
        copied
          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
          : "bg-stone-100 text-stone-800 hover:bg-stone-200"
      } ${className ?? ""}`}
      title={title}
    >
      {copied ? <Check className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
      {!hideLabel && title}
    </button>
  );
}
