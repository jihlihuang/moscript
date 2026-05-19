import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LogoMark } from "@/components/LogoMark";

export default function CollectionsLoading() {
  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-4">
          <div className="flex items-center gap-3">
            <LogoMark imageClassName="h-10 w-10 sm:h-12 sm:w-12" />
            <div>
              <h1 className="font-serif text-xl font-bold sm:text-2xl">集字作品</h1>
              <p className="text-xs text-stone-500 sm:text-sm">讀取儲存的集字內容</p>
            </div>
          </div>
          <Link href="/" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-stone-800 px-4 py-2 text-sm font-bold text-white">
            <ArrowLeft className="h-4 w-4" />
            回前台
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-8">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="rounded-2xl border border-stone-200 bg-white p-3 sm:p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="h-6 w-36 animate-pulse rounded-lg bg-stone-100" />
                  <div className="h-4 w-28 animate-pulse rounded-lg bg-stone-100" />
                </div>
                <div className="h-5 w-5 animate-pulse rounded bg-stone-100" />
              </div>
              <div className="mb-4 grid min-h-[92px] grid-cols-4 gap-2 rounded-2xl bg-stone-50 p-2 sm:p-3">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((glyph) => (
                  <div key={glyph} className="h-14 animate-pulse rounded-xl bg-white sm:h-16" />
                ))}
              </div>
              <div className="h-5 w-40 animate-pulse rounded-lg bg-stone-100" />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
