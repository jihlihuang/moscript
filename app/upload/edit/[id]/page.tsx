import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";
import { AdminGlyphUploadForm, type ReplaceGlyphTarget } from "@/components/AdminGlyphUploadForm";
import { LogoMark } from "@/components/LogoMark";
import { getCurrentUser } from "@/lib/auth";
import { glyphImageUrlForAccess } from "@/lib/glyph-access";
import { getDb } from "@/lib/db";

const commonScriptTypes = ["草", "行", "隸", "楷"];
const unknownScriptLabels = new Set(["未標註", "未知書體"]);
const preferredScriptOrder = ["草", "行", "隸", "楷"];

function isUnknownScriptLabel(label: string) {
  return unknownScriptLabels.has(label.trim());
}

function sortScriptLabels(labels: string[]) {
  function rank(label: string) {
    if (isUnknownScriptLabel(label)) return 999;
    const index = preferredScriptOrder.findIndex((script) => label.includes(script));
    return index >= 0 ? index : 100;
  }

  return [...labels].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "zh-Hant"));
}

async function loadScriptOptions() {
  const db = await getDb();
  const rows = db.prepare(`
    SELECT
      CASE
        WHEN script_type IS NULL OR trim(script_type) = '' THEN '未標註'
        ELSE script_type
      END AS label
    FROM glyphs
    GROUP BY
      CASE
        WHEN script_type IS NULL OR trim(script_type) = '' THEN '未標註'
        ELSE script_type
      END
  `).all() as { label: string }[];

  return sortScriptLabels([
    ...new Set([
      ...commonScriptTypes,
      ...rows.map((row) => row.label).filter(Boolean),
      "未標註",
    ]),
  ]);
}

type Params = {
  params: Promise<{ id: string }>;
};

export default async function EditPersonalGlyphPage({ params }: Params) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!user) {
    redirect(`/api/auth/google?returnTo=${encodeURIComponent(`/upload/edit/${id}`)}`);
  }

  const db = await getDb();
  const glyph = db.prepare(`
    SELECT id, char, author, script_type, work_title, source, license, quality_score, image_url, thumbnail_url, owner_user_id, visibility
    FROM glyphs
    WHERE id = ? AND owner_user_id = ?
  `).get(id, user.id) as
    | {
        id: number;
        char: string;
        author: string | null;
        script_type: string | null;
        work_title: string | null;
        source: string | null;
        license: string | null;
        quality_score: number;
        image_url: string;
        thumbnail_url: string | null;
        owner_user_id: string | null;
        visibility: string | null;
      }
    | undefined;

  if (!glyph) notFound();

  const scriptOptions = await loadScriptOptions();
  const replaceGlyph: ReplaceGlyphTarget = {
    id: glyph.id,
    char: glyph.char,
    author: glyph.author,
    scriptType: glyph.script_type,
    workTitle: glyph.work_title,
    source: glyph.source,
    license: glyph.license,
    qualityScore: glyph.quality_score,
    imageUrl: glyphImageUrlForAccess(glyph, "image") ?? glyph.image_url,
  };

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <LogoMark imageClassName="h-9 w-9 sm:h-12 sm:w-12" />
            <div className="min-w-0">
              <h1 className="truncate font-serif text-xl font-bold sm:text-2xl">編輯個人字圖</h1>
              <p className="truncate text-xs text-stone-500 sm:text-sm">{glyph.char}｜{user.email}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <Link
              href="/me"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-stone-800 px-4 py-2 text-sm font-bold text-white hover:bg-stone-900"
            >
              <ArrowLeft className="h-4 w-4" />
              回個人頁
            </Link>
            <LogoutButton
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-stone-900"
            />
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-6">
        <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-2xl bg-red-50 p-2 text-red-700">
              <Pencil className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold">修改資料或替換圖片</h2>
              <p className="text-sm text-stone-500">不選新圖片時只會更新左側資料；選新圖片時會替換字圖。</p>
            </div>
          </div>
          <AdminGlyphUploadForm
            scriptOptions={scriptOptions}
            uploadEndpoint="/api/glyphs/upload"
            showVisibility
            submitLabel="儲存個人字圖"
            replaceGlyph={replaceGlyph}
          />
        </div>
      </section>
    </main>
  );
}
