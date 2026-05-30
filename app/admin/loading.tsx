import { Database, RefreshCw } from "lucide-react";
import { LogoMark } from "@/components/LogoMark";

export default function AdminLoading() {
  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex items-center gap-3">
            <LogoMark imageClassName="h-9 w-9 sm:h-12 sm:w-12" />
            <div className="min-w-0">
              <h1 className="truncate font-serif text-xl font-bold sm:text-2xl">後台管理</h1>
              <p className="truncate text-xs text-stone-500 sm:text-sm">管理字圖資料、手動上傳、檢查資料庫數量</p>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-4 px-3 py-4 sm:px-4 sm:py-6 lg:grid-cols-[360px_1fr] lg:gap-6">
        <aside className="space-y-4 sm:space-y-6">
          <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:rounded-3xl sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold sm:text-xl">資料庫狀態</h2>
              <RefreshCw className="h-4 w-4 animate-spin text-stone-500" />
            </div>
            <div className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-3">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className={`${item === 3 ? "col-span-3 lg:col-span-1" : ""} h-20 animate-pulse rounded-2xl bg-stone-100`} />
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:rounded-3xl sm:p-5">
            <div className="mb-4 h-7 w-40 animate-pulse rounded-lg bg-stone-100" />
            <div className="space-y-3">
              {[0, 1, 2, 3, 4, 5].map((item) => (
                <div key={item} className="h-10 animate-pulse rounded-xl bg-stone-100" />
              ))}
            </div>
          </section>
        </aside>

        <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:rounded-3xl sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <Database className="h-5 w-5 text-red-600" />
            <h2 className="text-lg font-bold sm:text-xl">字庫查詢</h2>
          </div>
          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_180px_auto_auto]">
            <div className="h-11 animate-pulse rounded-xl bg-stone-100 sm:h-10" />
            <div className="h-11 animate-pulse rounded-xl bg-stone-100 sm:h-10" />
            <div className="h-11 animate-pulse rounded-xl bg-stone-100 sm:h-10" />
            <div className="h-11 animate-pulse rounded-xl bg-stone-100 sm:h-10" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-5">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((item) => (
              <div key={item} className="h-40 animate-pulse rounded-2xl bg-stone-100 sm:h-48" />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
