import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Home } from "lucide-react";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { LogoMark } from "@/components/LogoMark";
import { GlyphPracticeCanvas } from "@/components/GlyphPracticeCanvas";
import { type GlyphLike } from "@/components/GlyphImage";
import { GlyphLikeButton } from "@/components/GlyphLikeButton";
import { glyphStatsJoinSql, glyphStatsSelectSql } from "@/lib/glyph-stats";

type Params = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ collectionId?: string; position?: string }>;
};

type GlyphRow = {
  id: number;
  char: string;
  author: string | null;
  script_type: string | null;
  work_title: string | null;
  image_url: string;
  thumbnail_url: string | null;
  like_count: number;
  collection_count: number;
  liked_by_me: number;
};

type PracticeNavItem = {
  position: number;
  char: string;
  glyph_id: number;
};

export default async function PracticePage({ params, searchParams }: Params) {
  const { id } = await params;
  const query = await searchParams;
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
      g.thumbnail_url,
      ${glyphStatsSelectSql()}
    FROM glyphs g
    ${glyphStatsJoinSql("g")}
    WHERE g.id = ?
  `).get(user?.id ?? "", id) as GlyphRow | undefined;

  if (!row) notFound();

  const collectionId = Number(query?.collectionId);
  const currentPosition = Number(query?.position);
  const collectionItems =
    user && Number.isInteger(collectionId) && Number.isInteger(currentPosition)
      ? db.prepare(`
          SELECT ci.position, ci.char, ci.glyph_id
          FROM collection_items ci
          JOIN collections c ON c.id = ci.collection_id
          WHERE ci.collection_id = ? AND c.user_id = ?
          ORDER BY ci.position ASC
        `).all(collectionId, user.id) as PracticeNavItem[]
      : [];
  const navIndex = collectionItems.findIndex((item) => item.position === currentPosition && item.glyph_id === row.id);
  const previousItem = navIndex > 0 ? collectionItems[navIndex - 1] : null;
  const nextItem = navIndex >= 0 && navIndex < collectionItems.length - 1 ? collectionItems[navIndex + 1] : null;
  const collectionHref = Number.isInteger(collectionId) ? `/collections/${collectionId}` : "/collections";
  const practiceHref = (item: PracticeNavItem) => `/practice/${item.glyph_id}?collectionId=${collectionId}&position=${item.position}`;

  const glyph: GlyphLike = {
    id: row.id,
    char: row.char,
    imageUrl: row.image_url,
    thumbnailUrl: null,
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
            {collectionItems.length > 0 && (
              <>
                <Link
                  href={previousItem ? practiceHref(previousItem) : "#"}
                  aria-disabled={!previousItem}
                  className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold ${
                    previousItem
                      ? "border-stone-300 text-stone-700 hover:border-red-700 hover:text-stone-900"
                      : "pointer-events-none border-stone-200 text-stone-300"
                  }`}
                >
                  <ChevronLeft className="h-4 w-4" />
                  上一字
                </Link>
                <Link
                  href={nextItem ? practiceHref(nextItem) : "#"}
                  aria-disabled={!nextItem}
                  className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold ${
                    nextItem
                      ? "border-stone-300 text-stone-700 hover:border-red-700 hover:text-stone-900"
                      : "pointer-events-none border-stone-200 text-stone-300"
                  }`}
                >
                  下一字
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </>
            )}
            <Link
              href={collectionHref}
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
