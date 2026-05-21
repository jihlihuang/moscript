"use client";

import { useState } from "react";
import { BookOpen, ImageIcon } from "lucide-react";

export function PersonalPageTabs({
  collectionsContent,
  glyphsContent,
  defaultTab = "collections",
}: {
  collectionsContent: React.ReactNode;
  glyphsContent: React.ReactNode;
  defaultTab?: "collections" | "glyphs";
}) {
  const [activeTab, setActiveTab] = useState<"collections" | "glyphs">(defaultTab);

  const tabs = [
    { id: "collections" as const, label: "集字作品", icon: BookOpen },
    { id: "glyphs" as const, label: "我的字圖", icon: ImageIcon },
  ];

  return (
    <div id="tabs">
      <div className="mb-5 flex gap-1 border-b border-stone-200">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`relative flex items-center gap-2 px-1 pb-3 text-sm font-bold transition-colors mr-5 ${
              activeTab === id
                ? "text-stone-800"
                : "text-stone-400 hover:text-stone-600"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
            {activeTab === id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-700" />
            )}
          </button>
        ))}
      </div>
      <div>
        {activeTab === "collections" && collectionsContent}
        {activeTab === "glyphs" && glyphsContent}
      </div>
    </div>
  );
}
