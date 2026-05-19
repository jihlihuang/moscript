import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { initSchema } from "../lib/db";

const rootDir = path.join(process.cwd(), "public", "glyphs");
const dbDir = path.join(process.cwd(), "data");
const dbPath = path.join(dbDir, "moscript.sqlite");

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const item of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) files.push(...walk(fullPath));
    else if (/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(item)) files.push(fullPath);
  }
  return files;
}

function normalizeSegment(segment: string) {
  return segment.trim() || null;
}

if (!fs.existsSync(rootDir)) {
  console.error("找不到 public/glyphs 資料夾");
  process.exit(1);
}

fs.mkdirSync(dbDir, { recursive: true });
const db = new Database(dbPath);
initSchema(db);

const insert = db.prepare(`
  INSERT OR IGNORE INTO glyphs (
    char, author, script_type, work_title, image_url, source, license, quality_score
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const files = walk(rootDir);
let imported = 0;

const transaction = db.transaction(() => {
  for (const file of files) {
    const relativePath = path.relative(rootDir, file);
    const parts = relativePath.split(path.sep);
    const char = parts[0];
    const filename = path.basename(file, path.extname(file));
    const tokens = filename.split("_");

    const author = normalizeSegment(tokens[0] ?? "");
    const scriptType = normalizeSegment(tokens[1] ?? "");
    const workTitle = normalizeSegment(tokens[2] ?? "");
    const imageUrl = "/glyphs/" + relativePath.split(path.sep).map(encodeURIComponent).join("/");

    const result = insert.run(
      char,
      author,
      scriptType,
      workTitle,
      imageUrl,
      "local-dataset",
      "non-commercial-research",
      0
    );

    if (result.changes > 0) imported += 1;
  }
});

transaction();

const count = db.prepare("SELECT COUNT(*) as count FROM glyphs").get() as { count: number };
console.log(`掃描 ${files.length} 個圖片檔，新增 ${imported} 筆，目前資料庫共 ${count.count} 筆。`);
db.close();
