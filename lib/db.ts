import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { getBlobClient, hasBlobConfig, uploadFileToBlob } from "@/lib/blob-storage";

const dbDir = process.env.MOSCRIPT_DATA_DIR || path.join(process.cwd(), "data");
const dbPath = path.join(dbDir, "moscript.sqlite");
const dbBlobName = process.env.MOSCRIPT_DB_BLOB_NAME || "data/moscript.sqlite";

let cachedDb: Database.Database | null = null;
let initPromise: Promise<void> | null = null;

export type GlyphRow = {
  id: number;
  char: string;
  author: string | null;
  script_type: string | null;
  work_title: string | null;
  image_url: string;
  source: string | null;
  license: string | null;
  quality_score: number;
  created_at: string;
};

async function initDbFile() {
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (hasBlobConfig() && !fs.existsSync(dbPath)) {
    try {
      await getBlobClient(dbBlobName).downloadToFile(dbPath);
    } catch (error) {
      const statusCode = typeof error === "object" && error && "statusCode" in error
        ? (error as { statusCode?: number }).statusCode
        : undefined;
      if (statusCode === 404) {
        throw new Error(`SQLite database blob not found: ${dbBlobName}`);
      }
      throw error;
    }
  }
}

export async function getDb() {
  initPromise ??= initDbFile();
  await initPromise;

  if (!cachedDb) {
    cachedDb = new Database(dbPath);
    cachedDb.pragma("journal_mode = WAL");
    cachedDb.pragma("foreign_keys = ON");
    initSchema(cachedDb);
  }

  return cachedDb;
}

export async function syncDbToBlob() {
  if (!hasBlobConfig() || !cachedDb) return;
  cachedDb.pragma("wal_checkpoint(TRUNCATE)");
  await uploadFileToBlob(dbPath, dbBlobName, "application/vnd.sqlite3");
}

export function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS glyphs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      char TEXT NOT NULL,
      author TEXT,
      script_type TEXT,
      work_title TEXT,
      image_url TEXT NOT NULL UNIQUE,
      source TEXT,
      license TEXT,
      quality_score INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_glyphs_char ON glyphs(char);
    CREATE INDEX IF NOT EXISTS idx_glyphs_author ON glyphs(author);
    CREATE INDEX IF NOT EXISTS idx_glyphs_script_type ON glyphs(script_type);
    CREATE INDEX IF NOT EXISTS idx_glyphs_char_script ON glyphs(char, script_type);

    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS collection_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id INTEGER NOT NULL,
      glyph_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      char TEXT NOT NULL,
      FOREIGN KEY(collection_id) REFERENCES collections(id) ON DELETE CASCADE,
      FOREIGN KEY(glyph_id) REFERENCES glyphs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_collection_items_collection_id ON collection_items(collection_id);
  `);
}
