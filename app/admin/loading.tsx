import { Database, RefreshCw } from "lucide-react";

export default function AdminLoading() {
  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="font-serif text-2xl font-bold">MoScript 後台</h1>
            <p className="text-sm text-stone-500">管理字圖資料、手動上傳、檢查資料庫數量</p>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-6">
          <section className="rounded-3xl border border-stone-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">資料庫狀態</h2>
              <RefreshCw className="h-4 w-4 animate-spin text-stone-500" />
            </div>
            <div className="grid gap-3">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="h-20 animate-pulse rounded-2xl bg-stone-100" />
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-stone-200 bg-white p-5">
            <div className="mb-4 h-7 w-40 animate-pulse rounded-lg bg-stone-100" />
            <div className="space-y-3">
              {[0, 1, 2, 3, 4, 5].map((item) => (
                <div key={item} className="h-10 animate-pulse rounded-xl bg-stone-100" />
              ))}
            </div>
          </section>
        </aside>

        <section className="rounded-3xl border border-stone-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <Database className="h-5 w-5 text-red-600" />
            <h2 className="text-xl font-bold">字庫查詢</h2>
          </div>
          <div className="mb-4 grid gap-2 lg:grid-cols-[1fr_180px_auto_auto]">
            <div className="h-10 animate-pulse rounded-xl bg-stone-100" />
            <div className="h-10 animate-pulse rounded-xl bg-stone-100" />
            <div className="h-10 animate-pulse rounded-xl bg-stone-100" />
            <div className="h-10 animate-pulse rounded-xl bg-stone-100" />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((item) => (
              <div key={item} className="h-48 animate-pulse rounded-2xl bg-stone-100" />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
