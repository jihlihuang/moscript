"use client";

import { useState } from "react";
import { BookOpen, ImageIcon } from "lucide-react";

export function PersonalPageTabs({
  collectionsContent,
  glyphsContent,
}: {
  collectionsContent: React.ReactNode;
  glyphsContent: React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<"collections" | "glyphs">("collections");

  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap gap-2 border-b border-stone-200 pb-4">
        <button
          onClick={() => setActiveTab("collections")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
            activeTab === "collections"
              ? "bg-red-800 text-white"
              : "bg-stone-50 text-stone-600 hover:bg-stone-200"
          }`}
        >
          <BookOpen className="h-4 w-4" />
          最近集字作品
        </button>
        <button
          onClick={() => setActiveTab("glyphs")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
            activeTab === "glyphs"
              ? "bg-red-800 text-white"
              : "bg-stone-50 text-stone-600 hover:bg-stone-200"
          }`}
        >
          <ImageIcon className="h-4 w-4" />
          個人字圖管理
        </button>
      </div>
      <div>
        {activeTab === "collections" && collectionsContent}
        {activeTab === "glyphs" && glyphsContent}
      </div>
    </div>
  );
}
