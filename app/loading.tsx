import { LogoMark } from "@/components/LogoMark";

export default function Loading() {
  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <LogoMark />
            <h1 className="font-serif text-2xl font-bold">墨跡字帖</h1>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <div className="h-10 w-24 animate-pulse rounded-xl bg-stone-100" />
            <div className="h-10 w-24 animate-pulse rounded-xl bg-stone-100" />
          </div>
        </div>
      </header>

      <section className="mx-auto flex min-h-[60vh] max-w-7xl items-center justify-center px-4 py-12">
        <div className="flex flex-col items-center">
          <div className="flex animate-pulse items-center gap-2 opacity-80">
            <img src="/glyphs/%E5%A2%A8/%E7%8E%8B%E9%90%B8_%E8%A1%8C_%E7%8E%8B%E9%90%B8%20%E8%A1%8C%E6%9B%B8_0001.gif" alt="墨" className="h-20 w-20 object-contain mix-blend-multiply" />
            <img src="/glyphs/%E8%BF%B9/%E7%8E%8B%E9%90%B8_%E8%A1%8C_%E7%8E%8B%E9%90%B8%20%E8%A1%8C%E6%9B%B8_0001.gif" alt="跡" className="h-20 w-20 object-contain mix-blend-multiply" />
            <img src="/glyphs/%E5%AD%97/%E7%8E%8B%E5%A3%AF%E7%82%BA_%E8%A1%8C_%E7%8E%8B%E5%A3%AF%E7%82%BA%20%E8%A1%8C%E6%9B%B8_0004.gif" alt="字" className="h-20 w-20 object-contain mix-blend-multiply" />
            <img src="/glyphs/%E5%B8%96/%E7%8E%8B%E5%A3%AF%E7%82%BA_%E8%A1%8C_%E7%8E%8B%E5%A3%AF%E7%82%BA%20%E8%A1%8C%E6%9B%B8_0002.gif" alt="帖" className="h-20 w-20 object-contain mix-blend-multiply" />
          </div>
          <p className="mt-4 font-serif text-lg font-bold text-stone-600">載入中...</p>
        </div>
      </section>
    </main>
  );
}
