# T08 — security_events（安全事件日誌表）

> 資料庫類型：SQLite
> 定義位置：`lib/db.ts` → `initSchema()`

---

## 1. 資料表說明

記錄系統偵測到的所有安全相關事件，包含 OAuth 攻擊嘗試、速率限制觸發、未授權存取等。此表為安全監控的核心資料來源，管理員可透過後台查詢近期安全事件。此表為唯寫（Append-Only），不應刪除或修改既有記錄。

---

## 2. 欄位定義

| 欄位名稱 | 中文名稱 | 資料類型 | 必填 | 預設值 | 說明 |
|---|---|---|---|---|---|
| `id` | 事件 ID | INTEGER | 是 | AUTO | 自動遞增主鍵 |
| `event_type` | 事件類型 | TEXT | 是 | — | 安全事件代碼（見下方說明） |
| `severity` | 嚴重程度 | TEXT | 是 | `'medium'` | 事件嚴重等級（`high` / `medium` / `low`） |
| `ip` | 來源 IP | TEXT | 否 | NULL | 觸發事件的請求來源 IP |
| `user_agent` | 瀏覽器資訊 | TEXT | 否 | NULL | 觸發事件的 User-Agent 字串 |
| `user_id` | 使用者 ID | TEXT | 否 | NULL | 相關使用者 Google ID（已登入時記錄） |
| `path` | 請求路徑 | TEXT | 否 | NULL | 觸發事件的 API 路徑 |
| `details` | 事件細節 | TEXT | 否 | NULL | JSON 格式的額外資訊 |
| `created_at` | 事件時間 | TEXT | 是 | CURRENT_TIMESTAMP | ISO 8601 格式時間戳 |

---

## 3. event_type 與 severity 對應

| event_type | 中文說明 | severity | 觸發情境 |
|---|---|---|---|
| `oauth_state_mismatch` | OAuth state 不符 | `high` | OAuth 回調時 state 參數不一致（疑似 CSRF 攻擊） |
| `resource_access_violation` | 資源存取違規 | `high` | 嘗試存取他人私密字圖或私密集字 |
| `api_forbidden` | API 禁止存取 | `medium` | 需要管理員權限但無管理員身份 |
| `rate_limit_upload` | 上傳速率超限 | `medium` | 字圖上傳超過 10 次/分鐘 |
| `rate_limit_like` | 按讚速率超限 | `medium` | 按讚超過 30 次/分鐘 |
| `api_unauthorized` | API 未授權 | `low` | 需要登入的 API 但未提供有效 Session |

---

## 4. severity 欄位說明

| 值 | 中文名稱 | 說明 |
|---|---|---|
| `high` | 高風險 | 可能是主動攻擊行為，需優先調查 |
| `medium` | 中風險 | 異常使用行為，需定期監控 |
| `low` | 低風險 | 一般錯誤使用（如忘記登入），可忽略 |

---

## 5. details 欄位 JSON 格式範例

**oauth_state_mismatch 事件：**
```json
{
  "expected_state": "abc123",
  "received_state": "xyz789"
}
```

**rate_limit_upload 事件：**
```json
{
  "attempts": 11,
  "window_seconds": 60
}
```

**resource_access_violation 事件：**
```json
{
  "resource_type": "glyph",
  "resource_id": 42,
  "owner_id": "other_user_google_id"
}
```

---

## 6. 索引

| 索引名稱 | 欄位 | 用途 |
|---|---|---|
| `idx_security_events_event_type` | `event_type` | 依事件類型篩選 |
| `idx_security_events_severity` | `severity` | 依嚴重程度篩選（查詢 high 事件） |
| `idx_security_events_ip` | `ip` | 查詢特定 IP 的所有事件（追蹤攻擊者） |
| `idx_security_events_created_at` | `created_at` | 時間範圍查詢 |

---

## 7. 主鍵與約束

| 約束類型 | 欄位 | 說明 |
|---|---|---|
| PRIMARY KEY | `id` | 自動遞增整數主鍵 |
| NOT NULL | `event_type`, `severity` | 必填欄位 |

---

## 8. 常用監控查詢

**查詢所有高風險事件：**
```sql
SELECT * FROM security_events
WHERE severity = 'high'
ORDER BY created_at DESC
LIMIT 100;
```

**查詢特定 IP 的攻擊行為：**
```sql
SELECT event_type, COUNT(*) AS count, MAX(created_at) AS last_seen
FROM security_events
WHERE ip = '1.2.3.4'
GROUP BY event_type;
```

**近 24 小時各類型事件統計：**
```sql
SELECT event_type, severity, COUNT(*) AS count
FROM security_events
WHERE created_at >= datetime('now', '-24 hours')
GROUP BY event_type, severity
ORDER BY count DESC;
```

---

## 9. 建立 SQL

```sql
CREATE TABLE IF NOT EXISTS security_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT    NOT NULL,
  severity   TEXT    NOT NULL DEFAULT 'medium',
  ip         TEXT,
  user_agent TEXT,
  user_id    TEXT,
  path       TEXT,
  details    TEXT,
  created_at TEXT    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_severity   ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_ip         ON security_events(ip);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at);
```

---

## 10. 相關功能

- [F09-安全監控.md](../features/F09-安全監控.md) — 安全機制與事件類型詳細說明
- [F08-後台管理.md](../features/F08-後台管理.md) — 管理員查詢安全事件
- [F01-使用者認證.md](../features/F01-使用者認證.md) — OAuth 安全事件觸發
