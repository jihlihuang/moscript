import Image from "next/image";

export type GlyphLike = {
  id: number;
  char: string;
  imageUrl: string;
  author?: string | null;
  scriptType?: string | null;
  workTitle?: string | null;
};

export function GlyphImage({ glyph, size = 96 }: { glyph: GlyphLike; size?: number }) {
  return (
    <div
      className="flex items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-white"
      style={{ width: size, height: size }}
    >
      <Image
        src={glyph.imageUrl}
        alt={`${glyph.char}｜${glyph.author ?? "佚名"}`}
        width={size}
        height={size}
        className="h-full w-full object-contain p-2"
        unoptimized
      />
    </div>
  );
}
