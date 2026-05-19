import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/lib/db";
import { GlyphImage } from "@/components/GlyphImage";
import { getCurrentUser } from "@/lib/auth";
import { DeleteCollectionButton } from "@/components/DeleteCollectionButton";

type Params = {
  params: Promise<{ id: string }>;
};

type Collection = {
  id: number;
  title: string;
  text: string;
  created_at: string;
};

type Item = {
  position: number;
  char: string;
  glyph_id: number;
  author: string | null;
  script_type: string | null;
  work_title: string | null;
  image_url: string;
  source: string | null;
  license: string | null;
};

export default async function CollectionPage({ params }: Params) {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/google?returnTo=/collections");

  const { id } = await params;
  const db = await getDb();

  const collection = db.prepare(`
    SELECT id, title, text, created_at
    FROM collections
    WHERE id = ? AND user_id = ?
  `).get(id, user.id) as Collection | undefined;

  if (!collection) notFound();

  const items = db.prepare(`
    SELECT
      ci.position,
      ci.char,
      g.id as glyph_id,
      g.author,
      g.script_type,
      g.work_title,
      g.image_url,
      g.source,
      g.license
    FROM collection_items ci
    JOIN glyphs g ON g.id = ci.glyph_id
    WHERE ci.collection_id = ?
    ORDER BY ci.position ASC
  `).all(id) as Item[];

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-2xl font-bold font-serif">{collection.title}</h1>
            <p className="text-sm text-stone-500">集字作品｜{collection.created_at}</p>
          </div>
          <div className="flex items-center gap-3">
            <DeleteCollectionButton id={collection.id} redirectOnSuccess={true} />
            <Link href="/collections" className="inline-flex items-center gap-2 rounded-xl bg-stone-100 px-4 py-2 text-sm font-bold text-stone-800 transition hover:bg-stone-200">
              <ArrowLeft className="h-4 w-4" />
              回列表
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="rounded-3xl border border-stone-200 bg-white p-6">
          <div className="flex flex-wrap justify-center gap-3 rounded-3xl bg-stone-50 p-6">
            {items.map((item) => (
              <GlyphImage
                key={`${item.position}-${item.glyph_id}`}
                size={120}
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
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <div key={`${item.position}-meta`} className="rounded-2xl bg-stone-50 p-4 text-sm text-stone-600">
                <div className="mb-1 text-lg font-bold font-serif text-stone-900">{item.char}</div>
                <div>作者：{item.author || "佚名"}</div>
                <div>書體：{item.script_type || "未標註"}</div>
                <div>作品：{item.work_title || "未標題"}</div>
                <div className="truncate text-stone-500">來源：{item.source || "未標註"}</div>
                <div className="truncate text-stone-500">授權：{item.license || "未標註"}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
