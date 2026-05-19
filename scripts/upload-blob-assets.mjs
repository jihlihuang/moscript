import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { BlobServiceClient } from "@azure/storage-blob";

const glyphRoot = path.join(process.cwd(), "public", "glyphs");
const dbPath = path.join(process.cwd(), "data", "moscript.sqlite");
const glyphsPrefix = (process.env.MOSCRIPT_GLYPHS_PREFIX || "glyphs").replace(/^\/+|\/+$/g, "");
const dbBlobName = process.env.MOSCRIPT_DB_BLOB_NAME || "data/moscript.sqlite";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`請先設定 ${name}`);
  return value;
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function walk(dir) {
  const files = [];

  for (const item of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) files.push(...walk(fullPath));
    else files.push(fullPath);
  }

  return files;
}

async function uploadFile(container, localPath, blobName, contentType) {
  await container.getBlockBlobClient(blobName).uploadFile(localPath, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
}

function checkpointSqlite() {
  const walPath = `${dbPath}-wal`;
  if (!fs.existsSync(walPath)) return;

  console.log("偵測到 SQLite WAL 檔，正在 checkpoint 到主資料庫...");
  const result = spawnSync("sqlite3", [dbPath, "PRAGMA wal_checkpoint(TRUNCATE);"], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(
      [
        "SQLite checkpoint 失敗，請確認系統有 sqlite3 指令，且沒有其他程式正在鎖定資料庫。",
        result.stderr.trim(),
      ].filter(Boolean).join("\n")
    );
  }

  console.log("SQLite checkpoint 完成。");
}

async function main() {
  const connectionString = requiredEnv("AZURE_STORAGE_CONNECTION_STRING");
  const containerName = requiredEnv("AZURE_STORAGE_CONTAINER_NAME");

  if (!fs.existsSync(glyphRoot)) {
    throw new Error(`找不到 ${glyphRoot}`);
  }

  if (!fs.existsSync(dbPath)) {
    throw new Error(`找不到 ${dbPath}`);
  }

  checkpointSqlite();

  const container = BlobServiceClient
    .fromConnectionString(connectionString)
    .getContainerClient(containerName);
  await container.createIfNotExists();

  const glyphFiles = walk(glyphRoot);
  console.log(`準備上傳 ${glyphFiles.length} 個字圖檔案...`);

  for (let index = 0; index < glyphFiles.length; index += 1) {
    const file = glyphFiles[index];
    const relativePath = path.relative(glyphRoot, file);
    const blobName = path.posix.join(glyphsPrefix, ...relativePath.split(path.sep));
    await uploadFile(container, file, blobName, contentTypeFor(file));

    if ((index + 1) % 500 === 0 || index === glyphFiles.length - 1) {
      console.log(`已上傳 ${index + 1}/${glyphFiles.length}`);
    }
  }

  await uploadFile(container, dbPath, dbBlobName, "application/vnd.sqlite3");
  console.log(`已上傳 ${dbBlobName}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
