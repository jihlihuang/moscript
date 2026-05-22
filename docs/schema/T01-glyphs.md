# T01 — glyphs（字圖表）

> 資料庫類型：SQLite
> 定義位置：`lib/db.ts` → `initSchema()`

---

## 1. 資料表說明

儲存所有書法字圖的元資料，包含系統書庫字圖（`owner_user_id IS NULL`）與使用者個人上傳字圖（`owner_user_id IS NOT NULL`）。實體圖片檔案儲存於本機檔案系統或 Azure Blob Storage，此表僅記錄 URL 路徑。

---

## 2. 欄位定義

| 欄位名稱 | 中文名稱 | 資料類型 | 必填 | 預設值 | 說明 |
|---------|---------|---------|------|--------|------|
| `id` | 字圖 ID | INTEGER | 是 | AUTO | 自動遞增主鍵 |
| `char` | 中文字 | TEXT | 是 | — | 該字圖代表的單一中文字元（CJK 字元） |
| `author` | 書寫者 | TEXT | 否 | NULL | 書法家姓名（如：王羲之、顏真卿） |
| `script_type` | 書體 | TEXT | 否 | NULL | 書體類型（草、行、隸、楷、篆、魏、其他） |
| `work_title` | 作品名稱 | TEXT | 否 | NULL | 字圖來源的書法作品名稱（如：蘭亭集序） |
| `image_url` | 圖片 URL | TEXT | 是 | — | 完整圖片路徑（唯一值），公開字圖為相對路徑，私密字圖為 API 路徑 |
| `thumbnail_url` | 縮圖 URL | TEXT | 否 | NULL | 縮圖路徑（用於列表預覽加速載入） |
| `source` | 來源 | TEXT | 否 | NULL | 資料來源標記（見下方說明） |
| `license` | 授權類型 | TEXT | 否 | NULL | 圖片授權（如：non-commercial-research） |
| `quality_score` | 品質分數 | INTEGER | 是 | 0 | 管理員評分（0~10），影響搜尋排序 |
| `owner_user_id` | 所有者使用者 ID | TEXT | 否 | NULL | 上傳者的 Google ID；NULL 代表系統書庫字圖 |
| `owner_user_email` | 所有者 Email | TEXT | 否 | NULL | 上傳者的 Email（非正規化，方便查詢） |
| `owner_user_name` | 所有者名稱 | TEXT | 否 | NULL | 上傳者的顯示名稱（非正規化） |
| `visibility` | 可見性 | TEXT | 是 | `'public'` | 可見性設定（`public` / `private`） |
| `created_at` | 建立時間 | TEXT | 是 | CURRENT_TIMESTAMP | ISO 8601 格式時間戳 |

---

## 3. 虛擬欄位（查詢時計算，非資料表欄位）

| 虛擬欄位 | 中文名稱 | 計算方式 | 說明 |
|---------|---------|---------|------|
| `like_count` | 按讚數 | `COUNT(*) FROM glyph_likes WHERE glyph_id = id` | 被按讚次數 |
| `collection_count` | 集字次數 | `COUNT(*) FROM collection_items WHERE glyph_id = id` | 被加入集字作品的次數 |
| `liked_by_me` | 我是否已按讚 | `EXISTS (... WHERE glyph_id = id AND user_id = ?)` | 當前使用者是否已按讚（0/1） |

---

## 4. source 欄位可選值

| 值 | 說明 |
|-----|------|
| `manual` | 管理員手動新增（系統書庫） |
| `import` | 管理員批量匯入（系統書庫） |
| `personal-upload` | 一般使用者上傳的個人字圖 |
| NULL | 未知來源（早期資料） |

---

## 5. 索引

| 索引名稱 | 欄位 | 用途 |
|---------|------|------|
| `idx_glyphs_char` | `char` | 按中文字查詢 |
| `idx_glyphs_author` | `author` | 按書家查詢 |
| `idx_glyphs_script_type` | `script_type` | 按書體篩選 |
| `idx_glyphs_char_script` | `(char, script_type)` | 字＋書體複合查詢（最常用） |
| `idx_glyphs_owner_user_id` | `owner_user_id` | 查詢個人上傳字圖 |
| `idx_glyphs_visibility` | `visibility` | 篩選公開/私密 |

---

## 6. 主鍵與約束

| 約束類型 | 欄位 | 說明 |
|---------|------|------|
| PRIMARY KEY | `id` | 自動遞增整數主鍵 |
| UNIQUE | `image_url` | 同一圖片 URL 不可重複新增 |
| NOT NULL | `char`, `image_url` | 必填欄位 |

---

## 7. 外鍵參照（被參照）

此表被以下資料表參照：

| 參照表 | 參照欄位 | 刪除行為 |
|--------|---------|---------|
| `glyph_likes` | `glyph_id → glyphs.id` | CASCADE（字圖刪除，按讚記錄一起刪除） |
| `collection_items` | `glyph_id → glyphs.id` | CASCADE（字圖刪除，集字項目一起刪除） |

---

## 8. 建立 SQL

```sql
CREATE TABLE IF NOT EXISTS glyphs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  char            TEXT    NOT NULL,
  author          TEXT,
  script_type     TEXT,
  work_title      TEXT,
  image_url       TEXT    NOT NULL UNIQUE,
  thumbnail_url   TEXT,
  source          TEXT,
  license         TEXT,
  quality_score   INTEGER DEFAULT 0,
  owner_user_id   TEXT,
  owner_user_email  TEXT,
  owner_user_name   TEXT,
  visibility      TEXT    DEFAULT 'public',
  created_at      TEXT    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_glyphs_char          ON glyphs(char);
CREATE INDEX IF NOT EXISTS idx_glyphs_author        ON glyphs(author);
CREATE INDEX IF NOT EXISTS idx_glyphs_script_type   ON glyphs(script_type);
CREATE INDEX IF NOT EXISTS idx_glyphs_char_script   ON glyphs(char, script_type);
CREATE INDEX IF NOT EXISTS idx_glyphs_owner_user_id ON glyphs(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_glyphs_visibility    ON glyphs(visibility);
```

---

## 9. 相關功能

- [F02-字圖搜尋.md](../features/F02-字圖搜尋.md) — 主要查詢來源
- [F04-字圖上傳.md](../features/F04-字圖上傳.md) — 新增字圖記錄
- [F05-個人字圖管理.md](../features/F05-個人字圖管理.md) — 個人字圖 CRUD
- [F07-按讚功能.md](../features/F07-按讚功能.md) — 被按讚的對象
- [F08-後台管理.md](../features/F08-後台管理.md) — 管理員字圖操作
