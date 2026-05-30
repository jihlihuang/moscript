# T02 — collections（集字作品表）

> 資料庫類型：SQLite
> 定義位置：`lib/db.ts` → `initSchema()`

---

## 1. 資料表說明

儲存使用者建立的集字作品。每件作品包含標題、集字文字、顯示方向、可見性設定，以及建立者資訊。實際選用的字圖透過 `collection_items` 關聯表儲存。

---

## 2. 欄位定義

| 欄位名稱 | 中文名稱 | 資料類型 | 必填 | 預設值 | 說明 |
|---|---|---|---|---|---|
| `id` | 作品 ID | INTEGER | 是 | AUTO | 自動遞增主鍵 |
| `user_id` | 建立者使用者 ID | TEXT | 否 | NULL | 建立者的 Google ID（對應 users.id） |
| `user_email` | 建立者 Email | TEXT | 否 | NULL | 建立者的 Email（非正規化，方便查詢） |
| `user_name` | 建立者名稱 | TEXT | 否 | NULL | 建立者的顯示名稱（非正規化） |
| `title` | 作品標題 | TEXT | 是 | — | 集字作品的名稱 |
| `text` | 集字文字 | TEXT | 是 | — | 此作品包含的所有中文字（如：「山水」） |
| `display_direction` | 顯示方向 | TEXT | 是 | `'horizontal'` | 字圖排列方向（`horizontal` / `vertical`） |
| `visibility` | 可見性 | TEXT | 是 | `'public'` | 可見性設定（`public` / `private`） |
| `source_set_id` | 來源字組 ID | INTEGER | 否 | NULL | 集字來源的字組 ID（`glyph_sets.id`），從字組直接集字時填入 |
| `source_set_name` | 來源字組名稱 | TEXT | 否 | NULL | 非正規化的來源字組名稱，方便顯示用 |
| `created_at` | 建立時間 | TEXT | 是 | CURRENT_TIMESTAMP | ISO 8601 格式時間戳 |

---

## 3. display_direction 欄位可選值

| 值 | 中文名稱 | 說明 |
|---|---|---|
| `horizontal` | 橫排 | 字圖由左至右水平排列 |
| `vertical` | 直排 | 字圖由上至下垂直排列（傳統書法格式） |

---

## 4. visibility 欄位可選值

| 值 | 中文名稱 | 存取限制 |
|---|---|---|
| `public` | 公開 | 所有人可瀏覽 |
| `private` | 私密 | 僅建立者可瀏覽 |

---

## 5. 索引

| 索引名稱 | 欄位 | 用途 |
|---|---|---|
| `idx_collections_user_id` | `user_id` | 查詢特定使用者的所有作品 |
| `idx_collections_visibility` | `visibility` | 篩選公開作品（用於公開作品列表） |

---

## 6. 主鍵與約束

| 約束類型 | 欄位 | 說明 |
|---|---|---|
| PRIMARY KEY | `id` | 自動遞增整數主鍵 |
| NOT NULL | `title`, `text` | 必填欄位 |

---

## 7. 關聯關係

| 關係類型 | 目標表 | 說明 |
|---|---|---|
| 外鍵（非強制） | `users.id` | `user_id` 對應使用者，但無 FK 約束（允許匿名作品） |
| 一對多 | `collection_items` | 一件作品包含多個集字項目 |

---

## 8. 資料遷移歷史

此表在初始版本後陸續新增以下欄位（透過 `ALTER TABLE`）：

| 新增欄位 | 說明 |
|---|---|
| `user_id` | 初版未記錄建立者 |
| `user_email` | 初版未記錄建立者 |
| `user_name` | 初版未記錄建立者 |
| `display_direction` | 初版未支援直排 |
| `visibility` | 初版所有作品均公開 |
| `source_set_id` | 新增字組來源追蹤 |
| `source_set_name` | 非正規化名稱，方便顯示 |

---

## 9. 建立 SQL

```sql
CREATE TABLE IF NOT EXISTS collections (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           TEXT,
  user_email        TEXT,
  user_name         TEXT,
  title             TEXT NOT NULL,
  text              TEXT NOT NULL,
  display_direction TEXT DEFAULT 'horizontal',
  visibility        TEXT DEFAULT 'public',
  created_at        TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_collections_user_id    ON collections(user_id);
CREATE INDEX IF NOT EXISTS idx_collections_visibility ON collections(visibility);
```

---

## 10. 相關功能

- [F03-集字作品.md](../features/F03-集字作品.md) — 集字作品 CRUD 功能
