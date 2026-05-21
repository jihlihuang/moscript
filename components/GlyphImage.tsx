import Image from "next/image";

export type GlyphLike = {
  id: number;
  char: string;
  imageUrl: string;
  thumbnailUrl?: string | null;
  author?: string | null;
  scriptType?: string | null;
  workTitle?: string | null;
};

export function GlyphImage({
  glyph,
  size = 96,
  containerClassName,
}: {
  glyph: GlyphLike;
  size?: number;
  containerClassName?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-white ${containerClassName ?? ""}`}
      style={containerClassName ? undefined : { width: size, height: size }}
    >
      <Image
        src={glyph.thumbnailUrl || glyph.imageUrl}
        alt={`${glyph.char}｜${glyph.author ?? "佚名"}`}
        width={size}
        height={size}
        className="h-full w-full object-contain p-2"
        unoptimized
      />
    </div>
  );
}
