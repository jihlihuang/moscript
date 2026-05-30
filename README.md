# MoScript 墨跡字帖

書法字圖搜尋、集字與管理系統。以 Next.js 15 + SQLite + Azure Blob Storage 建置，支援 Google 帳號登入。

## 技術棧

| 層級 | 技術 |
| ---- | ---- |
| 前端框架 | Next.js 15（App Router）|
| 樣式 | Tailwind CSS |
| 資料庫 | SQLite（better-sqlite3）|
| 圖片儲存 | Azure Blob Storage（本機開發可略過）|
| 認證 | Google OAuth 2.0 |
| 部署 | Azure Container Apps |

## 頁面功能

### 前台

| 路由 | 說明 |
| ---- | ---- |
| `/` | 主頁：輸入字句搜尋書法字圖、篩選書體作者、集字、儲存集字作品 |
| `/collections/[id]` | 集字作品詳情：橫排／直排預覽、複製連結、公開私人切換 |
| `/glyph/[id]` | 單字詳情 |
| `/me` | 個人頁：我的字圖、我的集字作品 |
| `/upload` | 個人字圖上傳（單張 + 多字拆圖批次）|
| `/practice` | 練習頁 |

### 後台（需管理員帳號）

| 路由 | 說明 |
| ---- | ---- |
| `/admin` | 系統狀態、字圖管理、字組管理、資安監控 |
| `/admin/upload` | 後台字圖上傳（單張 + 多字拆圖批次）|

## 快速開始（本機）

```bash
npm install
npm run dev
```

- 前台：<http://localhost:3000>
- 後台：<http://localhost:3000/admin>

圖片儲存預設使用本機 `public/` 目錄，未設定 Azure 環境變數時自動 fallback。

## 環境變數

複製並建立 `.env.local`，填入以下變數：

```env
# 認證
AUTH_SECRET=                        # 任意亂數字串（JWT 簽署用）
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# 應用程式 URL（OAuth callback 用）
MOSCRIPT_APP_URL=https://yourdomain.com
# 或
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# 管理員（逗號分隔 Google 帳號 email）
MOSCRIPT_ADMIN_EMAILS=admin@example.com

# SQLite 資料庫
MOSCRIPT_DATA_DIR=./data
MOSCRIPT_DB_BLOB_NAME=data/moscript.sqlite

# Azure Blob Storage（可選，未設定時圖片存本機 public/）
AZURE_STORAGE_CONNECTION_STRING=
AZURE_STORAGE_CONTAINER_NAME=
MOSCRIPT_GLYPHS_PREFIX=glyphs
MOSCRIPT_PRIVATE_GLYPHS_PREFIX=private-glyphs
```

## 常用指令

```bash
npm run dev               # 本機開發
npm run build             # 建置
npm run import:glyphs     # 從 public/glyphs/ 目錄批次匯入字圖
npm run upload:blob       # 上傳本機靜態資源到 Azure Blob
npm run deploy:azure      # 部署到 Azure Container Apps
npm run restart:azure     # 重啟 Azure Container App
```

## 字圖資料夾結構（import:glyphs）

```text
public/
  glyphs/
    小/
      孫過庭_草_書譜_001.jpg
      徐伯清_行_作品名_002.jpg
    橋/
      歐陽詢_楷_九成宮_001.jpg
```

執行 `npm run import:glyphs` 自動掃描並寫入 SQLite。

## 核心概念

- **字圖（Glyph）**：單一書法字的圖片，含作者、書體、作品、來源、授權等 metadata
- **集字作品（Collection）**：使用者選取多個字圖組成的作品，可橫排或直排顯示
- **字組（Glyph Set）**：同一原稿拆分出的字圖群組，用於管理多字拆圖上傳的結果
