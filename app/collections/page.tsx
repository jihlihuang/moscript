import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { DeleteCollectionButton } from "@/components/DeleteCollectionButton";
import { GlyphImage } from "@/components/GlyphImage";

export const dynamic = "force-dynamic";

type CollectionSummary = {
  id: number;
  title: string;
  text: string;
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
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-2xl font-bold font-serif">集字作品</h1>
            <p className="text-sm text-stone-500">查看 {user.email} 儲存的集字內容</p>
          </div>
          <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-stone-800 px-4 py-2 text-sm font-bold text-white">
            <ArrowLeft className="h-4 w-4" />
            回前台
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-8">
        {collections.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-stone-300 p-10 text-center text-stone-500">
            目前還沒有儲存的集字作品。
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {collections.map((collection) => {
              const items = itemsByCollection[collection.id] ?? [];
              return (
                <div
                  key={collection.id}
                  className="group relative flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-4 transition hover:border-red-700 hover:bg-stone-50"
                >
                  <Link
                    href={`/collections/${collection.id}`}
                    className="absolute inset-0 z-10 rounded-2xl"
                    aria-label={`查看 ${collection.title || "未命名集字作品"}`}
                  />
                  <div className="relative z-0 mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h2 className="line-clamp-1 text-lg font-bold font-serif">{collection.title || "未命名集字作品"}</h2>
                      <p className="mt-1 text-sm text-stone-500">{collection.created_at}</p>
                    </div>
                    <BookOpen className="mt-1 h-5 w-5 shrink-0 text-red-600" />
                  </div>
                  {items.length > 0 ? (
                    <div className="relative z-0 mb-4 flex min-h-[88px] flex-wrap content-start gap-2 overflow-hidden rounded-2xl bg-stone-50 p-3">
                      {items.slice(0, 8).map((item) => (
                        <GlyphImage
                          key={`${collection.id}-${item.position}-${item.glyph_id}`}
                          size={64}
                          glyph={{
                            id: item.glyph_id,
                            char: item.char,
                            imageUrl: item.image_url,
                            author: item.author,
                            scriptType: item.script_type,
                            workTitle: item.work_title,
                          }}
                        />
                      ))}
                      {items.length > 8 && (
                        <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-stone-200 bg-white text-sm font-bold text-stone-500">
                          +{items.length - 8}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="relative z-0 mb-4 line-clamp-2 min-h-[88px] rounded-2xl bg-stone-50 p-3 text-xl tracking-[0.25em] text-stone-800">
                      {collection.text}
                    </div>
                  )}
                  <div className="relative z-20 mt-auto flex items-center justify-between text-sm text-stone-500">
                    <span className="line-clamp-1 pr-3">{collection.text}｜{collection.item_count} 個字圖</span>
                    <DeleteCollectionButton id={collection.id} />
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
