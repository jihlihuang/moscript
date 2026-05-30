import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, Library, PencilLine } from "lucide-react";
import { getCurrentUser, isAdminAllowed } from "@/lib/auth";
import { canAccessGlyph, glyphImageUrlForAccess } from "@/lib/glyph-access";
import { getDb, type GlyphRow, type GlyphSetRow } from "@/lib/db";
import { glyphStatsJoinSql, glyphStatsSelectSql } from "@/lib/glyph-stats";
import { GlyphLikeButton } from "@/components/GlyphLikeButton";
import { LogoMark } from "@/components/LogoMark";

type Params = {
  params: Promise<{ id: string }>;
};

type RelatedCollection = {
  id: number;
  title: string;
  text: string;
  created_at: string;
};

type GlyphWithStats = GlyphRow & {
  like_count: number;
  collection_count: number;
  liked_by_me: number;
};

export default async function GlyphDetailPage({ params }: Params) {
  const user = await getCurrentUser();
  const { id } = await params;
  const db = await getDb();
  const glyph = db.prepare(`
    SELECT g.*, ${glyphStatsSelectSql()}
    FROM glyphs g
    ${glyphStatsJoinSql("g")}
    WHERE g.id = ?
  `).get(user?.id ?? "", id) as GlyphWithStats | undefined;

  if (!glyph || !canAccessGlyph(glyph, user)) notFound();

  const imageUrl = glyphImageUrlForAccess(glyph, "image") ?? glyph.image_url;

  // 字組資訊
  type SetSibling = Pick<GlyphRow, "id" | "char" | "thumbnail_url" | "image_url" | "visibility" | "owner_user_id">;
  let glyphSet: (GlyphSetRow & { sourceUrl: string | null; siblings: SetSibling[] }) | null = null;
  if (glyph.set_id) {
    const set = db.prepare("SELECT * FROM glyph_sets WHERE id = ?").get(glyph.set_id) as GlyphSetRow | undefined;
    if (set) {
      const siblings = db.prepare(`
        SELECT id, char, thumbnail_url, image_url, visibility, owner_user_id
        FROM glyphs WHERE set_id = ? AND id != ?
          AND (visibility = 'public' OR owner_user_id = ?)
        ORDER BY id ASC LIMIT 20
      `).all(glyph.set_id, glyph.id, user?.id ?? "") as SetSibling[];
      const isOwner = user && (user.id === set.owner_user_id || isAdminAllowed(user));
      glyphSet = {
        ...set,
        sourceUrl: (isOwner && set.source_image_url) ? `/api/glyph-sets/${glyph.set_id}/source` : null,
        siblings,
      };
    }
  }

  const relatedCollections = db.prepare(`
    SELECT DISTINCT c.id, c.title, c.text, c.created_at
    FROM collections c
    JOIN collection_items ci ON ci.collection_id = c.id
    WHERE ci.glyph_id = ?
    ORDER BY c.created_at DESC
    LIMIT 12
  `).all(id) as RelatedCollection[];

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <LogoMark imageClassName="h-9 w-9 sm:h-12 sm:w-12" />
            <div className="min-w-0">
              <h1 className="truncate font-serif text-xl font-bold sm:text-2xl">字圖詳情</h1>
              <p className="truncate text-xs text-stone-500 sm:text-sm">{glyph.char}｜{glyph.author || "佚名"}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <Link href="/" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-red-800">
              <ArrowLeft className="h-4 w-4" />
              回首頁
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-4 px-3 py-4 sm:px-4 sm:py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-3xl border border-stone-200 bg-white p-4 sm:p-6">
          <div className="flex min-h-[360px] items-center justify-center rounded-2xl bg-stone-50 p-4">
            <Image
              src={imageUrl}
              alt={`${glyph.char}｜${glyph.author || "佚名"}`}
              width={720}
              height={720}
              className="max-h-[72vh] w-auto max-w-full object-contain mix-blend-multiply"
              unoptimized
            />
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-stone-200 bg-white p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="font-serif text-5xl font-bold">{glyph.char}</div>
                <div className="mt-2 text-sm text-stone-500">ID {glyph.id}</div>
              </div>
              {glyph.owner_user_id && (
                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-700">
                  {glyph.visibility === "private" ? "私人字圖" : "個人公開"}
                </span>
              )}
            </div>
            <GlyphLikeButton
              glyphId={glyph.id}
              initialLiked={Boolean(glyph.liked_by_me)}
              initialLikeCount={Number(glyph.like_count ?? 0)}
              initialCollectionCount={Number(glyph.collection_count ?? 0)}
              isAuthenticated={Boolean(user)}
              returnTo={`/glyph/${glyph.id}`}
              className="w-full"
            />
            <dl className="mt-4 grid gap-3 text-sm">
              <div><dt className="font-bold text-stone-500">作者</dt><dd>{glyph.author || "佚名"}</dd></div>
              <div><dt className="font-bold text-stone-500">書體</dt><dd>{glyph.script_type || "未標註"}</dd></div>
              <div><dt className="font-bold text-stone-500">作品</dt><dd>{glyph.work_title || "未標題"}</dd></div>
              <div><dt className="font-bold text-stone-500">來源</dt><dd className="break-words">{glyph.source || "未標註"}</dd></div>
              <div><dt className="font-bold text-stone-500">授權</dt><dd className="break-words">{glyph.license || "未標註"}</dd></div>
              <div><dt className="font-bold text-stone-500">統計</dt><dd>按讚 {glyph.like_count}｜被集字 {glyph.collection_count}</dd></div>
            </dl>
            <div className="mt-4 grid gap-2">
              <Link href={`/?q=${encodeURIComponent(glyph.char)}&addGlyphId=${glyph.id}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-stone-800 px-3 py-2 text-sm font-bold text-white hover:bg-stone-900">
                <BookOpen className="h-4 w-4" />
                加入首頁集字
              </Link>
              <div className="grid grid-cols-2 gap-2">
              <Link href={`/practice/${glyph.id}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-red-800 px-3 py-2 text-sm font-bold text-white hover:bg-red-700">
                <PencilLine className="h-4 w-4" />
                練習
              </Link>
              <Link href={`/?q=${encodeURIComponent(glyph.char)}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-red-800">
                <Library className="h-4 w-4" />
                找同字
              </Link>
              </div>
            </div>
          </div>

          {glyphSet && (
            <div className="rounded-3xl border border-stone-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2 font-bold">
                <Library className="h-4 w-4 text-red-700" />
                同字組的字（{glyphSet.siblings.length + 1} 個字）
              </div>
              {glyphSet.sourceUrl && (
                <a href={glyphSet.sourceUrl} target="_blank" rel="noopener noreferrer" className="mb-3 flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600 hover:border-red-700 hover:text-red-800">
                  <Image src={glyphSet.sourceUrl} alt="字組原圖" width={48} height={48} className="h-12 w-12 rounded-lg object-contain bg-white" unoptimized />
                  <span className="font-medium">查看原圖（ID {glyphSet.id}）</span>
                </a>
              )}
              {glyphSet.siblings.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {glyphSet.siblings.map((s) => {
                    const sUrl = (s.visibility === "private" || !s.image_url.startsWith("/glyphs/"))
                      ? `/api/glyphs/${s.id}/asset?variant=thumbnail`
                      : (s.thumbnail_url || s.image_url);
                    return (
                      <Link key={s.id} href={`/glyph/${s.id}`} className="flex flex-col items-center gap-1 rounded-xl border border-stone-200 bg-stone-50 p-2 text-center hover:border-red-700">
                        <Image src={sUrl} alt={s.char} width={56} height={56} className="h-14 w-14 object-contain mix-blend-multiply" unoptimized />
                        <span className="text-lg font-bold">{s.char}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-stone-500">此字組只有這個字。</p>
              )}
            </div>
          )}

          <div className="rounded-3xl border border-stone-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2 font-bold">
              <BookOpen className="h-4 w-4 text-red-700" />
              出現於集字
            </div>
            {relatedCollections.length > 0 ? (
              <div className="grid gap-2">
                {relatedCollections.map((collection) => (
                  <Link key={collection.id} href={`/collections/${collection.id}`} className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm hover:border-red-700">
                    <div className="font-bold text-stone-900">{collection.title || "未命名集字作品"}</div>
                    <div className="truncate text-stone-500">{collection.text}</div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-stone-500">尚未被任何集字作品收錄。</p>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
