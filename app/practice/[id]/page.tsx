import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Home } from "lucide-react";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { LogoMark } from "@/components/LogoMark";
import { GlyphPracticeCanvas } from "@/components/GlyphPracticeCanvas";
import { type GlyphLike } from "@/components/GlyphImage";
import { GlyphLikeButton } from "@/components/GlyphLikeButton";

type Params = {
  params: Promise<{ id: string }>;
};

type GlyphRow = {
  id: number;
  char: string;
  author: string | null;
  script_type: string | null;
  work_title: string | null;
  image_url: string;
  like_count: number;
  collection_count: number;
  liked_by_me: number;
};

export default async function PracticePage({ params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  const db = await getDb();
  const row = db.prepare(`
    SELECT
      g.id,
      g.char,
      g.author,
      g.script_type,
      g.work_title,
      g.image_url,
      COALESCE(likes.like_count, 0) AS like_count,
      COALESCE(collections.collection_count, 0) AS collection_count,
      CASE WHEN my_like.user_id IS NULL THEN 0 ELSE 1 END AS liked_by_me
    FROM glyphs g
    LEFT JOIN (
      SELECT glyph_id, COUNT(*) AS like_count
      FROM glyph_likes
      GROUP BY glyph_id
    ) likes ON likes.glyph_id = g.id
    LEFT JOIN (
      SELECT glyph_id, COUNT(DISTINCT collection_id) AS collection_count
      FROM collection_items
      GROUP BY glyph_id
    ) collections ON collections.glyph_id = g.id
    LEFT JOIN glyph_likes my_like ON my_like.glyph_id = g.id AND my_like.user_id = ?
    WHERE g.id = ?
  `).get(user?.id ?? "", id) as GlyphRow | undefined;

  if (!row) notFound();

  const glyph: GlyphLike = {
    id: row.id,
    char: row.char,
    imageUrl: row.image_url,
    author: row.author,
    scriptType: row.script_type,
    workTitle: row.work_title,
  };

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-4">
          <div className="flex items-center gap-3">
            <LogoMark imageClassName="h-10 w-10 sm:h-12 sm:w-12" />
            <div>
              <h1 className="font-serif text-xl font-bold sm:text-2xl">單字練習｜{glyph.char}</h1>
              <p className="text-xs text-stone-500 sm:text-sm">手指觸控臨摹練習</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <GlyphLikeButton
              glyphId={glyph.id}
              initialLiked={Boolean(row.liked_by_me)}
              initialLikeCount={Number(row.like_count ?? 0)}
              initialCollectionCount={Number(row.collection_count ?? 0)}
              isAuthenticated={Boolean(user)}
              returnTo={`/practice/${glyph.id}`}
              className="min-h-10 px-4 py-2 text-sm"
            />
            <Link
              href="/collections"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-stone-900"
            >
              <ArrowLeft className="h-4 w-4" />
              集字作品
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-stone-800 px-4 py-2 text-sm font-bold text-white hover:bg-stone-900"
            >
              <Home className="h-4 w-4" />
              回首頁
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
        <GlyphPracticeCanvas glyph={glyph} />
      </section>
    </main>
  );
}
