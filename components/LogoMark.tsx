"use client";

type LogoMarkProps = {
  onClick?: () => void;
  title?: string;
  className?: string;
  imageClassName?: string;
  showAllMobile?: boolean;
};

const logoGlyphs = [
  {
    char: "墨",
    src: "/glyphs/%E5%A2%A8/%E7%8E%8B%E9%90%B8_%E8%A1%8C_%E7%8E%8B%E9%90%B8%20%E8%A1%8C%E6%9B%B8_0001.gif",
  },
  {
    char: "跡",
    src: "/glyphs/%E8%BF%B9/%E7%8E%8B%E9%90%B8_%E8%A1%8C_%E7%8E%8B%E9%90%B8%20%E8%A1%8C%E6%9B%B8_0001.gif",
  },
  {
    char: "字",
    src: "/glyphs/%E5%AD%97/%E7%8E%8B%E5%A3%AF%E7%82%BA_%E8%A1%8C_%E7%8E%8B%E5%A3%AF%E7%82%BA%20%E8%A1%8C%E6%9B%B8_0004.gif",
  },
  {
    char: "帖",
    src: "/glyphs/%E5%B8%96/%E7%8E%8B%E5%A3%AF%E7%82%BA_%E8%A1%8C_%E7%8E%8B%E5%A3%AF%E7%82%BA%20%E8%A1%8C%E6%9B%B8_0002.gif",
  },
];

export function LogoMark({ onClick, title, className = "", imageClassName = "h-12 w-12", showAllMobile = false }: LogoMarkProps) {
  return (
    <div
      className={`flex items-center -ml-2 select-none ${onClick ? "cursor-pointer" : ""} ${className}`}
      onClick={onClick}
      title={title}
      aria-label="墨跡字帖"
    >
      {logoGlyphs.map((glyph, index) => (
        <img
          key={glyph.char}
          src={glyph.src}
          alt={glyph.char}
          className={`${imageClassName} object-contain mix-blend-multiply pointer-events-none${!showAllMobile && index >= 2 ? " hidden sm:block" : ""}`}
        />
      ))}
    </div>
  );
}
