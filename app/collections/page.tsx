import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, Search } from "lucide-react";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { DeleteCollectionButton } from "@/components/DeleteCollectionButton";
import { LogoMark } from "@/components/LogoMark";
import { CollectionPreviewGlyphs } from "@/components/CollectionPreviewGlyphs";

export const dynamic = "force-dynamic";

type CollectionSummary = {
  id: number;
  title: string;
  text: string;
  display_direction: "horizontal" | "vertical" | null;
  created_at: string;
  item_count: number;
};

type CollectionItemPreview = {
  collection_id: number;
  position: number;
  char: string;
  glyph_id: number;
  author: string | null;
  script_type: string | null;
  work_title: string | null;
  image_url: string;
};

export default async function CollectionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/google?returnTo=/collections");

  const db = await getDb();
  const collections = db.prepare(`
    SELECT
      c.id,
      c.title,
      c.text,
      c.display_direction,
      c.created_at,
      COUNT(ci.id) AS item_count
    FROM collections c
    LEFT JOIN collection_items ci ON ci.collection_id = c.id
    WHERE c.user_id = ?
    GROUP BY c.id
    ORDER BY c.id DESC
    LIMIT 100
  `).all(user.id) as CollectionSummary[];

  const itemRows = collections.length > 0
    ? db.prepare(`
      SELECT
        ci.collection_id,
        ci.position,
        ci.char,
        g.id AS glyph_id,
        g.author,
        g.script_type,
        g.work_title,
        g.image_url
      FROM collection_items ci
      JOIN glyphs g ON g.id = ci.glyph_id
      WHERE ci.collection_id IN (${collections.map(() => "?").join(", ")})
      ORDER BY ci.collection_id DESC, ci.position ASC
    `).all(...collections.map((collection) => collection.id)) as CollectionItemPreview[]
    : [];

  const itemsByCollection = itemRows.reduce<Record<number, CollectionItemPreview[]>>((acc, item) => {
    acc[item.collection_id] ??= [];
    acc[item.collection_id].push(item);
    return acc;
  }, {});

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <LogoMark imageClassName="h-10 w-10 sm:h-12 sm:w-12" />
              <div className="min-w-0">
                <h1 className="font-serif text-xl font-bold sm:text-2xl">集字作品</h1>
                <p className="truncate text-xs text-stone-500 sm:text-sm">查看 {user.email} 儲存的集字內容</p>
              </div>
            </div>
          </div>
          <Link href="/me" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-stone-800 px-4 py-2 text-sm font-bold text-white sm:w-auto">
            <ArrowLeft className="h-4 w-4" />
            回個人頁
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-8">
        {collections.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 sm:rounded-3xl sm:p-10 sm:text-base">
            目前還沒有儲存的集字作品。
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {collections.map((collection) => {
              const items = itemsByCollection[collection.id] ?? [];
              return (
                <div
                  key={collection.id}
                  className="group relative flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-3 transition hover:border-red-700 hover:bg-stone-50 sm:p-4"
                >
                  <Link
                    href={`/collections/${collection.id}`}
                    className="absolute inset-0 z-10 rounded-2xl"
                    aria-label={`查看 ${collection.title || "未命名集字作品"}`}
                  />
                  <div className="relative z-0 mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="line-clamp-1 font-serif text-base font-bold sm:text-lg">{collection.title || "未命名集字作品"}</h2>
                      <p className="mt-1 text-xs text-stone-500 sm:text-sm">{collection.created_at}</p>
                    </div>
                    <BookOpen className="mt-1 h-5 w-5 shrink-0 text-red-600" />
                  </div>
                  <CollectionPreviewGlyphs
                    collectionId={collection.id}
                    initialDirection={collection.display_direction === "vertical" ? "vertical" : "horizontal"}
                    items={items}
                    text={collection.text}
                  />
                  <div className="relative z-20 mt-auto flex flex-col gap-2 text-sm text-stone-500 sm:flex-row sm:items-center sm:justify-between">
                    <span className="line-clamp-1 min-w-0">{collection.text}｜{collection.item_count} 個字圖</span>
                    <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                      <Link
                        href={`/?collectionId=${collection.id}`}
                        className="inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg border border-stone-300 px-3 py-1 font-bold text-stone-600 hover:border-red-700 hover:text-stone-900 sm:flex-none sm:px-2"
                      >
                        <Search className="h-3 w-3" />
                        載入
                      </Link>
                      <DeleteCollectionButton id={collection.id} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
