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

export default async function PersonalPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`/api/auth/google?returnTo=${encodeURIComponent("/me")}`);

  const db = await getDb();
  const stats = db
    .prepare(
      `
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
  `,
    )
    .get(user.id, user.id, user.id, user.id, user.id, user.id) as {
    collection_count: number;
    glyph_count: number;
    public_glyph_count: number;
    private_glyph_count: number;
    received_like_count: number;
    used_collection_count: number;
  };

  const collections = db
    .prepare(
      `
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
  `,
    )
    .all(user.id) as CollectionSummary[];

  const itemRows =
    collections.length > 0
      ? (db
          .prepare(
            `
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
    `,
          )
          .all(
            user.id,
            ...collections.map((collection) => collection.id),
          ) as CollectionItemPreview[])
      : [];

  const securedItemRows = itemRows.map((item) => ({
    ...item,
    image_url:
      glyphImageUrlForAccess(
        {
          id: item.glyph_id,
          owner_user_id: item.owner_user_id,
          visibility: item.visibility,
          image_url: item.image_url,
          thumbnail_url: item.thumbnail_url,
        },
        "image",
      ) ?? item.image_url,
    thumbnail_url: glyphImageUrlForAccess(
      {
        id: item.glyph_id,
        owner_user_id: item.owner_user_id,
        visibility: item.visibility,
        image_url: item.image_url,
        thumbnail_url: item.thumbnail_url,
      },
      "thumbnail",
    ),
  }));

  const itemsByCollection = securedItemRows.reduce<
    Record<number, CollectionItemPreview[]>
  >((acc, item) => {
    acc[item.collection_id] ??= [];
    acc[item.collection_id].push(item);
    return acc;
  }, {});

  const glyphRows = db
    .prepare(
      `
    SELECT
      g.id,
      g.char,
      g.author,
      g.script_type,
      g.work_title,
      g.image_url,
      g.thumbnail_url,
      COALESCE(g.visibility, 'public') AS visibility,
      g.created_at,
      ${glyphStatsSelectSql()}
    FROM glyphs g
    ${glyphStatsJoinSql("g")}
    WHERE g.owner_user_id = ?
    ORDER BY g.id DESC
    LIMIT 24
  `,
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
    imageUrl:
      glyphImageUrlForAccess({ ...glyph, owner_user_id: user.id }, "image") ??
      glyph.image_url,
    thumbnailUrl: glyphImageUrlForAccess(
      { ...glyph, owner_user_id: user.id },
      "thumbnail",
    ),
    visibility: glyph.visibility === "private" ? "private" : "public",
    likeCount: glyph.like_count,
    collectionCount: glyph.collection_count,
    createdAt: glyph.created_at,
  }));

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900 pb-10">
      <header className="sticky top-0 z-50 border-b border-stone-200 bg-[#fdfbf7]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <LogoMark imageClassName="h-10 w-10 sm:h-12 sm:w-12" />
            <div className="min-w-0">
              <h1 className="font-serif text-xl font-bold tracking-widest text-stone-800 sm:text-2xl">
                個人齋軒
              </h1>
              <p className="truncate text-xs font-serif text-stone-500 sm:text-sm">
                我的書法旅程
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <Link
              href="/"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-stone-800 px-4 py-2 text-sm font-bold text-[#fdfbf7] hover:bg-stone-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              回首頁
            </Link>
            <form action="/api/auth/logout?returnTo=/" method="post">
              <button
                type="submit"
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700 hover:border-red-800 hover:text-red-900 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                登出
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Hero Banner Section (Neo-Chinese Style) */}
      <section className="relative mx-auto max-w-6xl px-3 py-6 sm:px-4 sm:py-10">
        <div className="relative overflow-hidden bg-white p-6 sm:p-10 md:p-14 border border-stone-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          {/* Abstract background decorative elements */}
          <div className="absolute right-0 top-0 h-full w-1/3 bg-stone-50" />
          <div className="absolute bottom-0 right-[30%] h-1/2 w-[1px] bg-stone-200" />
          
          <div className="relative z-10 flex flex-col items-start gap-8 md:flex-row md:items-end md:justify-between">
            <div className="flex items-start gap-6 sm:gap-8">
              {/* Modern abstract seal */}
              <div className="flex shrink-0 items-center justify-center bg-red-800 px-3 py-6 sm:px-4 sm:py-8 shadow-md">
                <span className="[writing-mode:vertical-rl] font-serif text-xl sm:text-2xl font-bold tracking-[0.3em] text-white">
                  墨跡
                </span>
              </div>
              <div className="pt-2">
                {/* Minimalist large typography */}
                <h2 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-black tracking-widest text-stone-900 leading-tight">
                  書房雅集
                </h2>
                <div className="mt-6 flex items-center gap-4">
                  <div className="h-[1px] w-12 bg-red-800"></div>
                  <p className="font-serif text-sm sm:text-base tracking-[0.2em] text-stone-500">
                    {user.email}
                  </p>
                </div>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href="/upload"
                    className="group relative inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden border border-stone-900 bg-stone-900 px-8 py-3 font-serif text-sm font-bold text-white transition-all hover:bg-stone-800"
                  >
                    <Upload className="h-4 w-4" />
                    <span className="relative z-10 tracking-widest">獻曝字圖</span>
                  </Link>
                  <Link
                    href="/collections"
                    className="inline-flex min-h-12 items-center justify-center gap-2 border border-stone-200 bg-white px-8 py-3 font-serif text-sm font-bold text-stone-700 transition-colors hover:border-stone-400 hover:text-stone-900"
                  >
                    <Images className="h-4 w-4" />
                    <span className="tracking-widest">總覽集字</span>
                  </Link>
                </div>
              </div>
            </div>
            
            {/* User initial in modern layout */}
            <div className="hidden md:block">
              <div className="font-serif text-[140px] font-light leading-none text-stone-100 select-none pointer-events-none -mb-8">
                {user.email ? user.email.charAt(0).toUpperCase() : "M"}
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid - Stark & Clean */}
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            [
              "藏帖作品",
              stats.collection_count,
              "卷",
            ],
            [
              "錄入字圖",
              stats.glyph_count,
              "幀",
            ],
            [
              "布施公開",
              stats.public_glyph_count,
              "幀",
            ],
            [
              "共賞按讚",
              stats.received_like_count,
              "回",
            ],
          ].map(([label, value, unit], i) => (
            <div
              key={i}
              className="group flex flex-col justify-between border border-stone-200 bg-white p-6 transition-all hover:border-stone-400"
            >
              <div className="font-serif text-sm font-medium tracking-widest text-stone-400 group-hover:text-red-800 transition-colors">
                {label}
              </div>
              <div className="mt-8 flex items-baseline gap-2">
                <span className="font-serif text-4xl sm:text-5xl font-light tracking-tighter text-stone-900">
                  {value}
                </span>
                <span className="font-serif text-sm font-medium text-stone-400">
                  {unit}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-3 sm:px-4">
        <PersonalPageTabs
          collectionsContent={
            <div>
              <div className="mb-4">
                <p className="font-serif text-sm tracking-widest text-stone-500">
                  案頭近期收錄之六卷集字。
                </p>
              </div>
              {collections.length === 0 ? (
                <div className="rounded-sm border border-dashed border-stone-300 p-8 text-center font-serif text-sm tracking-widest text-stone-500 bg-[#fdfbf7]">
                  書案清空，尚無集字之作。
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {collections.map((collection) => {
                    const items = itemsByCollection[collection.id] ?? [];
                    return (
                      <div
                        key={collection.id}
                        className="rounded-sm border border-stone-200 bg-[#fdfbf7] p-4 shadow-sm transition-shadow hover:shadow-md"
                      >
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="line-clamp-1 font-serif text-lg font-bold tracking-wider text-stone-800">
                              {collection.title || "無名殘卷"}
                            </h3>
                            <p className="mt-1 font-serif text-xs tracking-widest text-stone-500">
                              {collection.created_at} ｜ {collection.item_count}{" "}
                              字
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Link
                              href={`/collections/${collection.id}`}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-red-800 transition-colors hover:bg-red-50 hover:text-red-900 focus:outline-none focus:ring-2 focus:ring-red-800"
                              aria-label={`閱覽 ${collection.title || "無名殘卷"}`}
                              title="閱覽全卷"
                            >
                              <BookOpen className="h-5 w-5" />
                            </Link>
                            <DeleteCollectionButton id={collection.id} />
                          </div>
                        </div>
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
                    );
                  })}
                </div>
              )}
            </div>
          }
          glyphsContent={
            <div>
              <div className="mb-4">
                <p className="font-serif text-sm tracking-widest text-stone-500">
                  檢視所錄字圖，可切換公開布施或私人典藏，亦可見賞閱與集字之數。
                </p>
              </div>
              <PersonalGlyphManager
                initialGlyphs={personalGlyphs}
                initialHasMore={glyphRows.length === 24}
              />
            </div>
          }
        />
      </section>
    </main>
  );
}
