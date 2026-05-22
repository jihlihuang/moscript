# T05 — users（使用者表）

> 資料庫類型：SQLite
> 定義位置：`lib/db.ts` → `initSchema()`

---

## 1. 資料表說明

儲存透過 Google OAuth 登入的使用者基本資料。每次使用者登入時，系統執行 UPSERT（若存在則更新，不存在則新增），以確保名稱、頭像等資訊保持最新。

系統的許多表（`glyphs`、`collections`、`glyph_likes`）直接以非正規化方式儲存使用者資訊（email、name），故不依賴此表做 JOIN 查詢，此表主要用於使用者管理與統計。

---

## 2. 欄位定義

| 欄位名稱 | 中文名稱 | 資料類型 | 必填 | 預設值 | 說明 |
|---|---|---|---|---|---|
| `id` | 使用者 ID | TEXT | 是 | — | Google 帳號的唯一 ID（字串），作為主鍵 |
| `email` | 電子郵件 | TEXT | 是 | — | Google 帳號 Email（唯一值） |
| `name` | 顯示名稱 | TEXT | 否 | NULL | Google 帳號顯示名稱 |
| `picture` | 頭像 URL | TEXT | 否 | NULL | Google 帳號頭像圖片 URL |
| `created_at` | 首次登入時間 | TEXT | 是 | CURRENT_TIMESTAMP | 帳號首次登入系統的時間戳 |
| `updated_at` | 最後更新時間 | TEXT | 是 | CURRENT_TIMESTAMP | 最後一次 Upsert 的時間戳（每次登入更新） |

---

## 3. 主鍵設計

- `id` 使用 Google 提供的使用者唯一 ID（字串型態，如 `"123456789012345678901"`）
- 不使用整數自動遞增，因為 Google ID 已保證全域唯一性

---

## 4. 索引

| 索引名稱 | 欄位 | 說明 |
|---|---|---|
| （主鍵索引） | `id` | 自動建立 |
| UNIQUE | `email` | Email 唯一約束（建立索引） |

---

## 5. 登入時的 UPSERT 邏輯

```sql
INSERT INTO users (id, email, name, picture, updated_at)
VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET
  email      = excluded.email,
  name       = excluded.name,
  picture    = excluded.picture,
  updated_at = CURRENT_TIMESTAMP;
```

---

## 6. 管理員判斷機制

管理員身份**不儲存於此表**，而是透過環境變數 `MOSCRIPT_ADMIN_EMAILS` 白名單判斷：

```typescript
const isAdmin = MOSCRIPT_ADMIN_EMAILS
  .split(',')
  .map(e => e.trim())
  .includes(user.email);
```

這樣設計的優點：無需修改資料庫即可新增/移除管理員。

---

## 7. 非正規化說明

以下表的欄位儲存了使用者資訊的副本（為了查詢效率，避免 JOIN）：

| 表名 | 儲存的使用者欄位 |
|---|---|
| `glyphs` | `owner_user_id`, `owner_user_email`, `owner_user_name` |
| `collections` | `user_id`, `user_email`, `user_name` |
| `glyph_likes` | `user_id`, `user_email` |
| `admin_audit_logs` | `user_id`, `user_email`, `user_name` |

若使用者更改 Google 帳號名稱，已存在的記錄不會自動更新（只有下次登入後的新操作才使用新名稱）。

---

## 8. 建立 SQL

```sql
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  name       TEXT,
  picture    TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

---

## 9. 相關功能

- [F01-使用者認證.md](../features/F01-使用者認證.md) — 使用者登入與 Upsert 邏輯
- [F08-後台管理.md](../features/F08-後台管理.md) — 使用者統計（總使用者數）
