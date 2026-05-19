"use client";

type LogoMarkProps = {
  onClick?: () => void;
  title?: string;
  className?: string;
  imageClassName?: string;
};

export function LogoMark({ onClick, title, className = "", imageClassName = "h-12 w-12" }: LogoMarkProps) {
  return (
    <div
      className={`flex items-center -ml-2 select-none ${onClick ? "cursor-pointer" : ""} ${className}`}
      onClick={onClick}
      title={title}
      aria-label="墨跡"
    >
      <img
        src="/glyphs/%E5%A2%A8/%E7%8E%8B%E9%90%B8_%E8%A1%8C_%E7%8E%8B%E9%90%B8%20%E8%A1%8C%E6%9B%B8_0001.gif"
        alt="墨"
        className={`${imageClassName} object-contain mix-blend-multiply pointer-events-none`}
      />
      <img
        src="/glyphs/%E8%BF%B9/%E7%8E%8B%E9%90%B8_%E8%A1%8C_%E7%8E%8B%E9%90%B8%20%E8%A1%8C%E6%9B%B8_0001.gif"
        alt="跡"
        className={`${imageClassName} object-contain mix-blend-multiply pointer-events-none`}
      />
    </div>
  );
}
