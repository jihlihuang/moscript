import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, LogOut, Upload } from "lucide-react";
import { AdminGlyphUploadForm } from "@/components/AdminGlyphUploadForm";
import { LogoMark } from "@/components/LogoMark";
import { getCurrentUser } from "@/lib/auth";
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

export default async function UploadGlyphPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/api/auth/google?returnTo=${encodeURIComponent("/upload")}`);
  }

  const scriptOptions = await loadScriptOptions();

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <LogoMark imageClassName="h-9 w-9 sm:h-12 sm:w-12" />
            <div className="min-w-0">
              <h1 className="truncate font-serif text-xl font-bold sm:text-2xl">上傳個人字圖</h1>
              <p className="truncate text-xs text-stone-500 sm:text-sm">可選擇公開或私人｜{user.email}</p>
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
            <form action="/api/auth/logout?returnTo=/" method="post">
              <button
                type="submit"
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-stone-900"
              >
                <LogOut className="h-4 w-4" />
                登出
              </button>
            </form>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-6">
        <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-2xl bg-red-50 p-2 text-red-700">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold">個人上傳</h2>
              <p className="text-sm text-stone-500">公開字圖可被所有人搜尋；私人字圖只有你的帳號登入後能查到。</p>
            </div>
          </div>
          <AdminGlyphUploadForm
            scriptOptions={scriptOptions}
            uploadEndpoint="/api/glyphs/upload"
            showVisibility
            submitLabel="上傳個人字圖"
          />
        </div>
      </section>
    </main>
  );
}
