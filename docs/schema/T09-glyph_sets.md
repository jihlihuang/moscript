# T09 — glyph_sets（字組表）

> 資料庫類型：SQLite
> 定義位置：`lib/db.ts` → `initSchema()`

---

## 1. 資料表說明

儲存多字拆圖上傳時建立的字組（Glyph Set）。一個字組代表從同一張原稿圖拆分出的一組字圖，可附帶拆字前的原圖與名稱。字組名稱預設為批次上傳字元的合集（如「小橋流水人家」）。

字組與字圖的關係透過 `glyphs.set_id` 維護（soft reference，無 FK 約束）。

---

## 2. 欄位定義

| 欄位名稱 | 中文名稱 | 資料類型 | 必填 | 預設值 | 說明 |
|---------|---------|---------|------|--------|------|
| `id` | 字組 ID | INTEGER | 是 | AUTO | 自動遞增主鍵 |
| `name` | 字組名稱 | TEXT | 否 | NULL | 批次上傳字元合集，如「小橋流水人家」；管理員可手動編輯 |
| `source_image_url` | 原圖 URL | TEXT | 否 | NULL | 多字拆圖原始圖片的儲存路徑（Blob 或本機） |
| `owner_user_id` | 擁有者 ID | TEXT | 否 | NULL | 建立者的 Google ID；NULL 代表系統書庫字組 |
| `created_at` | 建立時間 | TEXT | 是 | CURRENT_TIMESTAMP | ISO 8601 格式時間戳 |

---

## 3. 索引

| 索引名稱 | 欄位 | 用途 |
|---------|------|------|
| `idx_glyph_sets_owner` | `owner_user_id` | 查詢特定使用者的字組 |
| `idx_glyph_sets_name` | `name` | 依名稱搜尋字組 |

---

## 4. 字組查詢規則

- **一般查詢**：只回傳 `name IS NOT NULL AND name != ''` 的字組（有名稱的才公開可見）
- **管理員查詢**：可查看所有字組（包含無名稱的）

---

## 5. 主鍵與約束

| 約束類型 | 欄位 | 說明 |
|---------|------|------|
| PRIMARY KEY | `id` | 自動遞增整數主鍵 |

---

## 6. 關聯關係

| 關係類型 | 目標表 | 欄位 | 說明 |
|---------|-------|------|------|
| 一對多（被參照） | `glyphs` | `glyphs.set_id → glyph_sets.id` | 一個字組包含多個字圖，無 FK 約束 |
| 一對多（被參照） | `collections` | `collections.source_set_id → glyph_sets.id` | 集字作品可記錄來源字組，無 FK 約束 |

---

## 7. 建立 SQL

```sql
CREATE TABLE IF NOT EXISTS glyph_sets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT,
  source_image_url TEXT,
  owner_user_id    TEXT,
  created_at       TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_glyph_sets_owner ON glyph_sets(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_glyph_sets_name  ON glyph_sets(name);
```

---

## 8. 相關功能

- [F04-字圖上傳.md](../features/F04-字圖上傳.md) — 多字拆圖批次上傳時建立字組
- [F08-後台管理.md](../features/F08-後台管理.md) — 字組管理（查看、命名、刪除）
- [T01-glyphs.md](T01-glyphs.md) — `set_id`、`set_position` 欄位
- [T02-collections.md](T02-collections.md) — `source_set_id`、`source_set_name` 欄位
