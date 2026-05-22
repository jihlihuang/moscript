# T06 — admin_audit_logs（管理員操作日誌表）

> 資料庫類型：SQLite
> 定義位置：`lib/db.ts` → `initSchema()`

---

## 1. 資料表說明

記錄管理員在後台執行的所有操作，提供完整的操作追蹤（Audit Trail）。每次管理員執行新增、修改、刪除字圖等敏感操作時，系統自動寫入一筆日誌。此表為唯寫（Append-Only），不應刪除或修改既有記錄。

---

## 2. 欄位定義

| 欄位名稱 | 中文名稱 | 資料類型 | 必填 | 預設值 | 說明 |
|---|---|---|---|---|---|
| `id` | 日誌 ID | INTEGER | 是 | AUTO | 自動遞增主鍵 |
| `user_id` | 管理員使用者 ID | TEXT | 是 | — | 執行操作的管理員 Google ID |
| `user_email` | 管理員 Email | TEXT | 是 | — | 執行操作的管理員 Email |
| `user_name` | 管理員名稱 | TEXT | 否 | NULL | 執行操作的管理員顯示名稱 |
| `action` | 操作類型 | TEXT | 是 | — | 操作代碼（見下方說明） |
| `target_type` | 目標類型 | TEXT | 否 | NULL | 操作對象的類型（如：`glyph`） |
| `target_id` | 目標 ID | TEXT | 否 | NULL | 操作對象的 ID（字串化） |
| `details` | 操作細節 | TEXT | 否 | NULL | JSON 格式的額外資訊（修改前/後的值等） |
| `ip` | 來源 IP | TEXT | 否 | NULL | 管理員發送請求的 IP 位址 |
| `user_agent` | 瀏覽器資訊 | TEXT | 否 | NULL | 管理員使用的瀏覽器 User-Agent |
| `created_at` | 操作時間 | TEXT | 是 | CURRENT_TIMESTAMP | ISO 8601 格式時間戳 |

---

## 3. action 欄位可選值

| action 值 | 中文說明 | target_type |
|---|---|---|
| `glyph_create` | 建立字圖 | `glyph` |
| `glyph_update` | 更新字圖元資料 | `glyph` |
| `glyph_delete` | 刪除字圖 | `glyph` |
| `glyph_batch_upload` | 批量上傳字圖 | `glyph` |

---

## 4. details 欄位 JSON 格式範例

**glyph_update 操作：**
```json
{
  "before": {
    "author": "舊作者名",
    "script_type": "楷"
  },
  "after": {
    "author": "新作者名",
    "script_type": "行"
  }
}
```

**glyph_batch_upload 操作：**
```json
{
  "uploaded": 15,
  "failed": 2,
  "chars": ["山", "水", "風"]
}
```

---

## 5. 索引

| 索引名稱 | 欄位 | 用途 |
|---|---|---|
| `idx_admin_audit_logs_user_id` | `user_id` | 查詢特定管理員的操作記錄 |
| `idx_admin_audit_logs_action` | `action` | 依操作類型篩選 |
| `idx_admin_audit_logs_created_at` | `created_at` | 時間範圍查詢 |

---

## 6. 主鍵與約束

| 約束類型 | 欄位 | 說明 |
|---|---|---|
| PRIMARY KEY | `id` | 自動遞增整數主鍵 |
| NOT NULL | `user_id`, `user_email`, `action` | 必填欄位 |

---

## 7. 查詢範例

**查詢最近 50 筆管理員操作：**
```sql
SELECT * FROM admin_audit_logs
ORDER BY created_at DESC
LIMIT 50;
```

**查詢特定管理員的操作：**
```sql
SELECT * FROM admin_audit_logs
WHERE user_email = 'admin@example.com'
ORDER BY created_at DESC;
```

**統計各操作類型的數量：**
```sql
SELECT action, COUNT(*) AS count
FROM admin_audit_logs
GROUP BY action
ORDER BY count DESC;
```

---

## 8. 建立 SQL

```sql
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT    NOT NULL,
  user_email  TEXT    NOT NULL,
  user_name   TEXT,
  action      TEXT    NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  details     TEXT,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TEXT    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_user_id    ON admin_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action     ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at);
```

---

## 9. 相關功能

- [F08-後台管理.md](../features/F08-後台管理.md) — 管理員操作時寫入日誌
