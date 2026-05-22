# MoScript 書法集字系統 — 技術文件索引

> 本文件由系統分析自動產生，供維護人員參考使用。
> 最後更新：2026-05-22（新增操作指南與參考文件）

---

## 系統簡介

MoScript 是一套書法集字平台，提供使用者以中文字為單位搜尋書法字圖、自由組合成集字作品，並支援書法練習功能。系統採用 Next.js 15 App Router 架構，資料庫使用 SQLite，靜態資源可選擇部署至 Azure Blob Storage。

### 技術堆疊

| 層面 | 技術 |
|------|------|
| 前端框架 | Next.js 15 (App Router) + React 19 |
| 樣式系統 | Tailwind CSS 3 |
| 後端運行 | Node.js (Next.js Server Actions) |
| 資料庫 | SQLite (better-sqlite3) + WAL 模式 |
| 雲端儲存 | Azure Blob Storage (選用) |
| 部署平台 | Azure Container Apps (Docker) |

---

## 功能規格書

| 編號 | 功能名稱 | 檔案連結 |
|------|---------|---------|
| F01 | 使用者認證 (Google OAuth) | [F01-使用者認證.md](features/F01-使用者認證.md) |
| F02 | 字圖搜尋 | [F02-字圖搜尋.md](features/F02-字圖搜尋.md) |
| F03 | 集字作品 | [F03-集字作品.md](features/F03-集字作品.md) |
| F04 | 字圖上傳 | [F04-字圖上傳.md](features/F04-字圖上傳.md) |
| F05 | 個人字圖管理 | [F05-個人字圖管理.md](features/F05-個人字圖管理.md) |
| F06 | 書法練習 | [F06-書法練習.md](features/F06-書法練習.md) |
| F07 | 按讚功能 | [F07-按讚功能.md](features/F07-按讚功能.md) |
| F08 | 後台管理 | [F08-後台管理.md](features/F08-後台管理.md) |
| F09 | 安全監控 | [F09-安全監控.md](features/F09-安全監控.md) |
| F10 | 使用者行為追蹤 | [F10-使用者行為追蹤.md](features/F10-使用者行為追蹤.md) |

---

## 資料表 Schema

| 編號 | 資料表名稱 | 中文名稱 | 檔案連結 |
|------|----------|---------|---------|
| T01 | glyphs | 字圖表 | [T01-glyphs.md](schema/T01-glyphs.md) |
| T02 | collections | 集字作品表 | [T02-collections.md](schema/T02-collections.md) |
| T03 | collection_items | 集字項目表 | [T03-collection_items.md](schema/T03-collection_items.md) |
| T04 | glyph_likes | 字圖按讚表 | [T04-glyph_likes.md](schema/T04-glyph_likes.md) |
| T05 | users | 使用者表 | [T05-users.md](schema/T05-users.md) |
| T06 | admin_audit_logs | 管理員操作日誌表 | [T06-admin_audit_logs.md](schema/T06-admin_audit_logs.md) |
| T07 | usage_events | 使用者行為日誌表 | [T07-usage_events.md](schema/T07-usage_events.md) |
| T08 | security_events | 安全事件日誌表 | [T08-security_events.md](schema/T08-security_events.md) |

---

## 實體關聯圖 (ER Diagram)

```
┌─────────────┐         ┌──────────────────┐         ┌────────────────────┐
│    users    │         │   collections    │         │  collection_items  │
│─────────────│ 1     * │──────────────────│ 1     * │────────────────────│
│ id (PK)     │────────▶│ id (PK)          │────────▶│ id (PK)            │
│ email       │         │ user_id (FK)     │         │ collection_id (FK) │
│ name        │         │ title            │         │ glyph_id (FK)      │
│ picture     │         │ text             │         │ position           │
│ created_at  │         │ display_direction│         │ char               │
│ updated_at  │         │ visibility       │         └────────────────────┘
└─────────────┘         │ created_at       │                   │
       │                └──────────────────┘                   │
       │                                                        │ *
       │ *              ┌──────────────────┐                   │
       │                │     glyphs       │◀──────────────────┘
       └───────────────▶│──────────────────│
                        │ id (PK)          │
                        │ char             │
                        │ author           │
                        │ script_type      │
                        │ work_title       │
                        │ image_url        │
                        │ thumbnail_url    │
                        │ source           │
                        │ license          │
                        │ quality_score    │
                        │ owner_user_id    │
                        │ visibility       │
                        │ created_at       │
                        └──────────────────┘
                                │
                                │ 1
                                │
                                ▼ *
                        ┌──────────────────┐
                        │  glyph_likes     │
                        │──────────────────│
                        │ glyph_id (FK/PK) │
                        │ user_id (PK)     │
                        │ user_email       │
                        │ created_at       │
                        └──────────────────┘

日誌表（獨立）：
  admin_audit_logs — 管理員操作記錄
  usage_events     — 使用者行為記錄
  security_events  — 安全事件記錄
```

---

## 操作指南

| 文件 | 適用對象 | 說明 |
|------|---------|------|
| [本機開發指南.md](本機開發指南.md) | 開發者 | 初次設定、Google OAuth 申請、本機啟動 |
| [環境變數說明.md](環境變數說明.md) | 開發者 / DevOps | 所有環境變數的用途、格式與範例 |
| [字圖命名與匯入規範.md](字圖命名與匯入規範.md) | 內容維護人員 | 書法字圖的命名規則與 `npm run import:glyphs` 使用方式 |
| [azure-container-apps.md](azure-container-apps.md) | DevOps | 部署至 Azure 的完整步驟與 CI/CD 設定 |

## 參考文件

| 文件 | 說明 |
|------|------|
| [API完整參考.md](API完整參考.md) | 所有 API 端點的請求/回應格式（含認證符號標示） |
| [前端元件說明.md](前端元件說明.md) | 每個 React 元件的用途、Props 與使用場景 |

---

## 目錄結構說明

```
docs/
├── README.md                    # 本索引文件
├── 本機開發指南.md               # 開發者上手指南
├── 環境變數說明.md               # 環境變數完整說明
├── 字圖命名與匯入規範.md          # 字圖內容維護 SOP
├── API完整參考.md                # API 端點一覽
├── 前端元件說明.md               # React 元件說明
├── azure-container-apps.md      # 雲端部署指南（原有）
├── features/               # 功能規格書（一功能一檔案）
│   ├── F01-使用者認證.md
│   ├── F02-字圖搜尋.md
│   ├── F03-集字作品.md
│   ├── F04-字圖上傳.md
│   ├── F05-個人字圖管理.md
│   ├── F06-書法練習.md
│   ├── F07-按讚功能.md
│   ├── F08-後台管理.md
│   ├── F09-安全監控.md
│   └── F10-使用者行為追蹤.md
└── schema/                 # 資料表 Schema（一資料表一檔案）
    ├── T01-glyphs.md
    ├── T02-collections.md
    ├── T03-collection_items.md
    ├── T04-glyph_likes.md
    ├── T05-users.md
    ├── T06-admin_audit_logs.md
    ├── T07-usage_events.md
    └── T08-security_events.md
```
