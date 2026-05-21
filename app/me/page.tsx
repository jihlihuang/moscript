import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, Images, LogOut, Upload } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { CollectionPreviewGlyphs } from "@/components/CollectionPreviewGlyphs";
import { DeleteCollectionButton } from "@/components/DeleteCollectionButton";
import { LogoMark } from "@/components/LogoMark";
import { PersonalGlyphManager, type PersonalGlyph } from "@/components/PersonalGlyphManager";
import { PersonalPageTabs } from "@/components/PersonalPageTabs";

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

export default async function PersonalPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`/api/auth/google?returnTo=${encodeURIComponent("/me")}`);

  const db = await getDb();
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM collections WHERE user_id = ?) AS collection_count,
      (SELECT COUNT(*) FROM glyphs WHERE owner_user_id = ?) AS glyph_count,
      (SELECT COUNT(*) FROM glyphs WHERE owner_user_id = ? AND visibility = 'public') AS public_glyph_count,
      (SELECT COUNT(*) FROM glyphs WHERE owner_user_id = ? AND visibility = 'private') AS private_glyph_count,
      (SELECT COUNT(*)
       FROM glyph_likes gl
       JOIN glyphs g ON g.id = gl.glyph_id
       WHERE g.owner_user_id = ?) AS received_like_count,
      (SELECT COUNT(DISTINCT ci.collection_id)
       FROM collection_items ci
       JOIN glyphs g ON g.id = ci.glyph_id
       WHERE g.owner_user_id = ?) AS used_collection_count
  `).get(user.id, user.id, user.id, user.id, user.id, user.id) as {
    collection_count: number;
    glyph_count: number;
    public_glyph_count: number;
    private_glyph_count: number;
    received_like_count: number;
    used_collection_count: number;
  };

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
    LIMIT 6
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

  const glyphRows = db.prepare(`
    SELECT
      g.id,
      g.char,
      g.author,
      g.script_type,
      g.work_title,
      g.image_url,
      COALESCE(g.visibility, 'public') AS visibility,
      g.created_at,
      COALESCE(likes.like_count, 0) AS like_count,
      COALESCE(collections.collection_count, 0) AS collection_count
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
    WHERE g.owner_user_id = ?
    ORDER BY g.id DESC
    LIMIT 100
  `).all(user.id) as {
    id: number;
    char: string;
    author: string | null;
    script_type: string | null;
    work_title: string | null;
    image_url: string;
    visibility: "public" | "private";
    created_at: string;
    like_count: number;
    collection_count: number;
  }[];

  const personalGlyphs: PersonalGlyph[] = glyphRows.map((glyph) => ({
    id: glyph.id,
    char: glyph.char,
    author: glyph.author,
    scriptType: glyph.script_type,
    workTitle: glyph.work_title,
    imageUrl: glyph.image_url,
    visibility: glyph.visibility === "private" ? "private" : "public",
    likeCount: glyph.like_count,
    collectionCount: glyph.collection_count,
    createdAt: glyph.created_at,
  }));

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-50 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <LogoMark imageClassName="h-10 w-10 sm:h-12 sm:w-12" />
            <div className="min-w-0">
              <h1 className="font-serif text-xl font-bold sm:text-2xl">個人頁</h1>
              <p className="truncate text-xs text-stone-500 sm:text-sm">{user.email}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <Link href="/" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-stone-800 px-4 py-2 text-sm font-bold text-white hover:bg-stone-900">
              <ArrowLeft className="h-4 w-4" />
              回首頁
            </Link>
            <form action="/api/auth/logout?returnTo=/" method="post">
              <button type="submit" className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-stone-900">
                <LogOut className="h-4 w-4" />
                登出
              </button>
            </form>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl space-y-4 px-3 py-4 sm:px-4 sm:py-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["集字作品", stats.collection_count],
            ["上傳字圖", stats.glyph_count],
            ["公開 / 私人", `${stats.public_glyph_count} / ${stats.private_glyph_count}`],
            ["收到讚 / 被集字", `${stats.received_like_count} / ${stats.used_collection_count}`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="text-sm text-stone-500">{label}</div>
              <div className="mt-2 font-serif text-2xl font-bold">{value}</div>
            </div>
          ))}
        </div>

        <section className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-lg font-bold">個人功能</h2>
              <p className="text-sm text-stone-500">上傳字圖、管理個人字圖與查看儲存作品。</p>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex">
              <Link href="/upload" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-red-800 px-4 py-2 text-sm font-bold text-white hover:bg-red-700">
                <Upload className="h-4 w-4" />
                上傳字圖
              </Link>
              <Link href="/collections" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700 hover:border-red-700">
                <Images className="h-4 w-4" />
                全部集字
              </Link>
            </div>
          </div>
        </section>

        <PersonalPageTabs
          collectionsContent={
            <div>
              <div className="mb-4">
                <p className="text-sm text-stone-500">最近儲存的 6 件作品。</p>
              </div>
              {collections.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
                  目前還沒有儲存的集字作品。
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {collections.map((collection) => {
                    const items = itemsByCollection[collection.id] ?? [];
                    return (
                      <div key={collection.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="line-clamp-1 font-serif text-base font-bold">
                              {collection.title || "未命名集字作品"}
                            </h3>
                            <p className="mt-1 text-xs text-stone-500">{collection.created_at}｜{collection.item_count} 字</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Link
                              href={`/collections/${collection.id}`}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-700 hover:bg-red-50 hover:text-red-800 focus:outline-none focus:ring-2 focus:ring-red-800"
                              aria-label={`查看 ${collection.title || "未命名集字作品"}`}
                              title="查看作品"
                            >
                              <BookOpen className="h-5 w-5" />
                            </Link>
                            <DeleteCollectionButton id={collection.id} />
                          </div>
                        </div>
                        <CollectionPreviewGlyphs
                          collectionId={collection.id}
                          initialDirection={collection.display_direction === "vertical" ? "vertical" : "horizontal"}
                          items={items}
                          text={collection.text}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          }
          glyphsContent={
            <div>
              <div className="mb-4">
                <p className="text-sm text-stone-500">可切換公開/私人，並查看每個字圖的讚數與被集字數。</p>
              </div>
              <PersonalGlyphManager initialGlyphs={personalGlyphs} />
            </div>
          }
        />
      </section>
    </main>
  );
}
