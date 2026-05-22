import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

// Traditional Chinese calligraphy phrases — simplified characters intentionally excluded
const CALLIGRAPHY_PHRASES = [
  "天下第一",
  "山水人家",
  "寧靜致遠",
  "厚德載物",
  "上善若水",
  "自強不息",
  "行雲流水",
  "梅蘭竹菊",
  "春風化雨",
  "歲月靜好",
  "知足常樂",
  "水墨丹青",
  "天高雲淡",
  "風清月朗",
  "萬象更新",
  "竹報平安",
  "書山有路",
  "博學篤行",
  "小橋流水人家",
  "明月幾時有",
  "天清地寧",
  "海納百川",
  "志存高遠",
  "學而不厭",
];

export async function GET() {
  const db = await getDb();

  const charRows = db.prepare(`
    SELECT DISTINCT char
    FROM glyphs
    WHERE owner_user_id IS NULL
  `).all() as { char: string }[];

  const available = new Set(charRows.map((r) => r.char));

  const suggestions = CALLIGRAPHY_PHRASES.filter((phrase) =>
    Array.from(phrase).every((char) => available.has(char))
  );

  return NextResponse.json({ suggestions });
}
