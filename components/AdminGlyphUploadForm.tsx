"use client";

import { ChangeEvent, FormEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { Eraser, RefreshCw, RotateCcw, Upload } from "lucide-react";

const uploadPreviewSize = 320;
const normalizedUploadImageSize = 640;
const maxUploadUndoSteps = 6;
const trimmedInkPaddingRatio = 0.08;
const allowedUploadImageExtensions = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "svg",
  "bmp",
  "ico",
  "avif",
  "heic",
  "heif",
  "tif",
  "tiff",
];
export const uploadImageAccept = allowedUploadImageExtensions.map((extension) => `.${extension}`).join(",");
const allowedUploadImageLabel = allowedUploadImageExtensions.join("、");

function onlyChinese(value: string) {
  return Array.from(value).filter((char) => /\p{Script=Han}/u.test(char)).join("");
}

function fileNameWithoutExtension(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, "") || "glyph";
}

function getFileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function isAllowedUploadImage(file: File) {
  const extension = getFileExtension(file.name);
  const hasAllowedExtension = allowedUploadImageExtensions.includes(extension);
  const hasImageMime = !file.type || file.type.startsWith("image/");
  return hasAllowedExtension && hasImageMime;
}

type ImageBounds = { x: number; y: number; width: number; height: number };

function getLuminance(red: number, green: number, blue: number) {
  return red * 0.299 + green * 0.587 + blue * 0.114;
}

function getLuminancePercentile(pixels: Uint8ClampedArray, canvasWidth: number, bounds: ImageBounds, target: number) {
  const histogram = new Array<number>(256).fill(0);
  let sampleCount = 0;

  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const index = (y * canvasWidth + x) * 4;
      const alpha = pixels[index + 3];
      if (alpha < 12) continue;
      const luminance = Math.round(getLuminance(pixels[index], pixels[index + 1], pixels[index + 2]));
      histogram[luminance] += 1;
      sampleCount += 1;
    }
  }

  if (sampleCount === 0) return 255;

  const targetCount = sampleCount * target;
  let seen = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    seen += histogram[value];
    if (seen >= targetCount) return value;
  }
  return 255;
}

function getInkScore(red: number, green: number, blue: number, backgroundLuminance: number) {
  const luminance = getLuminance(red, green, blue);
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
  const darkness = Math.max(0, backgroundLuminance - luminance);
  const colorInk = Math.max(0, chroma - 10) * 2.05;
  const darkInk = Math.max(0, darkness - 86) * 1.1;
  return Math.min(255, Math.round(colorInk + darkInk));
}

function getInkTone(red: number, green: number, blue: number, backgroundLuminance: number) {
  const luminance = getLuminance(red, green, blue);
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
  const darkness = Math.max(0, backgroundLuminance - luminance);
  const density = Math.max(0, Math.min(1, (darkness - 18) / 130));
  const colorDensity = Math.max(0, Math.min(1, (chroma - 28) / 135));
  const ink = Math.max(density, colorDensity * 0.76 + density * 0.24);
  return Math.max(36, Math.min(235, Math.round(42 + ink * 190)));
}

function getOtsuThreshold(histogram: number[], total: number) {
  let sum = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    sum += value * histogram[value];
  }

  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestVariance = -1;
  let bestThreshold = 72;

  for (let value = 0; value < histogram.length; value += 1) {
    backgroundWeight += histogram[value];
    if (backgroundWeight === 0) continue;
    const foregroundWeight = total - backgroundWeight;
    if (foregroundWeight === 0) break;

    backgroundSum += value * histogram[value];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (sum - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      bestThreshold = value;
    }
  }

  return Math.max(30, Math.min(140, bestThreshold - 6));
}

function keepWeakInkConnectedToStrong(weakMask: Uint8Array, strongMask: Uint8Array, width: number) {
  const keptMask = new Uint8Array(weakMask.length);
  const visited = new Uint8Array(weakMask.length);
  const queue: number[] = [];
  const component: number[] = [];
  const directions = [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1];

  for (let start = 0; start < weakMask.length; start += 1) {
    if (!weakMask[start] || visited[start]) continue;
    queue.length = 0;
    component.length = 0;
    let hasStrongInk = false;
    queue.push(start);
    visited[start] = 1;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      component.push(current);
      if (strongMask[current]) hasStrongInk = true;
      const x = current % width;

      for (const direction of directions) {
        const next = current + direction;
        if (next < 0 || next >= weakMask.length || visited[next] || !weakMask[next]) continue;
        const nextX = next % width;
        if (Math.abs(nextX - x) > 1) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }

    if (hasStrongInk) {
      for (const index of component) {
        keptMask[index] = 1;
      }
    }
  }

  return keptMask;
}

function stretchInkTones(tones: Uint8Array, mask: Uint8Array) {
  const histogram = new Array<number>(256).fill(0);
  let sampleCount = 0;

  for (let index = 0; index < tones.length; index += 1) {
    if (!mask[index]) continue;
    histogram[tones[index]] += 1;
    sampleCount += 1;
  }

  if (sampleCount === 0) return tones;

  function percentile(target: number) {
    const targetCount = sampleCount * target;
    let seen = 0;
    for (let value = 0; value < histogram.length; value += 1) {
      seen += histogram[value];
      if (seen >= targetCount) return value;
    }
    return 255;
  }

  const low = percentile(0.08);
  const high = Math.max(low + 18, percentile(0.94));
  const stretched = new Uint8Array(tones.length);

  for (let index = 0; index < tones.length; index += 1) {
    if (!mask[index]) continue;
    const normalized = Math.max(0, Math.min(1, (tones[index] - low) / (high - low)));
    stretched[index] = Math.round(72 + Math.pow(normalized, 1.06) * 170);
  }

  return stretched;
}

function addInkToneVariation(inkLayer: Uint8Array, tones: Uint8Array, width: number, height: number) {
  const tonedLayer = new Uint8Array(inkLayer.length);

  for (let index = 0; index < inkLayer.length; index += 1) {
    if (!inkLayer[index]) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    let inkSum = 0;
    let inkSamples = 0;

    for (let offsetY = -3; offsetY <= 3; offsetY += 1) {
      const nextY = y + offsetY;
      if (nextY < 0 || nextY >= height) continue;
      for (let offsetX = -3; offsetX <= 3; offsetX += 1) {
        const nextX = x + offsetX;
        if (nextX < 0 || nextX >= width) continue;
        const nextInk = inkLayer[nextY * width + nextX];
        if (!nextInk) continue;
        inkSum += nextInk;
        inkSamples += 1;
      }
    }

    const localDensity = Math.min(1, inkSamples / 49);
    const localInk = inkSamples ? inkSum / (inkSamples * 255) : 0;
    const baseTone = tones[index];
    const toneBoost = 0.12 * localDensity + 0.14 * localInk;
    tonedLayer[index] = Math.min(238, Math.round(baseTone + (255 - baseTone) * toneBoost));
  }

  return tonedLayer;
}

function tightenInkEdges(inkLayer: Uint8Array, width: number, height: number) {
  const tightenedLayer = new Uint8Array(inkLayer);
  const directions = [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1];

  for (let index = 0; index < inkLayer.length; index += 1) {
    if (!inkLayer[index]) continue;
    const x = index % width;
    let neighborCount = 0;

    for (const direction of directions) {
      const next = index + direction;
      if (next < 0 || next >= inkLayer.length) continue;
      const nextX = next % width;
      if (Math.abs(nextX - x) > 1) continue;
      if (inkLayer[next]) neighborCount += 1;
    }

    if (neighborCount < 8) {
      tightenedLayer[index] = inkLayer[index] < 118 ? 0 : Math.max(inkLayer[index], 205);
    }
  }

  return tightenedLayer;
}

function refineInkCanvas(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = getLuminance(pixels[index], pixels[index + 1], pixels[index + 2]);
    const ink = 255 - luminance;
    let enhancedInk = 0;
    if (ink > 20) {
      enhancedInk = 255 * Math.pow((ink - 20) / 235, 0.96);
    }
    const value = Math.max(0, Math.min(255, Math.round(255 - enhancedInk)));
    pixels[index] = value;
    pixels[index + 1] = value;
    pixels[index + 2] = value;
    pixels[index + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
}

function buildInkLayer(pixels: Uint8ClampedArray, canvasWidth: number, canvasHeight: number, bounds: ImageBounds) {
  const backgroundLuminance = getLuminancePercentile(pixels, canvasWidth, bounds, 0.9);
  const scoreHistogram = new Array<number>(256).fill(0);
  const scores = new Uint8Array(canvasWidth * canvasHeight);
  const tones = new Uint8Array(canvasWidth * canvasHeight);
  let sampleCount = 0;

  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const pixelIndex = (y * canvasWidth + x) * 4;
      if (pixels[pixelIndex + 3] < 12) continue;
      const score = getInkScore(pixels[pixelIndex], pixels[pixelIndex + 1], pixels[pixelIndex + 2], backgroundLuminance);
      scores[y * canvasWidth + x] = score;
      tones[y * canvasWidth + x] = getInkTone(pixels[pixelIndex], pixels[pixelIndex + 1], pixels[pixelIndex + 2], backgroundLuminance);
      scoreHistogram[score] += 1;
      sampleCount += 1;
    }
  }

  const threshold = sampleCount > 0 ? getOtsuThreshold(scoreHistogram, sampleCount) : 72;
  const weakThreshold = Math.max(18, threshold - 46);
  const weakMask = new Uint8Array(canvasWidth * canvasHeight);
  const strongMask = new Uint8Array(canvasWidth * canvasHeight);
  for (let index = 0; index < scores.length; index += 1) {
    weakMask[index] = scores[index] >= weakThreshold ? 1 : 0;
    strongMask[index] = scores[index] >= threshold ? 1 : 0;
  }
  const connectedMask = keepWeakInkConnectedToStrong(weakMask, strongMask, canvasWidth);
  const inkLayer = new Uint8Array(canvasWidth * canvasHeight);
  const softRange = 40;
  for (let index = 0; index < scores.length; index += 1) {
    if (!connectedMask[index]) continue;
    const softness = (scores[index] - weakThreshold) / Math.max(1, threshold + softRange - weakThreshold);
    inkLayer[index] = Math.max(18, Math.min(220, Math.round(softness * 220)));
  }
  removeSmallInkComponents(inkLayer, canvasWidth, canvasHeight, Math.max(6, Math.round(canvasWidth * canvasHeight * 0.000018)));
  return tightenInkEdges(
    addInkToneVariation(inkLayer, stretchInkTones(tones, inkLayer), canvasWidth, canvasHeight),
    canvasWidth,
    canvasHeight
  );
}

function removeSmallInkComponents(mask: Uint8Array, width: number, height: number, minArea: number) {
  const visited = new Uint8Array(mask.length);
  const queue: number[] = [];
  const component: number[] = [];
  const directions = [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1];

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    queue.length = 0;
    component.length = 0;
    queue.push(start);
    visited[start] = 1;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      component.push(current);
      const x = current % width;

      for (const direction of directions) {
        const next = current + direction;
        if (next < 0 || next >= mask.length || visited[next] || !mask[next]) continue;
        const nextX = next % width;
        if (Math.abs(nextX - x) > 1) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }

    if (component.length < minArea) {
      for (const index of component) {
        mask[index] = 0;
      }
    }
  }
}

function getMaskBounds(mask: Uint8Array, width: number, height: number) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  if (maxX < minX || maxY < minY) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function drawTrimmedInk(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, inkLayer: Uint8Array, width: number, height: number) {
  const bounds = getMaskBounds(inkLayer, width, height);
  if (!bounds) return false;

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceCtx = sourceCanvas.getContext("2d");
  if (!sourceCtx) return false;

  const imageData = sourceCtx.createImageData(width, height);
  for (let index = 0; index < inkLayer.length; index += 1) {
    const pixelIndex = index * 4;
    const value = 255 - inkLayer[index];
    imageData.data[pixelIndex] = value;
    imageData.data[pixelIndex + 1] = value;
    imageData.data[pixelIndex + 2] = value;
    imageData.data[pixelIndex + 3] = 255;
  }
  sourceCtx.putImageData(imageData, 0, 0);

  const contentMaxSide = Math.round(normalizedUploadImageSize * (1 - trimmedInkPaddingRatio * 2));
  const scale = contentMaxSide / Math.max(bounds.width, bounds.height);
  const drawWidth = Math.max(1, Math.round(bounds.width * scale));
  const drawHeight = Math.max(1, Math.round(bounds.height * scale));
  const padding = Math.max(12, Math.round(Math.max(drawWidth, drawHeight) * trimmedInkPaddingRatio));
  const outputWidth = Math.min(normalizedUploadImageSize, drawWidth + padding * 2);
  const outputHeight = Math.min(normalizedUploadImageSize, drawHeight + padding * 2);
  const drawX = Math.round((outputWidth - drawWidth) / 2);
  const drawY = Math.round((outputHeight - drawHeight) / 2);

  canvas.width = outputWidth;
  canvas.height = outputHeight;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outputWidth, outputHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(sourceCanvas, bounds.x, bounds.y, bounds.width, bounds.height, drawX, drawY, drawWidth, drawHeight);
  refineInkCanvas(ctx, outputWidth, outputHeight);
  return true;
}

export function imageToBlackWhitePng(file: File) {
  return new Promise<File>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const sourceWidth = Math.max(1, image.naturalWidth || image.width);
      const sourceHeight = Math.max(1, image.naturalHeight || image.height);
      const scale = Math.min(normalizedUploadImageSize / sourceWidth, normalizedUploadImageSize / sourceHeight);
      const width = normalizedUploadImageSize;
      const height = normalizedUploadImageSize;
      const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
      const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
      const drawX = Math.round((width - drawWidth) / 2);
      const drawY = Math.round((height - drawHeight) / 2);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        reject(new Error("無法處理圖片"));
        return;
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);

      const imageData = ctx.getImageData(0, 0, width, height);
      const pixels = imageData.data;
      const inkLayer = buildInkLayer(pixels, width, height, {
        x: drawX,
        y: drawY,
        width: drawWidth,
        height: drawHeight,
      });
      if (!drawTrimmedInk(canvas, ctx, inkLayer, width, height)) {
        for (let index = 0; index < pixels.length; index += 4) {
          const value = 255 - inkLayer[index / 4];
          pixels[index] = value;
          pixels[index + 1] = value;
          pixels[index + 2] = value;
          pixels[index + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
      }

      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("無法產生黑白圖片"));
          return;
        }
        resolve(new File([blob], `${fileNameWithoutExtension(file.name)}_bw.png`, { type: "image/png" }));
      }, "image/png");
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("無法讀取圖片，請換一張圖試試"));
    };

    image.src = objectUrl;
  });
}

function canvasToPngFile(canvas: HTMLCanvasElement, fileName: string) {
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("無法更新預覽圖片"));
        return;
      }
      resolve(new File([blob], fileName, { type: "image/png" }));
    }, "image/png");
  });
}

export type ReplaceGlyphTarget = {
  id: number;
  char: string;
  author?: string | null;
  scriptType?: string | null;
  workTitle?: string | null;
  source?: string | null;
  license?: string | null;
  qualityScore?: number;
  imageUrl?: string | null;
};

export function AdminGlyphUploadForm({
  scriptOptions,
  isForbidden,
  onUploaded,
  replaceGlyph,
}: {
  scriptOptions: string[];
  isForbidden?: boolean;
  onUploaded?: () => void | Promise<void>;
  replaceGlyph?: ReplaceGlyphTarget | null;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isErasingUploadPreviewRef = useRef(false);
  const uploadUndoStackRef = useRef<ImageData[]>([]);
  const isReplacingGlyph = Boolean(replaceGlyph);
  const [uploadChar, setUploadChar] = useState("");
  const [uploadAuthor, setUploadAuthor] = useState("");
  const [uploadScriptType, setUploadScriptType] = useState("");
  const [uploadWorkTitle, setUploadWorkTitle] = useState("");
  const [uploadSource, setUploadSource] = useState("");
  const [uploadLicense, setUploadLicense] = useState("");
  const [uploadQualityScore, setUploadQualityScore] = useState("0");
  const [isComposingUploadChar, setIsComposingUploadChar] = useState(false);
  const [isComposingUploadAuthor, setIsComposingUploadAuthor] = useState(false);
  const [message, setMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessingUploadImage, setIsProcessingUploadImage] = useState(false);
  const [processedUploadFile, setProcessedUploadFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState("");
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadEraserSize, setUploadEraserSize] = useState(28);
  const [isErasingUploadPreview, setIsErasingUploadPreview] = useState(false);
  const [uploadUndoCount, setUploadUndoCount] = useState(0);
  const [uploadPreviewDimensions, setUploadPreviewDimensions] = useState<{ width: number; height: number } | null>(null);

  function clearUploadImage() {
    if (uploadPreviewUrl) {
      URL.revokeObjectURL(uploadPreviewUrl);
    }
    setProcessedUploadFile(null);
    setUploadPreviewUrl("");
    setUploadFileName("");
    setUploadPreviewDimensions(null);
    uploadUndoStackRef.current = [];
    setUploadUndoCount(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const canvas = uploadPreviewCanvasRef.current;
    if (!processedUploadFile || !canvas) {
      setMessage("請先選擇圖片，系統會先轉成黑白預覽");
      return;
    }

    setIsUploading(true);
    setMessage("上傳中...");
    const form = e.currentTarget;

    try {
      const formData = new FormData(form);
      const renderedFile = await canvasToPngFile(canvas, processedUploadFile.name);
      formData.set("char", onlyChinese(uploadChar).slice(0, 1));
      formData.set("author", onlyChinese(uploadAuthor));
      formData.set("scriptType", uploadScriptType === "未標註" ? "" : uploadScriptType);
      formData.set("workTitle", uploadWorkTitle);
      formData.set("source", uploadSource);
      formData.set("license", uploadLicense);
      formData.set("qualityScore", uploadQualityScore);
      formData.set("file", renderedFile, renderedFile.name);

      const endpoint = replaceGlyph ? `/api/glyphs/${replaceGlyph.id}/image` : "/api/admin/upload";
      const res = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error ?? "上傳失敗");
        return;
      }

      setMessage(
        replaceGlyph
          ? `已替換字圖 ID：${replaceGlyph.id} 的圖片`
          : `已新增字圖 ID：${json.id}，已存入 Blob：${json.blobName ?? json.imageUrl}`
      );
      if (!replaceGlyph) {
        setUploadChar("");
      }
      clearUploadImage();
      await onUploaded?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上傳失敗");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleUploadFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    clearUploadImage();
    setUploadFileName(file?.name ?? "");
    if (!file) return;
    if (!isAllowedUploadImage(file)) {
      setMessage(`請上傳支援的圖檔格式：${allowedUploadImageLabel}`);
      e.target.value = "";
      setUploadFileName("");
      return;
    }

    setIsProcessingUploadImage(true);
    setMessage("正在轉成黑白預覽...");
    try {
      const nextFile = await imageToBlackWhitePng(file);
      setProcessedUploadFile(nextFile);
      setUploadPreviewUrl(URL.createObjectURL(nextFile));
      uploadUndoStackRef.current = [];
      setUploadUndoCount(0);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "圖片處理失敗");
      e.target.value = "";
      setUploadFileName("");
    } finally {
      setIsProcessingUploadImage(false);
    }
  }

  function getUploadPreviewPoint(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = uploadPreviewCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width * canvas.width,
      y: (e.clientY - rect.top) / rect.height * canvas.height,
    };
  }

  function eraseUploadPreviewAt(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = uploadPreviewCanvasRef.current;
    const point = getUploadPreviewPoint(e);
    if (!canvas || !point) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(point.x, point.y, uploadEraserSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function pushUploadUndoState() {
    const canvas = uploadPreviewCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    uploadUndoStackRef.current = [
      ...uploadUndoStackRef.current.slice(-(maxUploadUndoSteps - 1)),
      ctx.getImageData(0, 0, canvas.width, canvas.height),
    ];
    setUploadUndoCount(uploadUndoStackRef.current.length);
  }

  function startUploadPreviewErase(e: PointerEvent<HTMLCanvasElement>) {
    if (!processedUploadFile) return;
    pushUploadUndoState();
    isErasingUploadPreviewRef.current = true;
    setIsErasingUploadPreview(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    eraseUploadPreviewAt(e);
  }

  function moveUploadPreviewErase(e: PointerEvent<HTMLCanvasElement>) {
    if (!isErasingUploadPreviewRef.current) return;
    eraseUploadPreviewAt(e);
  }

  async function finishUploadPreviewErase(e: PointerEvent<HTMLCanvasElement>) {
    if (!isErasingUploadPreviewRef.current) return;
    isErasingUploadPreviewRef.current = false;
    setIsErasingUploadPreview(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const canvas = uploadPreviewCanvasRef.current;
    if (!canvas || !processedUploadFile) return;
    try {
      const nextFile = await canvasToPngFile(canvas, processedUploadFile.name);
      if (uploadPreviewUrl) {
        URL.revokeObjectURL(uploadPreviewUrl);
      }
      setProcessedUploadFile(nextFile);
      setUploadPreviewUrl(URL.createObjectURL(nextFile));
      setUploadPreviewDimensions({ width: canvas.width, height: canvas.height });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法更新擦除後的圖片");
    }
  }

  async function undoUploadPreviewErase() {
    const canvas = uploadPreviewCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    const previousImage = uploadUndoStackRef.current.pop();
    if (!canvas || !ctx || !previousImage || !processedUploadFile) return;

    ctx.putImageData(previousImage, 0, 0);
    setUploadUndoCount(uploadUndoStackRef.current.length);
    try {
      const nextFile = await canvasToPngFile(canvas, processedUploadFile.name);
      if (uploadPreviewUrl) {
        URL.revokeObjectURL(uploadPreviewUrl);
      }
      setProcessedUploadFile(nextFile);
      setUploadPreviewUrl(URL.createObjectURL(nextFile));
      setUploadPreviewDimensions({ width: canvas.width, height: canvas.height });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法還原上一筆擦除");
    }
  }

  useEffect(() => {
    return () => {
      if (uploadPreviewUrl) {
        URL.revokeObjectURL(uploadPreviewUrl);
      }
    };
  }, [uploadPreviewUrl]);

  useEffect(() => {
    const canvas = uploadPreviewCanvasRef.current;
    if (!canvas || !uploadPreviewUrl) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const image = new window.Image();
    image.onload = () => {
      canvas.width = image.naturalWidth || normalizedUploadImageSize;
      canvas.height = image.naturalHeight || normalizedUploadImageSize;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      setUploadPreviewDimensions({ width: canvas.width, height: canvas.height });
    };
    image.src = uploadPreviewUrl;
  }, [uploadPreviewUrl]);

  useEffect(() => {
    if (!replaceGlyph) return;
    setUploadChar(onlyChinese(replaceGlyph.char).slice(0, 1));
    setUploadAuthor(onlyChinese(replaceGlyph.author ?? ""));
    setUploadScriptType(replaceGlyph.scriptType ?? "");
    setUploadWorkTitle(replaceGlyph.workTitle ?? "");
    setUploadSource(replaceGlyph.source ?? "");
    setUploadLicense(replaceGlyph.license ?? "");
    setUploadQualityScore(String(replaceGlyph.qualityScore ?? 0));
    setMessage("");
    clearUploadImage();
  }, [replaceGlyph?.id]);

  return (
    <form onSubmit={upload} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] lg:gap-5">
      <div className="space-y-3">
        <input
          name="char"
          required
          value={uploadChar}
          onCompositionStart={() => setIsComposingUploadChar(true)}
          onCompositionEnd={(e) => {
            setIsComposingUploadChar(false);
            setUploadChar(onlyChinese(e.currentTarget.value).slice(0, 1));
          }}
          onChange={(e) => {
            const nativeEvent = e.nativeEvent as InputEvent;
            const nextValue =
              isComposingUploadChar || nativeEvent.isComposing
                ? e.target.value
                : onlyChinese(e.target.value).slice(0, 1);
            setUploadChar(nextValue);
          }}
          placeholder="單字，例如：小"
          disabled={isUploading}
          className="min-h-12 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-3 outline-none focus:border-red-700"
          autoComplete="off"
        />
        <input
          name="file"
          ref={fileInputRef}
          type="file"
          accept={uploadImageAccept}
          capture="environment"
          onChange={(e) => void handleUploadFileChange(e)}
          disabled={isUploading || isProcessingUploadImage}
          className="min-h-12 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-3 text-sm disabled:opacity-70"
        />
        <input
          name="author"
          value={uploadAuthor}
          onCompositionStart={() => setIsComposingUploadAuthor(true)}
          onCompositionEnd={(e) => {
            setIsComposingUploadAuthor(false);
            setUploadAuthor(onlyChinese(e.currentTarget.value));
          }}
          onChange={(e) => {
            const nativeEvent = e.nativeEvent as InputEvent;
            setUploadAuthor(
              isComposingUploadAuthor || nativeEvent.isComposing ? e.target.value : onlyChinese(e.target.value)
            );
          }}
          placeholder="作者，例如：孫過庭"
          disabled={isUploading}
          className="min-h-12 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-3 outline-none focus:border-red-700"
          autoComplete="off"
        />
        <select
          name="scriptType"
          value={uploadScriptType}
          onChange={(e) => setUploadScriptType(e.target.value)}
          disabled={isUploading}
          className="min-h-12 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-3 outline-none focus:border-red-700"
        >
          <option value="">書體</option>
          {scriptOptions.map((scriptType) => (
            <option key={scriptType} value={scriptType}>
              {scriptType}
            </option>
          ))}
        </select>
        <input name="workTitle" value={uploadWorkTitle} onChange={(e) => setUploadWorkTitle(e.target.value)} placeholder="作品，例如：書譜" disabled={isUploading} className="min-h-12 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-3 outline-none focus:border-red-700 disabled:opacity-70" />
        <input name="source" value={uploadSource} onChange={(e) => setUploadSource(e.target.value)} placeholder="來源，例如：local-dataset" disabled={isUploading} className="min-h-12 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-3 outline-none focus:border-red-700 disabled:opacity-70" />
        <input name="license" value={uploadLicense} onChange={(e) => setUploadLicense(e.target.value)} placeholder="授權，例如：non-commercial-research" disabled={isUploading} className="min-h-12 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-3 outline-none focus:border-red-700 disabled:opacity-70" />
        <input name="qualityScore" type="number" value={uploadQualityScore} onChange={(e) => setUploadQualityScore(e.target.value)} placeholder="品質分數(排序用)" disabled={isUploading} className="min-h-12 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-3 outline-none focus:border-red-700 disabled:opacity-70" />
        <button disabled={isForbidden || isUploading || isProcessingUploadImage || !processedUploadFile} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-800 px-4 py-3 font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-red-800">
          {isUploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {isUploading ? "上傳中" : isReplacingGlyph ? "替換字圖圖片" : "上傳並寫入資料庫"}
        </button>
        {message && <div className="rounded-xl bg-stone-50 p-3 text-sm text-stone-600">{message}</div>}
      </div>

      <div className="space-y-3">
        {replaceGlyph?.imageUrl && (
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-stone-500">
              <span className="truncate">原本的字圖</span>
              <span className="shrink-0">ID {replaceGlyph.id}</span>
            </div>
            <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-white">
              <img
                src={replaceGlyph.imageUrl}
                alt={`${replaceGlyph.char} 原本的字圖`}
                className="max-h-full max-w-full object-contain p-4"
              />
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs text-stone-500">
          <span className="truncate">{uploadFileName || (isReplacingGlyph ? "新的 Canvas 預覽" : "黑白預覽")}</span>
          <span className="shrink-0">
            {uploadPreviewDimensions
              ? `${uploadPreviewDimensions.width}x${uploadPreviewDimensions.height}`
              : `最長邊 ${normalizedUploadImageSize}px`}
          </span>
          {isProcessingUploadImage && <RefreshCw className="h-4 w-4 animate-spin" />}
        </div>
        {uploadPreviewUrl && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-700">
            <Eraser className={`h-4 w-4 ${isErasingUploadPreview ? "text-red-700" : "text-stone-500"}`} />
            <input
              type="range"
              min="8"
              max="80"
              value={uploadEraserSize}
              onChange={(e) => setUploadEraserSize(Number(e.target.value))}
              disabled={isUploading}
              className="min-w-0 flex-1 accent-red-800"
              aria-label="擦除大小"
            />
            <span className="w-10 text-right text-xs text-stone-500">{uploadEraserSize}px</span>
            <button
              type="button"
              onClick={() => void undoUploadPreviewErase()}
              disabled={isUploading || isErasingUploadPreview || uploadUndoCount === 0}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-stone-200 text-stone-600 hover:border-red-700 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="還原上一筆擦除"
              title="還原上一筆擦除"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-white">
          {uploadPreviewUrl ? (
            <canvas
              ref={uploadPreviewCanvasRef}
              width={uploadPreviewSize}
              height={uploadPreviewSize}
              onPointerDown={startUploadPreviewErase}
              onPointerMove={moveUploadPreviewErase}
              onPointerUp={(e) => void finishUploadPreviewErase(e)}
              onPointerCancel={(e) => void finishUploadPreviewErase(e)}
              className="max-h-full max-w-full touch-none bg-white"
              style={{ aspectRatio: `${uploadPreviewDimensions?.width ?? 1} / ${uploadPreviewDimensions?.height ?? 1}` }}
              aria-label="黑白字圖預覽，可直接擦除"
            />
          ) : (
            <span className="px-4 text-center text-sm text-stone-500">
              選擇或拍攝圖檔後，這裡會顯示黑白化與裁放後的預覽。
            </span>
          )}
        </div>
        </div>
      </div>
    </form>
  );
}
