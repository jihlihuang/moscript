# T04 — glyph_likes（字圖按讚表）

> 資料庫類型：SQLite
> 定義位置：`lib/db.ts` → `initSchema()`

---

## 1. 資料表說明

記錄使用者對字圖的按讚行為。使用複合主鍵 `(glyph_id, user_id)` 確保同一使用者對同一字圖只能有一筆按讚記錄（不重複按讚）。

---

## 2. 欄位定義

| 欄位名稱 | 中文名稱 | 資料類型 | 必填 | 預設值 | 說明 |
|---|---|---|---|---|---|
| `glyph_id` | 字圖 ID | INTEGER | 是 | — | 被按讚的字圖（複合主鍵之一，外鍵 `glyphs.id`） |
| `user_id` | 使用者 ID | TEXT | 是 | — | 按讚者的 Google ID（複合主鍵之一） |
| `user_email` | 使用者 Email | TEXT | 是 | — | 按讚者的 Email（非正規化，方便查詢） |
| `created_at` | 按讚時間 | TEXT | 是 | CURRENT_TIMESTAMP | ISO 8601 格式時間戳 |

---

## 3. 主鍵設計

使用**複合主鍵** `(glyph_id, user_id)`：

- 同一使用者對同一字圖只能有一筆記錄
- 重複 INSERT 時資料庫會拋出唯一性衝突錯誤
- 應用層透過「先查後寫」或 `INSERT OR IGNORE` 實現按讚/取消按讚切換

---

## 4. 索引

| 索引名稱 | 欄位 | 用途 |
|---|---|---|
| `idx_glyph_likes_glyph_id` | `glyph_id` | 查詢特定字圖的所有按讚（計算按讚數） |
| `idx_glyph_likes_user_id` | `user_id` | 查詢特定使用者按讚過的所有字圖 |

---

## 5. 外鍵關係

| 外鍵欄位 | 參照表 | 參照欄位 | 刪除行為 |
|---|---|---|---|
| `glyph_id` | `glyphs` | `id` | CASCADE（字圖刪除，按讚記錄一起刪除） |

---

## 6. 按讚數統計

`glyph_likes` 是計算字圖「按讚數」的資料來源：

```sql
SELECT glyph_id, COUNT(*) AS like_count
FROM glyph_likes
GROUP BY glyph_id
```

搜尋 API 以 `LEFT JOIN` subquery 即時計算，不進行快取。

---

## 7. 「我是否已按讚」查詢

```sql
SELECT 1
FROM glyph_likes
WHERE glyph_id = ?
  AND user_id  = ?
```

搜尋 API 一併查詢此資訊（`liked_by_me` 欄位），回傳給前端以正確顯示按鈕狀態。

---

## 8. 建立 SQL

```sql
CREATE TABLE IF NOT EXISTS glyph_likes (
  glyph_id   INTEGER NOT NULL,
  user_id    TEXT    NOT NULL,
  user_email TEXT    NOT NULL,
  created_at TEXT    DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (glyph_id, user_id),
  FOREIGN KEY(glyph_id) REFERENCES glyphs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_glyph_likes_glyph_id ON glyph_likes(glyph_id);
CREATE INDEX IF NOT EXISTS idx_glyph_likes_user_id  ON glyph_likes(user_id);
```

---

## 9. 相關功能

- [F07-按讚功能.md](../features/F07-按讚功能.md) — 按讚行為邏輯
- [F02-字圖搜尋.md](../features/F02-字圖搜尋.md) — 按讚數用於搜尋排序
