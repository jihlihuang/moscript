# T07 — usage_events（使用者行為日誌表）

> 資料庫類型：SQLite
> 定義位置：`lib/db.ts` → `initSchema()`

---

## 1. 資料表說明

記錄使用者在系統中的主要行為事件，如搜尋、上傳等。此表為系統數據分析的主要資料來源，供管理員了解使用模式與熱門內容。此表為唯寫（Append-Only），不應刪除或修改既有記錄。

---

## 2. 欄位定義

| 欄位名稱 | 中文名稱 | 資料類型 | 必填 | 預設值 | 說明 |
|---|---|---|---|---|---|
| `id` | 事件 ID | INTEGER | 是 | AUTO | 自動遞增主鍵 |
| `event_type` | 事件類型 | TEXT | 是 | — | 行為類型代碼（見下方說明） |
| `subject` | 事件主題 | TEXT | 否 | NULL | 事件的主要對象（如：搜尋的字、上傳的字）方便 GROUP BY 統計 |
| `details` | 事件細節 | TEXT | 否 | NULL | JSON 格式的額外資訊（搜尋條件、上傳結果等） |
| `user_id` | 使用者 ID | TEXT | 否 | NULL | 觸發事件的使用者 Google ID（訪客為 NULL） |
| `created_at` | 事件時間 | TEXT | 是 | CURRENT_TIMESTAMP | ISO 8601 格式時間戳 |

---

## 3. event_type 欄位可選值

| event_type | 中文說明 | subject | user_id |
|---|---|---|---|
| `search` | 字圖搜尋 | 搜尋的文字 | 已登入為使用者 ID，訪客為 NULL |
| `upload_succeeded` | 上傳字圖成功 | 上傳的中文字 | 使用者 ID |
| `upload_failed` | 上傳字圖失敗 | 試圖上傳的字（若有） | 使用者 ID |

---

## 4. details 欄位 JSON 格式

### search 事件
```json
{
  "q": "山水",
  "scriptTypes": ["行", "草"],
  "resultScope": "library",
  "sort": "popular",
  "resultCount": 6,
  "durationMs": 12
}
```

| 子欄位 | 說明 |
|---|---|
| `q` | 搜尋文字 |
| `scriptTypes` | 書體篩選陣列 |
| `resultScope` | 搜尋範圍 |
| `sort` | 排序方式 |
| `resultCount` | 回傳的字圖組數 |
| `durationMs` | SQL 查詢耗時（毫秒） |

### upload_succeeded 事件
```json
{
  "char": "山",
  "scriptType": "行",
  "visibility": "public"
}
```

### upload_failed 事件
```json
{
  "char": "山",
  "reason": "檔案格式不支援"
}
```

---

## 5. 索引

| 索引名稱 | 欄位 | 用途 |
|---|---|---|
| `idx_usage_events_event_type` | `event_type` | 依事件類型篩選 |
| `idx_usage_events_subject` | `subject` | 熱門搜尋詞統計（GROUP BY subject） |
| `idx_usage_events_created_at` | `created_at` | 時間範圍查詢（每日/每週統計） |

---

## 6. 主鍵與約束

| 約束類型 | 欄位 | 說明 |
|---|---|---|
| PRIMARY KEY | `id` | 自動遞增整數主鍵 |
| NOT NULL | `event_type` | 必填欄位 |

---

## 7. 常用分析查詢

**熱門搜尋字 Top 10：**
```sql
SELECT subject, COUNT(*) AS search_count
FROM usage_events
WHERE event_type = 'search'
  AND subject IS NOT NULL
GROUP BY subject
ORDER BY search_count DESC
LIMIT 10;
```

**每日搜尋量趨勢：**
```sql
SELECT DATE(created_at) AS date, COUNT(*) AS count
FROM usage_events
WHERE event_type = 'search'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

**上傳成功率：**
```sql
SELECT
  SUM(CASE WHEN event_type = 'upload_succeeded' THEN 1 ELSE 0 END) AS success,
  SUM(CASE WHEN event_type = 'upload_failed'    THEN 1 ELSE 0 END) AS failed
FROM usage_events
WHERE event_type IN ('upload_succeeded', 'upload_failed');
```

---

## 8. 建立 SQL

```sql
CREATE TABLE IF NOT EXISTS usage_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  subject    TEXT,
  details    TEXT,
  user_id    TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_usage_events_event_type ON usage_events(event_type);
CREATE INDEX IF NOT EXISTS idx_usage_events_subject    ON usage_events(subject);
CREATE INDEX IF NOT EXISTS idx_usage_events_created_at ON usage_events(created_at);
```

---

## 9. 相關功能

- [F10-使用者行為追蹤.md](../features/F10-使用者行為追蹤.md) — 事件記錄邏輯說明
- [F08-後台管理.md](../features/F08-後台管理.md) — 管理員統計分析應用
