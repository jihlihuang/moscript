# T03 — collection_items（集字項目表）

> 資料庫類型：SQLite
> 定義位置：`lib/db.ts` → `initSchema()`

---

## 1. 資料表說明

集字作品與字圖之間的關聯表（Many-to-Many 的具體實作）。每筆記錄代表「某件集字作品中，在第 N 個位置使用了哪個字圖」。一件作品中的每個位置只能有一個字圖。

---

## 2. 欄位定義

| 欄位名稱 | 中文名稱 | 資料類型 | 必填 | 預設值 | 說明 |
|---|---|---|---|---|---|
| `id` | 項目 ID | INTEGER | 是 | AUTO | 自動遞增主鍵 |
| `collection_id` | 集字作品 ID | INTEGER | 是 | — | 所屬集字作品（外鍵，`collections.id`） |
| `glyph_id` | 字圖 ID | INTEGER | 是 | — | 選用的字圖（外鍵，`glyphs.id`） |
| `position` | 位置順序 | INTEGER | 是 | — | 字在作品中的位置（從 0 開始計算） |
| `char` | 中文字 | TEXT | 是 | — | 此位置對應的中文字（冗餘儲存，方便查詢不 JOIN glyphs） |

---

## 3. 欄位說明補充

### position 欄位
- 從 **0** 開始計數
- 代表該字在整件集字作品中的位置順序
- 範例：作品「山水」中，「山」的 position = 0，「水」的 position = 1

### char 欄位
- 冗餘儲存（`glyphs.char` 的複製）
- 用途：查詢集字作品時，不需要 JOIN `glyphs` 表即可得知每個位置的字
- 保證一致性：新增時應與 `glyphs.char` 相同

---

## 4. 索引

| 索引名稱 | 欄位 | 用途 |
|---|---|---|
| `idx_collection_items_collection_id` | `collection_id` | 查詢某作品的所有字圖（最常用） |
| `idx_collection_items_glyph_id` | `glyph_id` | 查詢某字圖被哪些作品使用（統計集字數） |

---

## 5. 主鍵與約束

| 約束類型 | 欄位 | 說明 |
|---|---|---|
| PRIMARY KEY | `id` | 自動遞增整數主鍵 |
| NOT NULL | `collection_id`, `glyph_id`, `position`, `char` | 所有欄位必填 |

---

## 6. 外鍵關係

| 外鍵欄位 | 參照表 | 參照欄位 | 刪除行為 |
|---|---|---|---|
| `collection_id` | `collections` | `id` | CASCADE（作品刪除，項目一起刪除） |
| `glyph_id` | `glyphs` | `id` | CASCADE（字圖刪除，項目一起刪除） |

**重要說明**：兩個外鍵均設定 `ON DELETE CASCADE`，意即：
- 刪除集字作品 → 其所有集字項目自動刪除
- 刪除字圖 → 引用該字圖的所有集字項目自動刪除（可能影響現有作品顯示）

---

## 7. 集字次數統計

`collection_items` 是計算字圖「被集字次數」的資料來源：

```sql
SELECT glyph_id, COUNT(*) AS collection_count
FROM collection_items
GROUP BY glyph_id
```

此統計影響字圖在 `popular` 排序中的分數（集字次數 × 10）。

---

## 8. 建立 SQL

```sql
CREATE TABLE IF NOT EXISTS collection_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id INTEGER NOT NULL,
  glyph_id      INTEGER NOT NULL,
  position      INTEGER NOT NULL,
  char          TEXT    NOT NULL,
  FOREIGN KEY(collection_id) REFERENCES collections(id) ON DELETE CASCADE,
  FOREIGN KEY(glyph_id)      REFERENCES glyphs(id)      ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_collection_items_collection_id ON collection_items(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_items_glyph_id      ON collection_items(glyph_id);
```

---

## 9. 相關功能

- [F03-集字作品.md](../features/F03-集字作品.md) — 集字項目的建立與查詢
- [F02-字圖搜尋.md](../features/F02-字圖搜尋.md) — 集字次數用於搜尋排序
