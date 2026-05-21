import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { LogoMark } from "@/components/LogoMark";
import { CollectionsListWithSearch } from "@/components/CollectionsListWithSearch";
import { glyphImageUrlForAccess } from "@/lib/glyph-access";
import { glyphStatsJoinSql, glyphStatsSelectSql } from "@/lib/glyph-stats";

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
  thumbnail_url: string | null;
  owner_user_id: string | null;
  visibility: string | null;
  like_count: number;
  collection_count: number;
  liked_by_me: number;
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
        g.image_url,
        g.thumbnail_url,
        g.owner_user_id,
        g.visibility,
        ${glyphStatsSelectSql()}
      FROM collection_items ci
      JOIN glyphs g ON g.id = ci.glyph_id
      ${glyphStatsJoinSql("g")}
      WHERE ci.collection_id IN (${collections.map(() => "?").join(", ")})
      ORDER BY ci.collection_id DESC, ci.position ASC
    `).all(user.id, ...collections.map((collection) => collection.id)) as CollectionItemPreview[]
    : [];

  const securedItemRows = itemRows.map((item) => ({
    ...item,
    image_url: glyphImageUrlForAccess({
      id: item.glyph_id,
      owner_user_id: item.owner_user_id,
      visibility: item.visibility,
      image_url: item.image_url,
      thumbnail_url: item.thumbnail_url,
    }, "image") ?? item.image_url,
    thumbnail_url: glyphImageUrlForAccess({
      id: item.glyph_id,
      owner_user_id: item.owner_user_id,
      visibility: item.visibility,
      image_url: item.image_url,
      thumbnail_url: item.thumbnail_url,
    }, "thumbnail"),
  }));

  const itemsByCollection = securedItemRows.reduce<Record<number, CollectionItemPreview[]>>((acc, item) => {
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
        <CollectionsListWithSearch
          collections={collections}
          itemsByCollection={itemsByCollection}
        />
      </section>
    </main>
  );
}
