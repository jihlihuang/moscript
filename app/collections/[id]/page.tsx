import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { DeleteCollectionButton } from "@/components/DeleteCollectionButton";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { LogoMark } from "@/components/LogoMark";
import { CollectionGlyphDisplay } from "@/components/CollectionGlyphDisplay";
import { glyphImageUrlForAccess } from "@/lib/glyph-access";
import { glyphStatsJoinSql, glyphStatsSelectSql } from "@/lib/glyph-stats";
import { headers } from "next/headers";

type Params = {
  params: Promise<{ id: string }>;
};

type Collection = {
  id: number;
  user_id: string | null;
  title: string;
  text: string;
  display_direction: "horizontal" | "vertical" | null;
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
  thumbnail_url: string | null;
  owner_user_id: string | null;
  visibility: string | null;
  source: string | null;
  license: string | null;
  like_count: number;
  collection_count: number;
  liked_by_me: number;
};

export default async function CollectionPage({ params }: Params) {
  const user = await getCurrentUser();

  const { id } = await params;
  const db = await getDb();

  const collection = db.prepare(`
    SELECT id, user_id, title, text, display_direction, created_at
    FROM collections
    WHERE id = ?
  `).get(id) as Collection | undefined;

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
      g.thumbnail_url,
      g.owner_user_id,
      g.visibility,
      g.source,
      g.license,
      ${glyphStatsSelectSql()}
    FROM collection_items ci
    JOIN glyphs g ON g.id = ci.glyph_id
    ${glyphStatsJoinSql("g")}
    WHERE ci.collection_id = ?
    ORDER BY ci.position ASC
  `).all(user?.id ?? "", id) as Item[];
  const securedItems = items.map((item) => ({
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

  const headersList = await headers();
  const host = headersList.get("host") || "";
  const protocol = headersList.get("x-forwarded-proto") || "http";
  const fullUrl = `${protocol}://${host}/collections/${collection.id}`;

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <LogoMark imageClassName="h-10 w-10 sm:h-12 sm:w-12" />
              <div className="min-w-0">
                <h1 className="line-clamp-1 font-serif text-xl font-bold sm:text-2xl">{collection.title}</h1>
                <p className="text-xs text-stone-500 sm:text-sm">集字作品｜{collection.created_at}</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
            <CopyLinkButton url={fullUrl} />
            <Link href={`/?collectionId=${collection.id}`} className="col-span-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-stone-800 px-4 py-2 text-sm font-bold text-white transition hover:bg-stone-900 sm:col-span-1">
              <Search className="h-4 w-4" />
              載入到首頁
            </Link>
            {user?.id === collection.user_id && (
              <>
                <DeleteCollectionButton id={collection.id} redirectOnSuccess={true} redirectTo="/collections" />
                <Link href="/collections" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-stone-100 px-4 py-2 text-sm font-bold text-stone-800 transition hover:bg-stone-200">
                  <ArrowLeft className="h-4 w-4" />
                  回集字列表
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-8">
        <div className="rounded-2xl border border-stone-200 bg-white p-3 sm:rounded-3xl sm:p-6">
          <CollectionGlyphDisplay
            collectionId={collection.id}
            initialDirection={collection.display_direction === "vertical" ? "vertical" : "horizontal"}
            items={securedItems}
            isAuthenticated={Boolean(user)}
            likeReturnTo={`/collections/${collection.id}`}
          />

          <div className="mt-4 grid gap-2 sm:mt-6 sm:gap-3 md:grid-cols-2 lg:grid-cols-3">
            {securedItems.map((item) => (
              <div key={`${item.position}-meta`} className="rounded-2xl bg-stone-50 p-3 text-sm text-stone-600 sm:p-4">
                <div className="mb-1 font-serif text-base font-bold text-stone-900 sm:text-lg">{item.char}</div>
                <div>作者：{item.author || "佚名"}</div>
                <div>書體：{item.script_type || "未標註"}</div>
                <div>作品：{item.work_title || "未標題"}</div>
                <div>讚：{item.like_count}｜集字：{item.collection_count}</div>
                <div className="truncate text-stone-500">來源：{item.source || "未標註"}</div>
                <div className="truncate text-stone-500">授權：{item.license || "未標註"}</div>
                <Link href={`/glyph/${item.glyph_id}`} className="mt-2 inline-flex rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-red-800">
                  字圖詳情
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
