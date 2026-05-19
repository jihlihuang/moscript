import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type CollectionSummary = {
  id: number;
  title: string;
  text: string;
  created_at: string;
  item_count: number;
};

export default async function CollectionsPage() {
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
    GROUP BY c.id
    ORDER BY c.id DESC
    LIMIT 100
  `).all() as CollectionSummary[];

  return (
    <main className="min-h-screen bg-[#0f1012] text-zinc-50">
      <header className="border-b border-zinc-800 bg-[#15171a]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-2xl font-bold">集字作品</h1>
            <p className="text-sm text-zinc-400">查看已儲存的集字內容</p>
          </div>
          <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-950">
            <ArrowLeft className="h-4 w-4" />
            回前台
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-8">
        {collections.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-700 p-10 text-center text-zinc-500">
            目前還沒有儲存的集字作品。
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {collections.map((collection) => (
              <Link
                key={collection.id}
                href={`/collections/${collection.id}`}
                className="rounded-2xl border border-zinc-800 bg-[#181a1f] p-4 transition hover:border-fuchsia-500 hover:bg-[#1f2228]"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="line-clamp-1 text-lg font-bold">{collection.title || "未命名集字作品"}</h2>
                    <p className="mt-1 text-sm text-zinc-500">{collection.created_at}</p>
                  </div>
                  <BookOpen className="mt-1 h-5 w-5 shrink-0 text-fuchsia-400" />
                </div>
                <div className="line-clamp-2 text-xl tracking-[0.25em] text-zinc-100">
                  {collection.text}
                </div>
                <div className="mt-4 text-sm text-zinc-500">
                  {collection.item_count} 個字圖
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
