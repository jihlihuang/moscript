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
  const [activeTab, setActiveTab] = useState<"collections" | "glyphs">(
    "collections",
  );

  return (
    <div className="rounded-sm border border-stone-300 bg-[#faf8f5] p-6 shadow-md mt-6">
      <div className="mb-6 flex flex-wrap gap-4 border-b border-stone-300 pb-4">
        <button
          onClick={() => setActiveTab("collections")}
          className={`inline-flex items-center gap-2 px-4 py-2 font-serif text-base font-bold tracking-widest transition-colors ${
            activeTab === "collections"
              ? "border-b-2 border-red-800 text-red-900"
              : "border-b-2 border-transparent text-stone-500 hover:text-stone-800"
          }`}
        >
          <BookOpen className="h-5 w-5" />
          集字卷軸
        </button>
        <button
          onClick={() => setActiveTab("glyphs")}
          className={`inline-flex items-center gap-2 px-4 py-2 font-serif text-base font-bold tracking-widest transition-colors ${
            activeTab === "glyphs"
              ? "border-b-2 border-red-800 text-red-900"
              : "border-b-2 border-transparent text-stone-500 hover:text-stone-800"
          }`}
        >
          <ImageIcon className="h-5 w-5" />
          字圖珍藏
        </button>
      </div>
      <div>
        {activeTab === "collections" && collectionsContent}
        {activeTab === "glyphs" && glyphsContent}
      </div>
    </div>
  );
}
