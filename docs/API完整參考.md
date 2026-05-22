# API 完整參考

> 本文列出 MoScript 所有 HTTP API 端點。
> 所有 API 路徑以 `/api` 開頭，回應格式為 JSON，除非另有說明。

---

## 認證說明

Session 以加密 Cookie 傳遞。需要登入的端點若無有效 Cookie，回傳 `401 Unauthorized`。需要管理員的端點若非管理員，回傳 `403 Forbidden`。

| 符號 | 說明 |
|------|------|
| 🔓 | 公開，無需登入 |
| 🔑 | 需要登入（有效 Session） |
| 🛡️ | 需要管理員（`isAdmin = true`） |

---

## 認證 API

### `GET /api/auth/google`
🔓 啟動 Google OAuth 授權流程

**回應：** `302` 重導向至 Google 授權頁面

---

### `GET /api/auth/google/callback`
🔓 處理 Google OAuth 回調

**Query 參數：**

| 參數 | 必填 | 說明 |
|------|------|------|
| `code` | 是 | 授權碼 |
| `state` | 是 | CSRF 驗證碼 |
| `error` | 否 | 錯誤碼（使用者拒絕授權） |

**回應：** `302` 重導向至首頁，設定加密 Session Cookie

---

### `GET /api/auth/me`
🔓 取得當前登入使用者

**回應（已登入）：**
```json
{
  "user": {
    "id": "google_user_id",
    "email": "user@example.com",
    "name": "顯示名稱",
    "picture": "https://...",
    "isAdmin": false
  }
}
```

**回應（未登入）：**
```json
{ "user": null }
```

---

### `POST /api/auth/logout`
🔑 登出並清除 Session

**回應：** `302` 重導向至首頁

---

## 字圖 API

### `GET /api/glyphs`
🔓 搜尋字圖

**Query 參數：**

| 參數 | 類型 | 預設值 | 說明 |
|------|------|--------|------|
| `q` | string | `""` | 搜尋文字（中文，可多字） |
| `scriptTypes` | string | `""` | 書體（逗號分隔，如 `行,草`） |
| `resultScope` | string | `library` | `library`/`all`/`liked`/`personal`/`public` |
| `sort` | string | `popular` | `popular`/`newest`/`author`/`script` |
| `perChar` | number | `3` | 每字回傳字圖數（1~10） |
| `offset` | number | `0` | 分頁偏移（字數） |
| `limit` | number | `20` | 每頁字數 |

**回應（200）：**
```json
{
  "glyphs": [
    {
      "char": "山",
      "results": [
        {
          "id": 1,
          "char": "山",
          "author": "王羲之",
          "script_type": "行",
          "work_title": "蘭亭集序",
          "image_url": "/glyphs/山/王羲之_行_蘭亭集序_001.jpg",
          "thumbnail_url": null,
          "source": "manual",
          "license": "non-commercial-research",
          "quality_score": 5,
          "owner_user_id": null,
          "visibility": "public",
          "like_count": 12,
          "collection_count": 3,
          "liked_by_me": 0,
          "created_at": "2025-01-01T00:00:00Z"
        }
      ]
    }
  ],
  "hasMore": true,
  "total": 150
}
```

---

### `POST /api/glyphs`
🛡️ 建立系統書庫字圖（管理員）

**Body（JSON）：**
```json
{
  "char": "山",
  "author": "王羲之",
  "scriptType": "行",
  "workTitle": "蘭亭集序",
  "imageUrl": "https://...",
  "source": "manual",
  "license": "non-commercial-research",
  "qualityScore": 5
}
```

**回應（201）：** 建立的字圖物件

---

### `GET /api/glyphs/[id]`
🔓 取得單一字圖（私密字圖需為所有者）

**回應（200）：** 字圖物件（含 like_count、collection_count）

**錯誤：**
- `404` — 字圖不存在
- `403` — 嘗試存取他人私密字圖

---

### `PATCH /api/glyphs/[id]`
🛡️ 更新字圖元資料（管理員）

**Body（JSON，部分更新）：**
```json
{
  "author": "新作者",
  "scriptType": "草",
  "workTitle": "新作品名",
  "qualityScore": 8,
  "visibility": "public"
}
```

---

### `DELETE /api/glyphs/[id]`
🛡️ 刪除字圖（管理員）

**回應（204）：** 無內容

**副作用：** 刪除實體圖片檔案、串聯刪除 glyph_likes 與 collection_items

---

### `POST /api/glyphs/upload`
🔑 上傳個人字圖（速率限制：10 次/分鐘/IP）

**Content-Type：** `multipart/form-data`

**表單欄位：**

| 欄位 | 必填 | 說明 |
|------|------|------|
| `file` | 是 | 圖片（最大 20 MB） |
| `char` | 是 | 中文字 |
| `scriptType` | 否 | 書體 |
| `author` | 否 | 書寫者 |
| `workTitle` | 否 | 作品名稱 |
| `visibility` | 否 | `public`/`private`（預設 `public`） |

**回應（201）：**
```json
{
  "id": 123,
  "char": "山",
  "image_url": "/glyphs/山/...",
  "visibility": "public"
}
```

**錯誤：**
- `400` — 格式不符或缺少必填欄位
- `413` — 檔案超過 20 MB
- `429` — 速率限制

---

### `GET /api/glyphs/top-chars`
🔓 取得推薦詞句（熱門搜尋字）

**回應（200）：**
```json
{
  "chars": ["山", "水", "風", "雲"],
  "phrases": ["山水", "天下", "寧靜致遠"]
}
```

---

### `GET /api/glyphs/scripts`
🔓 取得書體統計

**回應（200）：**
```json
[
  { "script_type": "行", "count": 2000 },
  { "script_type": "草", "count": 1500 }
]
```

---

### `GET /api/glyphs/[id]/asset`
🔓/🔑 取得字圖實體圖片（私密字圖需為所有者）

**回應（200）：** 圖片二進位資料（Content-Type: image/\*）

**錯誤：**
- `403` — 無存取權限
- `404` — 找不到圖片

---

### `GET /api/glyphs/[id]/image`
🔓 動態生成字圖展示圖

**回應（200）：** 圖片資料

---

### `POST /api/glyphs/[id]/like`
🔑 切換按讚狀態（速率限制：30 次/分鐘/使用者）

**回應（200）：**
```json
{
  "liked": true,
  "like_count": 13
}
```

**錯誤：**
- `429` — 速率限制

---

## 集字作品 API

### `GET /api/collections`
🔑 列出當前使用者的集字作品

**回應（200）：** 集字作品陣列

---

### `POST /api/collections`
🔑 建立新集字作品

**Body（JSON）：**
```json
{
  "title": "作品標題",
  "text": "山水",
  "displayDirection": "horizontal",
  "visibility": "public",
  "items": [
    { "glyphId": 1, "char": "山", "position": 0 },
    { "glyphId": 5, "char": "水", "position": 1 }
  ]
}
```

**回應（201）：** 建立的作品物件（含 `id`）

**錯誤：**
- `400` — 標題為空或 items 為空

---

### `GET /api/collections/[id]`
🔓 取得集字作品詳情（私密作品需為所有者）

**回應（200）：**
```json
{
  "id": 42,
  "title": "作品標題",
  "text": "山水",
  "displayDirection": "horizontal",
  "visibility": "public",
  "user_id": "google_user_id",
  "user_name": "王小明",
  "created_at": "...",
  "items": [
    {
      "id": 1,
      "collection_id": 42,
      "glyph_id": 1,
      "position": 0,
      "char": "山",
      "glyph": { "id": 1, "char": "山", "author": "王羲之", ... }
    }
  ]
}
```

**錯誤：**
- `404` — 作品不存在
- `403` — 無存取權限（他人私密作品）

---

### `PATCH /api/collections/[id]`
🔑 更新集字作品（需為所有者）

**Body（JSON，部分更新）：**
```json
{
  "title": "新標題",
  "displayDirection": "vertical",
  "visibility": "private"
}
```

---

### `DELETE /api/collections/[id]`
🔑 刪除集字作品（需為所有者）

**回應（204）：** 無內容

---

## 個人字圖管理 API

### `GET /api/me/glyphs`
🔑 列出個人上傳的所有字圖

**回應（200）：** 字圖陣列（含 like_count、collection_count）

---

### `PATCH /api/me/glyphs`
🔑 批量操作個人字圖

**Body（刪除）：**
```json
{ "action": "delete", "ids": [1, 2, 3] }
```

**Body（切換可見性）：**
```json
{ "action": "visibility", "ids": [1, 2, 3], "visibility": "private" }
```

**Body（更新元資料）：**
```json
{ "action": "update", "id": 1, "scriptType": "草", "author": "新作者", "workTitle": "新作品" }
```

---

### `DELETE /api/me/glyphs/[id]`
🔑 刪除單一個人字圖

**回應（204）：** 無內容

---

## 後台管理 API

### `GET /api/admin/stats`
🛡️ 取得系統統計

**回應（200）：**
```json
{
  "glyphCount": 5000,
  "userCount": 150,
  "scriptDistribution": [
    { "script_type": "行", "count": 2000 }
  ],
  "topChars": [
    { "char": "山", "count": 45 }
  ],
  "recentUploads": [...]
}
```

---

### `POST /api/admin/upload`
🛡️ 後台批量上傳字圖

**Content-Type：** `multipart/form-data`

**表單欄位：**

| 欄位 | 說明 |
|------|------|
| `files` | 多個圖片檔案 |
| `scriptType` | 書體（選填，共用） |
| `license` | 授權類型（選填） |

**回應（200）：**
```json
{
  "uploaded": 15,
  "failed": 2,
  "errors": [...]
}
```

---

### `GET /api/admin/security`
🛡️ 取得安全事件日誌

**Query 參數：**

| 參數 | 說明 | 預設 |
|------|------|------|
| `severity` | 篩選嚴重程度（high/medium/low） | 全部 |
| `limit` | 回傳筆數 | 100 |
| `offset` | 分頁偏移 | 0 |

**回應（200）：** 安全事件陣列

---

## 錯誤回應格式

所有錯誤一律回傳：

```json
{
  "error": "錯誤說明文字"
}
```

| HTTP 狀態碼 | 情境 |
|------------|------|
| `400` | 請求格式不正確、缺少必填欄位 |
| `401` | 需要登入但未登入 |
| `403` | 無操作權限（非所有者或非管理員） |
| `404` | 資源不存在 |
| `413` | 上傳檔案過大 |
| `429` | 速率限制觸發 |
| `500` | 伺服器內部錯誤 |

---

## 相關文件

- [features/F01-使用者認證.md](features/F01-使用者認證.md) — 認證機制詳細說明
- [features/F02-字圖搜尋.md](features/F02-字圖搜尋.md) — 搜尋參數與排序邏輯
- [features/F09-安全監控.md](features/F09-安全監控.md) — 速率限制與安全機制
