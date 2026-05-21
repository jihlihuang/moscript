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
  owner_user_id: string | null;
  owner_user_email: string | null;
  owner_user_name: string | null;
  visibility: string | null;
  like_count?: number;
  collection_count?: number;
  liked_by_me?: number;
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
      owner_user_id TEXT,
      owner_user_email TEXT,
      owner_user_name TEXT,
      visibility TEXT DEFAULT 'public',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_glyphs_char ON glyphs(char);
    CREATE INDEX IF NOT EXISTS idx_glyphs_author ON glyphs(author);
    CREATE INDEX IF NOT EXISTS idx_glyphs_script_type ON glyphs(script_type);
    CREATE INDEX IF NOT EXISTS idx_glyphs_char_script ON glyphs(char, script_type);

    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      user_email TEXT,
      user_name TEXT,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      display_direction TEXT DEFAULT 'horizontal',
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
    CREATE INDEX IF NOT EXISTS idx_collection_items_glyph_id ON collection_items(glyph_id);

    CREATE TABLE IF NOT EXISTS glyph_likes (
      glyph_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      user_email TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (glyph_id, user_id),
      FOREIGN KEY(glyph_id) REFERENCES glyphs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_glyph_likes_glyph_id ON glyph_likes(glyph_id);
    CREATE INDEX IF NOT EXISTS idx_glyph_likes_user_id ON glyph_likes(user_id);

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      picture TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      user_email TEXT NOT NULL,
      user_name TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      details TEXT,
      ip TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_user_id ON admin_audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON admin_audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at);
  `);

  const collectionColumns = db.prepare("PRAGMA table_info(collections)").all() as { name: string }[];
  const collectionColumnNames = new Set(collectionColumns.map((column) => column.name));
  if (!collectionColumnNames.has("user_id")) {
    db.prepare("ALTER TABLE collections ADD COLUMN user_id TEXT").run();
  }
  if (!collectionColumnNames.has("user_email")) {
    db.prepare("ALTER TABLE collections ADD COLUMN user_email TEXT").run();
  }
  if (!collectionColumnNames.has("user_name")) {
    db.prepare("ALTER TABLE collections ADD COLUMN user_name TEXT").run();
  }
  if (!collectionColumnNames.has("display_direction")) {
    db.prepare("ALTER TABLE collections ADD COLUMN display_direction TEXT DEFAULT 'horizontal'").run();
  }
  db.prepare("CREATE INDEX IF NOT EXISTS idx_collections_user_id ON collections(user_id)").run();

  const glyphColumns = db.prepare("PRAGMA table_info(glyphs)").all() as { name: string }[];
  const glyphColumnNames = new Set(glyphColumns.map((column) => column.name));
  if (!glyphColumnNames.has("owner_user_id")) {
    db.prepare("ALTER TABLE glyphs ADD COLUMN owner_user_id TEXT").run();
  }
  if (!glyphColumnNames.has("owner_user_email")) {
    db.prepare("ALTER TABLE glyphs ADD COLUMN owner_user_email TEXT").run();
  }
  if (!glyphColumnNames.has("owner_user_name")) {
    db.prepare("ALTER TABLE glyphs ADD COLUMN owner_user_name TEXT").run();
  }
  if (!glyphColumnNames.has("visibility")) {
    db.prepare("ALTER TABLE glyphs ADD COLUMN visibility TEXT DEFAULT 'public'").run();
  }
  db.prepare("CREATE INDEX IF NOT EXISTS idx_glyphs_owner_user_id ON glyphs(owner_user_id)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_glyphs_visibility ON glyphs(visibility)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_collection_items_glyph_id ON collection_items(glyph_id)").run();
}
