import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, Images, LogOut, Upload } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { CollectionPreviewGlyphs } from "@/components/CollectionPreviewGlyphs";
import { DeleteCollectionButton } from "@/components/DeleteCollectionButton";
import { LogoMark } from "@/components/LogoMark";
import {
  PersonalGlyphManager,
  type PersonalGlyph,
} from "@/components/PersonalGlyphManager";
import { PersonalPageTabs } from "@/components/PersonalPageTabs";
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

export default async function PersonalPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const query = await searchParams;
  const defaultTab: "collections" | "glyphs" =
    query?.tab === "glyphs" ? "glyphs" : "collections";

  const user = await getCurrentUser();
  if (!user) redirect(`/api/auth/google?returnTo=${encodeURIComponent("/me")}`);

  const db = await getDb();
  const stats = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM collections WHERE user_id = ?) AS collection_count,
        (SELECT COUNT(*) FROM glyphs WHERE owner_user_id = ?) AS glyph_count,
        (SELECT COUNT(*) FROM glyphs WHERE owner_user_id = ? AND visibility = 'public') AS public_glyph_count,
        (SELECT COUNT(*) FROM glyph_likes gl JOIN glyphs g ON g.id = gl.glyph_id WHERE g.owner_user_id = ?) AS received_like_count`,
    )
    .get(user.id, user.id, user.id, user.id) as {
    collection_count: number;
    glyph_count: number;
    public_glyph_count: number;
    received_like_count: number;
  };

  const collections = db
    .prepare(
      `SELECT c.id, c.title, c.text, c.display_direction, c.created_at, COUNT(ci.id) AS item_count
       FROM collections c
       LEFT JOIN collection_items ci ON ci.collection_id = c.id
       WHERE c.user_id = ?
       GROUP BY c.id
       ORDER BY c.id DESC
       LIMIT 6`,
    )
    .all(user.id) as CollectionSummary[];

  const itemRows =
    collections.length > 0
      ? (db
          .prepare(
            `SELECT
              ci.collection_id, ci.position, ci.char,
              g.id AS glyph_id, g.author, g.script_type, g.work_title,
              g.image_url, g.thumbnail_url, g.owner_user_id, g.visibility,
              ${glyphStatsSelectSql()}
             FROM collection_items ci
             JOIN glyphs g ON g.id = ci.glyph_id
             ${glyphStatsJoinSql("g")}
             WHERE ci.collection_id IN (${collections.map(() => "?").join(", ")})
             ORDER BY ci.collection_id DESC, ci.position ASC`,
          )
          .all(user.id, ...collections.map((c) => c.id)) as CollectionItemPreview[])
      : [];

  const securedItemRows = itemRows.map((item) => ({
    ...item,
    image_url:
      glyphImageUrlForAccess(
        { id: item.glyph_id, owner_user_id: item.owner_user_id, visibility: item.visibility, image_url: item.image_url, thumbnail_url: item.thumbnail_url },
        "image",
      ) ?? item.image_url,
    thumbnail_url: glyphImageUrlForAccess(
      { id: item.glyph_id, owner_user_id: item.owner_user_id, visibility: item.visibility, image_url: item.image_url, thumbnail_url: item.thumbnail_url },
      "thumbnail",
    ),
  }));

  const itemsByCollection = securedItemRows.reduce<Record<number, CollectionItemPreview[]>>(
    (acc, item) => {
      acc[item.collection_id] ??= [];
      acc[item.collection_id].push(item);
      return acc;
    },
    {},
  );

  const glyphRows = db
    .prepare(
      `SELECT g.id, g.char, g.author, g.script_type, g.work_title,
              g.image_url, g.thumbnail_url,
              COALESCE(g.visibility, 'public') AS visibility,
              g.created_at, ${glyphStatsSelectSql()}
       FROM glyphs g
       ${glyphStatsJoinSql("g")}
       WHERE g.owner_user_id = ?
       ORDER BY g.id DESC
       LIMIT 24`,
    )
    .all(user.id, user.id) as {
    id: number;
    char: string;
    author: string | null;
    script_type: string | null;
    work_title: string | null;
    image_url: string;
    thumbnail_url: string | null;
    visibility: "public" | "private";
    created_at: string;
    like_count: number;
    collection_count: number;
    liked_by_me: number;
  }[];

  const personalGlyphs: PersonalGlyph[] = glyphRows.map((glyph) => ({
    id: glyph.id,
    char: glyph.char,
    author: glyph.author,
    scriptType: glyph.script_type,
    workTitle: glyph.work_title,
    imageUrl: glyphImageUrlForAccess({ ...glyph, owner_user_id: user.id }, "image") ?? glyph.image_url,
    thumbnailUrl: glyphImageUrlForAccess({ ...glyph, owner_user_id: user.id }, "thumbnail"),
    visibility: glyph.visibility === "private" ? "private" : "public",
    likeCount: glyph.like_count,
    collectionCount: glyph.collection_count,
    createdAt: glyph.created_at,
  }));

  const displayName = user.name || user.email.split("@")[0];
  const sealChar = displayName.charAt(0).toUpperCase();

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-3 sm:px-4 sm:py-4">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <LogoMark imageClassName="h-10 w-10 sm:h-12 sm:w-12" />
            <div className="min-w-0">
              <h1 className="truncate font-serif text-xl font-bold sm:text-2xl">個人頁</h1>
              <p className="truncate text-xs text-stone-500 sm:text-sm">管理字圖與集字作品</p>
            </div>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700 hover:border-red-700 hover:text-stone-900 sm:px-4 sm:text-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">回首頁</span>
            </Link>
            <form action="/api/auth/logout?returnTo=/" method="post">
              <button
                type="submit"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700 hover:border-red-700 hover:text-stone-900 sm:px-4 sm:text-sm"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">登出</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-4 px-3 py-4 sm:px-4 sm:py-6 sm:space-y-6">

        {/* ── User info + stats card ── */}
        <div className="rounded-2xl border border-stone-200 bg-white shadow-sm sm:rounded-3xl">

          {/* User identity row */}
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-center gap-4">
              {/* Seal avatar */}
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-red-800 shadow-sm">
                <span className="select-none font-serif text-2xl font-bold text-white">
                  {sealChar}
                </span>
              </div>
              <div>
                <p className="font-serif text-lg font-bold text-stone-800 sm:text-xl">
                  {displayName}
                </p>
                <p className="text-sm text-stone-500">{user.email}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/upload"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-stone-800 px-4 py-2 text-sm font-bold text-white hover:bg-stone-900"
              >
                <Upload className="h-4 w-4" />
                上傳字圖
              </Link>
              <Link
                href="/collections"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-stone-900"
              >
                <Images className="h-4 w-4" />
                集字作品
              </Link>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 divide-x divide-y divide-stone-100 border-t border-stone-100 sm:grid-cols-4 sm:divide-y-0">
            {(
              [
                ["集字作品", stats.collection_count, "卷", "/me?tab=collections#tabs"],
                ["上傳字圖", stats.glyph_count, "幀", "/me?tab=glyphs#tabs"],
                ["公開字圖", stats.public_glyph_count, "幀", "/me?tab=glyphs#tabs"],
                ["收到的讚", stats.received_like_count, "個", null],
              ] as const
            ).map(([label, value, unit, href]) => {
              const inner = (
                <>
                  <span className="text-xs text-stone-500">{label}</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="font-serif text-2xl font-bold text-stone-800 sm:text-3xl">
                      {value}
                    </span>
                    <span className="text-xs text-stone-400">{unit}</span>
                  </div>
                </>
              );
              return href ? (
                <Link
                  key={label}
                  href={href}
                  className="group flex flex-col items-center py-5 text-center transition-colors hover:bg-stone-50"
                >
                  {inner}
                </Link>
              ) : (
                <div key={label} className="flex flex-col items-center py-5 text-center">
                  {inner}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Collections / Glyphs ── */}
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
          <PersonalPageTabs
            defaultTab={defaultTab}
            collectionsContent={
              collections.length === 0 ? (
                <div className="rounded-xl border border-dashed border-stone-300 py-12 text-center text-sm text-stone-400">
                  尚無集字作品，前往首頁開始集字吧。
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {collections.map((collection) => {
                    const items = itemsByCollection[collection.id] ?? [];
                    return (
                      <div
                        key={collection.id}
                        className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-50 transition-shadow hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-3 bg-white px-4 py-3">
                          <div className="min-w-0">
                            <h3 className="line-clamp-1 font-serif text-base font-bold text-stone-800">
                              {collection.title || "未命名集字作品"}
                            </h3>
                            <p className="mt-0.5 text-xs text-stone-400">
                              {collection.created_at} · {collection.item_count} 字
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <Link
                              href={`/collections/${collection.id}`}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-100 hover:text-red-800"
                              title="查看集字作品"
                            >
                              <BookOpen className="h-4 w-4" />
                            </Link>
                            <DeleteCollectionButton id={collection.id} />
                          </div>
                        </div>
                        <div className="p-3">
                          <CollectionPreviewGlyphs
                            collectionId={collection.id}
                            initialDirection={
                              collection.display_direction === "vertical"
                                ? "vertical"
                                : "horizontal"
                            }
                            items={items}
                            text={collection.text}
                            isAuthenticated={true}
                            likeReturnTo="/me"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            }
            glyphsContent={
              <PersonalGlyphManager
                initialGlyphs={personalGlyphs}
                initialHasMore={glyphRows.length === 24}
              />
            }
          />
        </div>
      </div>
    </main>
  );
}
