# MoScript 書法集字系統 MVP（Next.js + Tailwind + SQLite）

MoScript 是一個可本機運作的「書法字搜尋／集字／後台匯入」原型系統。

## 功能

### 前台

- 搜尋句子，例如：`小橋流水人家`
- 依單字顯示不同書法字圖
- 依作者、書體篩選
- 點選字圖加入集字列
- 儲存集字作品
- 開啟已儲存集字作品頁面

### 後台

- 查看資料庫統計
- 搜尋字庫資料
- 上傳單字圖片並寫入 SQLite
- 支援欄位：字、作者、書體、作品、來源、授權、品質分數

### 資料匯入

- 圖片放在 `public/glyphs/字/作者_書體_作品_編號.svg|jpg|png|webp|gif`
- 執行 `npm run import:glyphs` 自動掃描並匯入資料庫

## 快速開始

```bash
npm install
npm run seed:demo
npm run dev
```

打開：

- 前台：http://localhost:3000
- 後台：http://localhost:3000/admin

## 匯入自己的書法字圖片

資料夾建議：

```txt
public/
  glyphs/
    小/
      孫過庭_草_書譜_001.jpg
      徐伯清_行_作品名_002.jpg
    橋/
      歐陽詢_楷_九成宮_001.jpg
```

執行：

```bash
npm run import:glyphs
```

## SQLite 資料庫位置

```txt
data/moscript.sqlite
```

## 重要提醒

這份是本機／學習／非商業原型。正式上線時建議：

- 圖片改放 Cloudflare R2、Supabase Storage、Google Cloud Storage 等物件儲存
- SQLite 改成 PostgreSQL 或 Supabase Database
- 後台加登入權限
- 上傳檔案加檔案大小、格式與病毒掃描限制
