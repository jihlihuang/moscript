import path from "path";
import { BlobServiceClient, type BlockBlobClient, type ContainerClient } from "@azure/storage-blob";

export const glyphsPrefix = (process.env.MOSCRIPT_GLYPHS_PREFIX || "glyphs").replace(/^\/+|\/+$/g, "");

export function hasBlobConfig() {
  return Boolean(
    process.env.AZURE_STORAGE_CONNECTION_STRING &&
      process.env.AZURE_STORAGE_CONTAINER_NAME
  );
}

function getContainerClient(): ContainerClient {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;

  if (!connectionString || !containerName) {
    throw new Error("Azure Blob Storage is not configured.");
  }

  return BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);
}

export async function ensureContainer() {
  const container = getContainerClient();
  await container.createIfNotExists();
  return container;
}

export function getBlobClient(blobName: string): BlockBlobClient {
  return getContainerClient().getBlockBlobClient(blobName);
}

export async function uploadFileToBlob(localPath: string, blobName: string, contentType?: string) {
  const container = await ensureContainer();
  await container.getBlockBlobClient(blobName).uploadFile(localPath, {
    blobHTTPHeaders: contentType ? { blobContentType: contentType } : undefined,
  });
}

export async function uploadBufferToBlob(buffer: Buffer, blobName: string, contentType?: string) {
  const container = await ensureContainer();
  await container.getBlockBlobClient(blobName).uploadData(buffer, {
    blobHTTPHeaders: contentType ? { blobContentType: contentType } : undefined,
  });
}

export function glyphBlobName(char: string, fileName: string) {
  return path.posix.join(glyphsPrefix, char, fileName);
}

export function glyphBlobNameFromPath(parts: string[]) {
  return path.posix.join(glyphsPrefix, ...parts);
}

export function glyphImageUrl(char: string, fileName: string) {
  return `/glyphs/${encodeURIComponent(char)}/${encodeURIComponent(fileName)}`;
}
