"use client";

import { ChangeEvent, DragEvent, FormEvent, KeyboardEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { Check, Copy, Eraser, GripVertical, Maximize2, Minimize2, Pencil, RefreshCw, RotateCcw, Scissors, Upload, X } from "lucide-react";

const uploadPreviewSize = 320;
const normalizedUploadImageSize = 1024;
const batchSplitAnalysisMaxSide = 2200;
const maxUploadUndoSteps = 6;
const trimmedInkPaddingRatio = 0.08;
const minimumRenderedInk = 208;
const eraserCursor =
  'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2732%27 height=%2732%27 viewBox=%270 0 32 32%27%3E%3Cg transform=%27rotate(-35 16 16)%27%3E%3Crect x=%278%27 y=%2713%27 width=%2717%27 height=%279%27 rx=%272%27 fill=%27%23fff%27 stroke=%27%23292524%27 stroke-width=%272%27/%3E%3Cpath d=%27M13 13v9%27 stroke=%27%23b91c1c%27 stroke-width=%272%27/%3E%3C/g%3E%3Cpath d=%27M5 26h18%27 stroke=%27%23292524%27 stroke-width=%272%27 stroke-linecap=%27round%27/%3E%3C/svg%3E") 8 24, crosshair';
const allowedUploadImageExtensions = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
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
type UploadProcessOptions = {
  edgeSoftness: number;
  inkStrength: number;
  foregroundSeparation: number;
  noiseReduction: number;
};

const defaultUploadProcessOptions: UploadProcessOptions = {
  edgeSoftness: 58,
  inkStrength: 62,
  foregroundSeparation: 58,
  noiseReduction: 44,
};
const uploadQualityPresets: { label: string; options: UploadProcessOptions }[] = [
  { label: "柔邊", options: { edgeSoftness: 78, inkStrength: 58, foregroundSeparation: 52, noiseReduction: 38 } },
  { label: "濃墨", options: { edgeSoftness: 48, inkStrength: 86, foregroundSeparation: 60, noiseReduction: 48 } },
  { label: "保留細節", options: { edgeSoftness: 28, inkStrength: 66, foregroundSeparation: 42, noiseReduction: 18 } },
  { label: "印章/紅字", options: { edgeSoftness: 38, inkStrength: 92, foregroundSeparation: 70, noiseReduction: 58 } },
];

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

function smoothStep(edge0: number, edge1: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function refineInkCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: UploadProcessOptions = defaultUploadProcessOptions
) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const softness = Math.max(0, Math.min(1, options.edgeSoftness / 100));
  const strength = Math.max(0, Math.min(1, options.inkStrength / 100));
  const edgeStart = 0.06 + softness * 0.08;
  const edgeEnd = 0.3 + softness * 0.28;
  const gamma = 1.02 - strength * 0.28 + softness * 0.1;
  const coreMinimumInk = minimumRenderedInk * (0.7 + strength * 0.42);

  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = getLuminance(pixels[index], pixels[index + 1], pixels[index + 2]);
    const ink = 255 - luminance;
    let enhancedInk = 0;
    if (ink > 8) {
      const density = Math.max(0, Math.min(1, (ink - 8) / 247));
      const edgeFeather = smoothStep(edgeStart, edgeEnd, density);
      const tonalInk = 255 * Math.pow(density, gamma) * (0.86 + strength * 0.24);
      const coreInk = coreMinimumInk * edgeFeather;
      enhancedInk = Math.max(tonalInk, coreInk);
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
  return buildInkLayerWithOptions(pixels, canvasWidth, canvasHeight, bounds, defaultUploadProcessOptions);
}

function buildInkLayerWithOptions(
  pixels: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  bounds: ImageBounds,
  options: UploadProcessOptions = defaultUploadProcessOptions
) {
  const backgroundLuminance = getLuminancePercentile(pixels, canvasWidth, bounds, 0.9);
  const scoreHistogram = new Array<number>(256).fill(0);
  const scores = new Uint8Array(canvasWidth * canvasHeight);
  const tones = new Uint8Array(canvasWidth * canvasHeight);
  const separation = Math.max(0, Math.min(1, options.foregroundSeparation / 100));
  const noiseReduction = Math.max(0, Math.min(1, options.noiseReduction / 100));
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
  const tunedThreshold = Math.max(24, Math.min(170, threshold + Math.round((separation - 0.5) * 52)));
  const weakThreshold = Math.max(14, tunedThreshold - Math.round(60 - separation * 34));
  const weakMask = new Uint8Array(canvasWidth * canvasHeight);
  const strongMask = new Uint8Array(canvasWidth * canvasHeight);
  for (let index = 0; index < scores.length; index += 1) {
    weakMask[index] = scores[index] >= weakThreshold ? 1 : 0;
    strongMask[index] = scores[index] >= tunedThreshold ? 1 : 0;
  }
  const connectedMask = keepWeakInkConnectedToStrong(weakMask, strongMask, canvasWidth);
  const inkLayer = new Uint8Array(canvasWidth * canvasHeight);
  const softRange = 40;
  for (let index = 0; index < scores.length; index += 1) {
    if (!connectedMask[index]) continue;
    const softness = (scores[index] - weakThreshold) / Math.max(1, tunedThreshold + softRange - weakThreshold);
    inkLayer[index] = Math.max(18, Math.min(220, Math.round(softness * 220)));
  }
  removeSmallInkComponents(
    inkLayer,
    canvasWidth,
    canvasHeight,
    Math.max(3, Math.round(canvasWidth * canvasHeight * (0.000006 + noiseReduction * 0.000036)))
  );
  return tightenInkEdges(
    addInkToneVariation(inkLayer, stretchInkTones(tones, inkLayer), canvasWidth, canvasHeight),
    canvasWidth,
    canvasHeight
  );
}

function buildColorInkLayer(pixels: Uint8ClampedArray, canvasWidth: number, canvasHeight: number, bounds: ImageBounds) {
  const layer = new Uint8Array(canvasWidth * canvasHeight);
  let colorSamples = 0;
  let totalSamples = 0;

  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const pixelIndex = (y * canvasWidth + x) * 4;
      if (pixels[pixelIndex + 3] < 12) continue;
      totalSamples += 1;

      const red = pixels[pixelIndex];
      const green = pixels[pixelIndex + 1];
      const blue = pixels[pixelIndex + 2];
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const chroma = max - min;
      const warmInk = red > green + 12 && green > blue + 8;
      const colorScore = chroma + Math.max(0, red - blue) * 0.55 + Math.max(0, green - blue) * 0.28;
      const paperBrightness = (red + green + blue) / 3;

      if (chroma > 26 && warmInk && paperBrightness < 230 && colorScore > 58) {
        colorSamples += 1;
        layer[y * canvasWidth + x] = Math.max(170, Math.min(255, Math.round(colorScore * 1.55)));
      }
    }
  }

  if (colorSamples < Math.max(60, totalSamples * 0.0008)) return null;
  removeSmallInkComponents(layer, canvasWidth, canvasHeight, Math.max(8, Math.round(canvasWidth * canvasHeight * 0.000015)));
  return layer;
}

function buildBatchInkLayer(pixels: Uint8ClampedArray, canvasWidth: number, canvasHeight: number, bounds: ImageBounds) {
  const colorLayer = buildColorInkLayer(pixels, canvasWidth, canvasHeight, bounds);
  const darkLayer = buildInkLayer(pixels, canvasWidth, canvasHeight, bounds);
  if (!colorLayer) return darkLayer;

  let colorCount = 0;
  let darkCount = 0;
  for (let index = 0; index < colorLayer.length; index += 1) {
    if (colorLayer[index]) colorCount += 1;
    if (darkLayer[index]) darkCount += 1;
  }

  return colorCount > darkCount * 0.55 ? colorLayer : darkLayer;
}

function buildRuledInkLayer(pixels: Uint8ClampedArray, canvasWidth: number, canvasHeight: number, bounds: ImageBounds) {
  const layer = new Uint8Array(canvasWidth * canvasHeight);

  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const pixelIndex = (y * canvasWidth + x) * 4;
      if (pixels[pixelIndex + 3] < 12 || isRedRulePixel(pixels, pixelIndex)) continue;

      const red = pixels[pixelIndex];
      const green = pixels[pixelIndex + 1];
      const blue = pixels[pixelIndex + 2];
      const luminance = getLuminance(red, green, blue);
      const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
      const darkness = 255 - luminance;
      if (darkness > 48 && chroma < 92) {
        layer[y * canvasWidth + x] = Math.max(minimumRenderedInk, Math.min(255, Math.round(darkness * 1.45)));
      }
    }
  }

  removeSmallInkComponents(layer, canvasWidth, canvasHeight, Math.max(4, Math.round(canvasWidth * canvasHeight * 0.000008)));
  return layer;
}

function getPaperBounds(pixels: Uint8ClampedArray, canvasWidth: number, canvasHeight: number) {
  let minX = canvasWidth;
  let minY = canvasHeight;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < canvasHeight; y += 1) {
    for (let x = 0; x < canvasWidth; x += 1) {
      const index = (y * canvasWidth + x) * 4;
      if (pixels[index + 3] < 12) continue;
      const luminance = getLuminance(pixels[index], pixels[index + 1], pixels[index + 2]);
      const chroma = Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) - Math.min(pixels[index], pixels[index + 1], pixels[index + 2]);
      if (luminance < 70 && chroma < 42) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
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

function drawTrimmedInk(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  inkLayer: Uint8Array,
  width: number,
  height: number,
  options: UploadProcessOptions = defaultUploadProcessOptions
) {
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
    const ink = inkLayer[index] ? Math.max(minimumRenderedInk, inkLayer[index]) : 0;
    const value = 255 - ink;
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
  refineInkCanvas(ctx, outputWidth, outputHeight, options);
  return true;
}

export function imageToBlackWhitePng(file: File, options: UploadProcessOptions = defaultUploadProcessOptions) {
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
      const inkLayer = buildInkLayerWithOptions(pixels, width, height, {
        x: drawX,
        y: drawY,
        width: drawWidth,
        height: drawHeight,
      }, options);
      if (!drawTrimmedInk(canvas, ctx, inkLayer, width, height, options)) {
        for (let index = 0; index < pixels.length; index += 4) {
          const ink = inkLayer[index / 4] ? Math.max(minimumRenderedInk, inkLayer[index / 4]) : 0;
          const value = 255 - ink;
          pixels[index] = value;
          pixels[index + 1] = value;
          pixels[index + 2] = value;
          pixels[index + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
        refineInkCanvas(ctx, width, height, options);
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

export type UploadColorMode = "bw" | "grayscale" | "original";

function imageToGrayscalePng(file: File) {
  return new Promise<File>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const sourceWidth = Math.max(1, image.naturalWidth || image.width);
      const sourceHeight = Math.max(1, image.naturalHeight || image.height);
      const scale = Math.min(normalizedUploadImageSize / sourceWidth, normalizedUploadImageSize / sourceHeight);
      const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
      const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
      const drawX = Math.round((normalizedUploadImageSize - drawWidth) / 2);
      const drawY = Math.round((normalizedUploadImageSize - drawHeight) / 2);
      const canvas = document.createElement("canvas");
      canvas.width = normalizedUploadImageSize;
      canvas.height = normalizedUploadImageSize;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) { reject(new Error("無法處理圖片")); return; }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, normalizedUploadImageSize, normalizedUploadImageSize);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      const imageData = ctx.getImageData(0, 0, normalizedUploadImageSize, normalizedUploadImageSize);
      const pixels = imageData.data;
      for (let i = 0; i < pixels.length; i += 4) {
        const gray = Math.round(getLuminance(pixels[i], pixels[i + 1], pixels[i + 2]));
        pixels[i] = gray;
        pixels[i + 1] = gray;
        pixels[i + 2] = gray;
      }
      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error("無法產生灰階圖片")); return; }
        resolve(new File([blob], `${fileNameWithoutExtension(file.name)}_gray.png`, { type: "image/png" }));
      }, "image/png");
    };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("無法讀取圖片，請換一張圖試試")); };
    image.src = objectUrl;
  });
}

function imageToNormalizedPng(file: File) {
  return new Promise<File>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const sourceWidth = Math.max(1, image.naturalWidth || image.width);
      const sourceHeight = Math.max(1, image.naturalHeight || image.height);
      const scale = Math.min(normalizedUploadImageSize / sourceWidth, normalizedUploadImageSize / sourceHeight);
      const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
      const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
      const drawX = Math.round((normalizedUploadImageSize - drawWidth) / 2);
      const drawY = Math.round((normalizedUploadImageSize - drawHeight) / 2);
      const canvas = document.createElement("canvas");
      canvas.width = normalizedUploadImageSize;
      canvas.height = normalizedUploadImageSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("無法處理圖片")); return; }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, normalizedUploadImageSize, normalizedUploadImageSize);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error("無法產生圖片")); return; }
        resolve(new File([blob], `${fileNameWithoutExtension(file.name)}_orig.png`, { type: "image/png" }));
      }, "image/png");
    };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("無法讀取圖片，請換一張圖試試")); };
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

function imageFileToThumbnailPng(file: File, fileName: string) {
  return new Promise<File>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const size = 256;
      const sourceWidth = Math.max(1, image.naturalWidth || image.width);
      const sourceHeight = Math.max(1, image.naturalHeight || image.height);
      const scale = Math.min(size / sourceWidth, size / sourceHeight);
      const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
      const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("無法產生縮圖"));
        return;
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, Math.round((size - drawWidth) / 2), Math.round((size - drawHeight) / 2), drawWidth, drawHeight);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("無法產生縮圖"));
          return;
        }
        resolve(new File([blob], fileName, { type: "image/png" }));
      }, "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("無法讀取縮圖來源"));
    };
    image.src = objectUrl;
  });
}

const FEATHER_RATIO = 0.3; // 外圈 30% 半徑範圍做羽化過渡

function smoothFeatherBlend(dist: number, innerRadius: number, featherR: number): number {
  if (dist <= innerRadius) return 1;
  const fade = Math.min(1, (dist - innerRadius) / featherR);
  return 1 - fade * fade * (3 - 2 * fade); // smoothstep
}

// 確定性紙面材質雜湊，同一座標每次回傳相同值
function paperTextureAt(x: number, y: number): number {
  const hi = (Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1;
  const lo = Math.sin(x * 3.7 + y * 5.3) * 0.5 + Math.cos(x * 5.1 + y * 2.9) * 0.5;
  return (hi - Math.floor(hi)) * 2 - 1 + lo * 0.4; // 高頻 + 低頻起伏
}

function featheredWhiteFillAt(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) {
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  const innerRadius = radius * (1 - FEATHER_RATIO);
  const featherR = radius - innerRadius;

  const x0 = Math.max(0, Math.floor(cx - radius - 1));
  const y0 = Math.max(0, Math.floor(cy - radius - 1));
  const x1 = Math.min(cw, Math.ceil(cx + radius + 1));
  const y1 = Math.min(ch, Math.ceil(cy + radius + 1));
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return;

  const data = ctx.getImageData(x0, y0, w, h);
  const px = data.data;
  const orig = new Uint8ClampedArray(px);

  for (let iy = y0; iy < y1; iy++) {
    const dy = iy - cy;
    for (let ix = x0; ix < x1; ix++) {
      const dist = Math.hypot(ix - cx, dy);
      if (dist > radius) continue;
      const blend = smoothFeatherBlend(dist, innerRadius, featherR);
      const pi = ((iy - y0) * w + (ix - x0)) * 4;
      px[pi]     = Math.round(orig[pi]     * (1 - blend) + 255 * blend);
      px[pi + 1] = Math.round(orig[pi + 1] * (1 - blend) + 255 * blend);
      px[pi + 2] = Math.round(orig[pi + 2] * (1 - blend) + 255 * blend);
      px[pi + 3] = 255;
    }
  }
  ctx.putImageData(data, x0, y0);
}

function contentAwareFillAt(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) {
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  const ringWidth = Math.max(8, Math.round(radius * 0.6));
  const innerRadius = radius * (1 - FEATHER_RATIO);
  const featherR = radius - innerRadius;

  const x0 = Math.max(0, Math.floor(cx - radius - ringWidth - 1));
  const y0 = Math.max(0, Math.floor(cy - radius - ringWidth - 1));
  const x1 = Math.min(cw, Math.ceil(cx + radius + ringWidth + 1));
  const y1 = Math.min(ch, Math.ceil(cy + radius + ringWidth + 1));
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return;

  const data = ctx.getImageData(x0, y0, w, h);
  const px = data.data;
  const orig = new Uint8ClampedArray(px);

  // Step 1: 從圓形外環（360度）全方向取樣，收集亮度值
  type Sample = { lum: number; r: number; g: number; b: number };
  const ringPixels: Sample[] = [];
  const angleStep = Math.max(0.05, 1 / (radius + ringWidth));
  for (let angle = 0; angle < Math.PI * 2; angle += angleStep) {
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    for (let r = radius + 1; r <= radius + ringWidth; r += 1) {
      const sx = Math.round(cx + cosA * r);
      const sy = Math.round(cy + sinA * r);
      if (sx < x0 || sx >= x1 || sy < y0 || sy >= y1) continue;
      const si = ((sy - y0) * w + (sx - x0)) * 4;
      const rv = orig[si], gv = orig[si + 1], bv = orig[si + 2];
      ringPixels.push({ lum: 0.299 * rv + 0.587 * gv + 0.114 * bv, r: rv, g: gv, b: bv });
    }
  }

  // Step 2: 去掉空白像素，取非空白中亮度第 80 百分位的像素作為填充色；
  // 全為空白時直接用純白填充
  const NEAR_WHITE = 252;
  let bgR = 255, bgG = 255, bgB = 255;
  if (ringPixels.length > 0) {
    const nonWhite = ringPixels.filter((p) => p.lum <= NEAR_WHITE);
    if (nonWhite.length > 0) {
      nonWhite.sort((a, b) => a.lum - b.lum); // 從暗到亮排列
      const p80 = nonWhite[Math.min(nonWhite.length - 1, Math.floor(nonWhite.length * 0.8))];
      bgR = p80.r; bgG = p80.g; bgB = p80.b;
    }
    // nonWhite.length === 0 → 全空白，維持預設純白
  }

  // Step 3: 用背景色＋紙面材質填充圓形範圍，套用羽化
  const TEXTURE_STRENGTH = 10;
  for (let iy = y0; iy < y1; iy++) {
    const dy = iy - cy;
    for (let ix = x0; ix < x1; ix++) {
      const dist = Math.hypot(ix - cx, dy);
      if (dist > radius) continue;
      const blend = smoothFeatherBlend(dist, innerRadius, featherR);
      const pi = ((iy - y0) * w + (ix - x0)) * 4;
      const noise = paperTextureAt(ix, iy) * TEXTURE_STRENGTH * blend;
      px[pi]     = Math.min(255, Math.max(0, Math.round(orig[pi]     * (1 - blend) + bgR * blend + noise)));
      px[pi + 1] = Math.min(255, Math.max(0, Math.round(orig[pi + 1] * (1 - blend) + bgG * blend + noise)));
      px[pi + 2] = Math.min(255, Math.max(0, Math.round(orig[pi + 2] * (1 - blend) + bgB * blend + noise)));
      px[pi + 3] = 255;
    }
  }
  ctx.putImageData(data, x0, y0);
}

function canvasToCenteredGlyphFile(canvas: HTMLCanvasElement, fileName: string) {
  return new Promise<File>((resolve, reject) => {
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = canvas.width;
    sourceCanvas.height = canvas.height;
    const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
    if (!sourceCtx) {
      reject(new Error("無法整理編輯後的圖片"));
      return;
    }

    sourceCtx.fillStyle = "#ffffff";
    sourceCtx.fillRect(0, 0, canvas.width, canvas.height);
    sourceCtx.drawImage(canvas, 0, 0);

    const imageData = sourceCtx.getImageData(0, 0, canvas.width, canvas.height);
    const inkLayer = new Uint8Array(canvas.width * canvas.height);
    for (let index = 0; index < inkLayer.length; index += 1) {
      const pixelIndex = index * 4;
      const luminance = getLuminance(imageData.data[pixelIndex], imageData.data[pixelIndex + 1], imageData.data[pixelIndex + 2]);
      const ink = Math.max(0, 255 - luminance);
      if (ink > 10) {
        const density = Math.max(0, Math.min(1, (ink - 10) / 245));
        const edgeFeather = smoothStep(0.12, 0.44, density);
        inkLayer[index] = Math.min(255, Math.round(Math.max(ink * 1.05, 180 * edgeFeather)));
      }
    }
    removeSmallInkComponents(inkLayer, canvas.width, canvas.height, Math.max(3, Math.round(canvas.width * canvas.height * 0.000012)));

    if (!drawTrimmedInk(sourceCanvas, sourceCtx, inkLayer, canvas.width, canvas.height)) {
      reject(new Error("編輯後沒有可保留的墨跡"));
      return;
    }

    sourceCanvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("無法產生編輯後圖片"));
        return;
      }
      resolve(new File([blob], fileName, { type: "image/png" }));
    }, "image/png");
  });
}

function canvasToCenteredColorFile(canvas: HTMLCanvasElement, fileName: string, colorMode: "grayscale" | "original") {
  return new Promise<File>((resolve, reject) => {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) { reject(new Error("無法處理圖片")); return; }

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (pixels[i] < 250 || pixels[i + 1] < 250 || pixels[i + 2] < 250) {
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
      }
    }
    if (maxX < minX || maxY < minY) { reject(new Error("圖片中沒有可保留的內容")); return; }

    const pad = Math.max(12, Math.round(Math.max(maxX - minX, maxY - minY) * trimmedInkPaddingRatio));
    const srcX = Math.max(0, minX - pad);
    const srcY = Math.max(0, minY - pad);
    const srcW = Math.min(canvas.width, maxX + pad + 1) - srcX;
    const srcH = Math.min(canvas.height, maxY + pad + 1) - srcY;

    const size = normalizedUploadImageSize;
    const scale = Math.min(size / srcW, size / srcH) * (1 - trimmedInkPaddingRatio * 2);
    const drawW = Math.max(1, Math.round(srcW * scale));
    const drawH = Math.max(1, Math.round(srcH * scale));
    const drawX = Math.round((size - drawW) / 2);
    const drawY = Math.round((size - drawH) / 2);

    const out = document.createElement("canvas");
    out.width = size; out.height = size;
    const outCtx = out.getContext("2d", { willReadFrequently: colorMode === "grayscale" });
    if (!outCtx) { reject(new Error("無法處理圖片")); return; }
    outCtx.fillStyle = "#ffffff";
    outCtx.fillRect(0, 0, size, size);
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = "high";
    outCtx.drawImage(canvas, srcX, srcY, srcW, srcH, drawX, drawY, drawW, drawH);

    if (colorMode === "grayscale") {
      const d = outCtx.getImageData(0, 0, size, size);
      for (let i = 0; i < d.data.length; i += 4) {
        const gray = Math.round(getLuminance(d.data[i], d.data[i + 1], d.data[i + 2]));
        d.data[i] = gray; d.data[i + 1] = gray; d.data[i + 2] = gray;
      }
      outCtx.putImageData(d, 0, 0);
    }

    const suffix = colorMode === "grayscale" ? "_gray" : "_orig";
    const base = fileNameWithoutExtension(fileName).replace(/_(bw|gray|orig)$/, "");
    out.toBlob((blob) => {
      if (!blob) { reject(new Error("無法產生圖片")); return; }
      resolve(new File([blob], `${base}${suffix}.png`, { type: "image/png" }));
    }, "image/png");
  });
}

type BatchSplitDirection = "auto" | "horizontal" | "vertical" | "grid" | "ruled" | "manual";

type SplitGlyphImage = {
  file: File;
  previewUrl: string;
  bounds: ImageBounds;
};

type BatchGlyphItem = SplitGlyphImage & {
  id: string;
  char: string;
  cropAdjustment: number;
  status: "idle" | "uploading" | "done" | "error";
  message?: string;
  colorMode?: UploadColorMode;
  hasManualEdit?: boolean;
};

function mergeCloseRuns(runs: { start: number; end: number }[], maxGap: number) {
  if (runs.length <= 1) return runs;
  const merged: { start: number; end: number }[] = [];
  for (const run of runs) {
    const previous = merged[merged.length - 1];
    if (previous && run.start - previous.end - 1 <= maxGap) {
      previous.end = run.end;
    } else {
      merged.push({ ...run });
    }
  }
  return merged;
}

function getInkRuns(projection: number[], minInk: number, maxGap: number) {
  const runs: { start: number; end: number }[] = [];
  let start = -1;
  for (let index = 0; index < projection.length; index += 1) {
    if (projection[index] >= minInk) {
      if (start < 0) start = index;
    } else if (start >= 0) {
      runs.push({ start, end: index - 1 });
      start = -1;
    }
  }
  if (start >= 0) runs.push({ start, end: projection.length - 1 });
  return mergeCloseRuns(runs, maxGap);
}

function getSegmentBoundsFromRuns(
  mask: Uint8Array,
  width: number,
  height: number,
  runs: { start: number; end: number }[],
  direction: Exclude<BatchSplitDirection, "auto">,
  options: { keepEmpty?: boolean } = {}
) {
  return runs
    .map((run) => {
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;

      if (direction === "horizontal") {
        for (let y = 0; y < height; y += 1) {
          for (let x = run.start; x <= run.end; x += 1) {
            if (!mask[y * width + x]) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      } else {
        for (let y = run.start; y <= run.end; y += 1) {
          for (let x = 0; x < width; x += 1) {
            if (!mask[y * width + x]) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }

      if (maxX < minX || maxY < minY) {
        if (!options.keepEmpty) return null;
        return direction === "horizontal"
          ? { x: run.start, y: 0, width: run.end - run.start + 1, height }
          : { x: 0, y: run.start, width, height: run.end - run.start + 1 };
      }
      return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
    })
    .filter((bounds): bounds is ImageBounds => Boolean(bounds));
}

function getSplitBounds(mask: Uint8Array, width: number, height: number, direction: BatchSplitDirection) {
  const columnProjection = new Array<number>(width).fill(0);
  const rowProjection = new Array<number>(height).fill(0);
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    columnProjection[x] += 1;
    rowProjection[y] += 1;
  }

  const columnRuns = getInkRuns(columnProjection, Math.max(2, Math.round(height * 0.002)), Math.max(8, Math.round(width * 0.012)));
  const rowRuns = getInkRuns(rowProjection, Math.max(2, Math.round(width * 0.002)), Math.max(8, Math.round(height * 0.012)));
  if (direction === "grid") {
    return getGridSplitBounds(mask, width, height, columnRuns, rowRuns);
  }
  const splitDirection =
    direction === "auto"
      ? columnRuns.length >= rowRuns.length
        ? "horizontal"
        : "vertical"
      : direction;
  const runs = splitDirection === "horizontal" ? columnRuns : rowRuns;
  return getSegmentBoundsFromRuns(mask, width, height, runs, splitDirection);
}

function getCellBounds(
  mask: Uint8Array,
  width: number,
  columnRun: { start: number; end: number },
  rowRun: { start: number; end: number }
) {
  let minX = columnRun.end + 1;
  let minY = rowRun.end + 1;
  let maxX = -1;
  let maxY = -1;

  for (let y = rowRun.start; y <= rowRun.end; y += 1) {
    for (let x = columnRun.start; x <= columnRun.end; x += 1) {
      if (!mask[y * width + x]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function getGridSplitBounds(
  mask: Uint8Array,
  width: number,
  height: number,
  columnRuns: { start: number; end: number }[],
  rowRuns: { start: number; end: number }[]
) {
  if (columnRuns.length < 2) {
    return getSegmentBoundsFromRuns(mask, width, height, rowRuns.length >= columnRuns.length ? rowRuns : columnRuns, rowRuns.length >= columnRuns.length ? "vertical" : "horizontal");
  }

  const boundsList: ImageBounds[] = [];
  const orderedColumns = [...columnRuns].sort((a, b) => b.start - a.start);

  for (const columnRun of orderedColumns) {
    const columnProjection = new Array<number>(height).fill(0);
    for (let y = 0; y < height; y += 1) {
      for (let x = columnRun.start; x <= columnRun.end; x += 1) {
        if (mask[y * width + x]) columnProjection[y] += 1;
      }
    }
    const columnRows = getInkRuns(
      columnProjection,
      Math.max(1, Math.round((columnRun.end - columnRun.start + 1) * 0.018)),
      Math.max(4, Math.round(height * 0.008))
    );

    for (const rowRun of columnRows) {
      const bounds = getCellBounds(mask, width, columnRun, rowRun);
      if (bounds && bounds.width * bounds.height >= width * height * 0.00018) {
        boundsList.push(bounds);
      }
    }
  }

  return boundsList;
}

function isRedRulePixel(pixels: Uint8ClampedArray, index: number) {
  const red = pixels[index];
  const green = pixels[index + 1];
  const blue = pixels[index + 2];
  return red > 115 && red > green + 18 && red > blue + 18 && Math.max(red, green, blue) - Math.min(red, green, blue) > 26;
}

function getRunCenters(runs: { start: number; end: number }[]) {
  return runs.map((run) => Math.round((run.start + run.end) / 2));
}

function getInkBoundsInRect(mask: Uint8Array, width: number, rect: ImageBounds) {
  let minX = rect.x + rect.width;
  let minY = rect.y + rect.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      if (!mask[y * width + x]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function getRuledGridBounds(pixels: Uint8ClampedArray, inkLayer: Uint8Array, width: number, height: number) {
  const columnProjection = new Array<number>(width).fill(0);
  const rowProjection = new Array<number>(height).fill(0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (!isRedRulePixel(pixels, index)) continue;
      columnProjection[x] += 1;
      rowProjection[y] += 1;
    }
  }

  const columnCenters = getRunCenters(
    getInkRuns(columnProjection, Math.max(8, Math.round(height * 0.16)), Math.max(3, Math.round(width * 0.004)))
  );
  const rowCenters = getRunCenters(
    getInkRuns(rowProjection, Math.max(8, Math.round(width * 0.16)), Math.max(3, Math.round(height * 0.004)))
  );

  if (columnCenters.length < 2 || rowCenters.length < 2) return [];

  const boundsList: ImageBounds[] = [];
  const margin = Math.max(3, Math.round(Math.min(width / columnCenters.length, height / rowCenters.length) * 0.08));

  for (let column = columnCenters.length - 2; column >= 0; column -= 1) {
    const left = Math.min(columnCenters[column], columnCenters[column + 1]) + margin;
    const right = Math.max(columnCenters[column], columnCenters[column + 1]) - margin;
    if (right <= left) continue;

    for (let row = 0; row < rowCenters.length - 1; row += 1) {
      const top = Math.min(rowCenters[row], rowCenters[row + 1]) + margin;
      const bottom = Math.max(rowCenters[row], rowCenters[row + 1]) - margin;
      if (bottom <= top) continue;

      const rect = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
      const bounds = getInkBoundsInRect(inkLayer, width, rect);
      if (bounds && bounds.width * bounds.height >= width * height * 0.00008) {
        boundsList.push(bounds);
      }
    }
  }

  return boundsList;
}

function getBoundSliceBounds(
  mask: Uint8Array,
  width: number,
  originalBounds: ImageBounds,
  range: { start: number; end: number },
  direction: Exclude<BatchSplitDirection, "auto">
) {
  let minX = originalBounds.x + originalBounds.width;
  let minY = originalBounds.y + originalBounds.height;
  let maxX = -1;
  let maxY = -1;

  if (direction === "horizontal") {
    for (let y = originalBounds.y; y < originalBounds.y + originalBounds.height; y += 1) {
      for (let x = range.start; x <= range.end; x += 1) {
        if (!mask[y * width + x]) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    if (maxX < minX || maxY < minY) {
      return { x: range.start, y: originalBounds.y, width: range.end - range.start + 1, height: originalBounds.height };
    }
  } else {
    for (let y = range.start; y <= range.end; y += 1) {
      for (let x = originalBounds.x; x < originalBounds.x + originalBounds.width; x += 1) {
        if (!mask[y * width + x]) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    if (maxX < minX || maxY < minY) {
      return { x: originalBounds.x, y: range.start, width: originalBounds.width, height: range.end - range.start + 1 };
    }
  }

  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function splitBoundOnce(mask: Uint8Array, width: number, bounds: ImageBounds, direction: Exclude<BatchSplitDirection, "auto">) {
  const axisStart = direction === "horizontal" ? bounds.x : bounds.y;
  const axisLength = direction === "horizontal" ? bounds.width : bounds.height;
  if (axisLength < 36) return null;

  const projection = new Array<number>(axisLength).fill(0);
  if (direction === "horizontal") {
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
        if (mask[y * width + x]) projection[x - bounds.x] += 1;
      }
    }
  } else {
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
        if (mask[y * width + x]) projection[y - bounds.y] += 1;
      }
    }
  }

  const target = Math.round(axisLength / 2);
  const radius = Math.max(10, Math.round(axisLength * 0.28));
  let bestLocalCut = target;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let local = Math.max(8, target - radius); local < Math.min(axisLength - 8, target + radius); local += 1) {
    const score =
      projection[local] * 1.6 +
      (projection[local - 1] ?? projection[local]) +
      (projection[local + 1] ?? projection[local]) +
      Math.abs(local - target) * 0.22;
    if (score < bestScore) {
      bestScore = score;
      bestLocalCut = local;
    }
  }

  const cut = axisStart + bestLocalCut;
  return [
    getBoundSliceBounds(mask, width, bounds, { start: axisStart, end: cut - 1 }, direction),
    getBoundSliceBounds(mask, width, bounds, { start: cut, end: axisStart + axisLength - 1 }, direction),
  ];
}

function refineSplitBoundsToExpectedCount(
  mask: Uint8Array,
  width: number,
  height: number,
  boundsList: ImageBounds[],
  direction: BatchSplitDirection,
  expectedCount: number
) {
  if (expectedCount <= boundsList.length) return boundsList;
  const splitDirection = direction === "auto" ? (height >= width ? "vertical" : "horizontal") : direction;
  const nextBounds = [...boundsList];

  while (nextBounds.length < expectedCount) {
    let candidateIndex = -1;
    let candidateScore = -1;
    for (let index = 0; index < nextBounds.length; index += 1) {
      const bounds = nextBounds[index];
      const axisLength = splitDirection === "horizontal" ? bounds.width : bounds.height;
      const score = axisLength * Math.sqrt(Math.max(1, bounds.width * bounds.height));
      if (axisLength > 36 && score > candidateScore) {
        candidateScore = score;
        candidateIndex = index;
      }
    }
    if (candidateIndex < 0) break;

    const splitBounds = splitBoundOnce(mask, width, nextBounds[candidateIndex], splitDirection);
    if (!splitBounds) break;
    nextBounds.splice(candidateIndex, 1, ...splitBounds);
  }

  return nextBounds.sort((a, b) => splitDirection === "horizontal" ? a.x - b.x : a.y - b.y);
}

function getAxisProjection(mask: Uint8Array, width: number, height: number, direction: Exclude<BatchSplitDirection, "auto">) {
  const projection = new Array<number>(direction === "horizontal" ? width : height).fill(0);
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    projection[direction === "horizontal" ? x : y] += 1;
  }
  return projection;
}

function getValleyBoundary(projection: number[], start: number, end: number) {
  const from = Math.max(0, Math.min(start, end));
  const to = Math.min(projection.length - 1, Math.max(start, end));
  if (to <= from) return from;

  let bestIndex = Math.round((from + to) / 2);
  let bestScore = Number.POSITIVE_INFINITY;
  for (let index = from; index <= to; index += 1) {
    const score =
      projection[index] * 2.2 +
      (projection[index - 1] ?? projection[index]) +
      (projection[index + 1] ?? projection[index]);
    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function getCenterValleyBounds(
  mask: Uint8Array,
  width: number,
  height: number,
  boundsList: ImageBounds[],
  direction: BatchSplitDirection
) {
  if (boundsList.length <= 1) return boundsList;
  const splitDirection = direction === "auto" ? (height >= width ? "vertical" : "horizontal") : direction;
  const projection = getAxisProjection(mask, width, height, splitDirection);
  const sortedBounds = [...boundsList].sort((a, b) => {
    const aCenter = splitDirection === "horizontal" ? a.x + a.width / 2 : a.y + a.height / 2;
    const bCenter = splitDirection === "horizontal" ? b.x + b.width / 2 : b.y + b.height / 2;
    return aCenter - bCenter;
  });

  const cuts: number[] = [];
  for (let index = 0; index < sortedBounds.length - 1; index += 1) {
    const current = sortedBounds[index];
    const next = sortedBounds[index + 1];
    const currentCenter = Math.round(splitDirection === "horizontal" ? current.x + current.width / 2 : current.y + current.height / 2);
    const nextCenter = Math.round(splitDirection === "horizontal" ? next.x + next.width / 2 : next.y + next.height / 2);
    cuts.push(getValleyBoundary(projection, currentCenter, nextCenter));
  }

  return sortedBounds.map((bounds, index) => {
    const axisStart = splitDirection === "horizontal" ? bounds.x : bounds.y;
    const axisEnd = splitDirection === "horizontal" ? bounds.x + bounds.width - 1 : bounds.y + bounds.height - 1;
    const start = index === 0 ? axisStart : Math.min(axisEnd, Math.max(axisStart, cuts[index - 1]));
    const end = index === sortedBounds.length - 1 ? axisEnd : Math.max(start, Math.min(axisEnd, cuts[index]));
    const centerBound = getBoundSliceBounds(mask, width, bounds, { start, end }, splitDirection);
    const pad = Math.max(12, Math.min(42, Math.round((splitDirection === "horizontal" ? centerBound.width : centerBound.height) * 0.12)));
    if (splitDirection === "horizontal") {
      const x = Math.max(0, centerBound.x - pad);
      const right = Math.min(width, centerBound.x + centerBound.width + pad);
      return { ...centerBound, x, width: Math.max(1, right - x) };
    }
    const y = Math.max(0, centerBound.y - pad);
    const bottom = Math.min(height, centerBound.y + centerBound.height + pad);
    return { ...centerBound, y, height: Math.max(1, bottom - y) };
  });
}

function fileFromInkBounds(
  inkLayer: Uint8Array,
  width: number,
  height: number,
  bounds: ImageBounds,
  fileName: string,
  options: UploadProcessOptions = defaultUploadProcessOptions
) {
  return new Promise<File>((resolve, reject) => {
    const boundedInkLayer = new Uint8Array(inkLayer.length);
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
        boundedInkLayer[y * width + x] = inkLayer[y * width + x];
      }
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx || !drawTrimmedInk(canvas, ctx, boundedInkLayer, width, height, options)) {
      reject(new Error("無法拆出字圖"));
      return;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("無法產生拆字圖片"));
        return;
      }
      resolve(new File([blob], fileName, { type: "image/png" }));
    }, "image/png");
  });
}

function fileFromImageDataBounds(
  imageData: ImageData,
  analysisWidth: number,
  analysisHeight: number,
  bounds: ImageBounds,
  fileName: string,
  colorMode: "grayscale" | "original"
): Promise<File> {
  return new Promise((resolve, reject) => {
    const size = normalizedUploadImageSize;
    const scale = Math.min(size / Math.max(1, bounds.width), size / Math.max(1, bounds.height));
    const drawWidth = Math.max(1, Math.round(bounds.width * scale));
    const drawHeight = Math.max(1, Math.round(bounds.height * scale));
    const drawX = Math.round((size - drawWidth) / 2);
    const drawY = Math.round((size - drawHeight) / 2);

    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = analysisWidth;
    srcCanvas.height = analysisHeight;
    const srcCtx = srcCanvas.getContext("2d");
    if (!srcCtx) { reject(new Error("無法處理圖片")); return; }
    srcCtx.putImageData(imageData, 0, 0);

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: colorMode === "grayscale" });
    if (!ctx) { reject(new Error("無法處理圖片")); return; }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(srcCanvas, bounds.x, bounds.y, bounds.width, bounds.height, drawX, drawY, drawWidth, drawHeight);

    if (colorMode === "grayscale") {
      const data = ctx.getImageData(0, 0, size, size);
      const pixels = data.data;
      for (let i = 0; i < pixels.length; i += 4) {
        const gray = Math.round(getLuminance(pixels[i], pixels[i + 1], pixels[i + 2]));
        pixels[i] = gray;
        pixels[i + 1] = gray;
        pixels[i + 2] = gray;
      }
      ctx.putImageData(data, 0, 0);
    }

    const suffix = colorMode === "grayscale" ? "_gray" : "_orig";
    const baseName = fileNameWithoutExtension(fileName).replace(/_bw$/, "");
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error("無法產生圖片")); return; }
      resolve(new File([blob], `${baseName}${suffix}.png`, { type: "image/png" }));
    }, "image/png");
  });
}

async function buildBatchInkLayerFromFile(
  file: File,
  direction: BatchSplitDirection,
  options: UploadProcessOptions = defaultUploadProcessOptions
) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new window.Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("無法讀取圖片，請換一張圖試試"));
      nextImage.src = objectUrl;
    });
    const sourceWidth = Math.max(1, image.naturalWidth || image.width);
    const sourceHeight = Math.max(1, image.naturalHeight || image.height);
    const scale = Math.min(1, batchSplitAnalysisMaxSide / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("無法處理圖片");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height);
    const paperBounds = getPaperBounds(imageData.data, width, height);
    const inkLayer =
      direction === "ruled"
        ? buildRuledInkLayer(imageData.data, width, height, paperBounds)
        : buildInkLayerWithOptions(imageData.data, width, height, paperBounds, options);

    return { imageData, inkLayer, width, height };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function adjustImageBounds(bounds: ImageBounds, width: number, height: number, adjustment: number) {
  const scale = Math.max(0.05, 1 + adjustment * 0.08);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const nextWidth = Math.max(1, Math.round(bounds.width * scale));
  const nextHeight = Math.max(1, Math.round(bounds.height * scale));
  const x = Math.max(0, Math.round(centerX - nextWidth / 2));
  const y = Math.max(0, Math.round(centerY - nextHeight / 2));
  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, nextWidth)),
    height: Math.max(1, Math.min(height - y, nextHeight)),
  };
}

async function splitImageToGlyphFiles(
  file: File,
  direction: BatchSplitDirection,
  expectedCount = 0,
  options: UploadProcessOptions = defaultUploadProcessOptions
) {
  const { imageData, inkLayer, width, height } = await buildBatchInkLayerFromFile(file, direction, options);
    const rawBounds =
      direction === "ruled"
        ? getRuledGridBounds(imageData.data, inkLayer, width, height)
        : getSplitBounds(inkLayer, width, height, direction);
    const detectedBounds = rawBounds.filter(
      (bounds) => bounds.width * bounds.height >= width * height * 0.0008
    );
    const refinedBounds =
      direction === "grid" || direction === "ruled"
        ? detectedBounds
        : refineSplitBoundsToExpectedCount(
            inkLayer,
            width,
            height,
            detectedBounds,
            direction,
            expectedCount
          );
    const boundsList =
      direction === "grid" || direction === "ruled"
        ? refinedBounds
        : getCenterValleyBounds(inkLayer, width, height, refinedBounds, direction);
    if (boundsList.length === 0) throw new Error("沒有偵測到可拆出的字");

    const images = await Promise.all(
      boundsList.map(async (bounds, index) => {
        const glyphFile = await fileFromInkBounds(
          inkLayer,
          width,
          height,
          bounds,
          `${fileNameWithoutExtension(file.name)}_${String(index + 1).padStart(2, "0")}.png`,
          options
        );
        return {
          file: glyphFile,
          previewUrl: URL.createObjectURL(glyphFile),
          bounds,
        };
      })
    );
    return { images, imageData, analysisWidth: width, analysisHeight: height };
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
  uploadEndpoint = "/api/admin/upload",
  showVisibility = false,
  submitLabel,
}: {
  scriptOptions: string[];
  isForbidden?: boolean;
  onUploaded?: () => void | Promise<void>;
  replaceGlyph?: ReplaceGlyphTarget | null;
  uploadEndpoint?: string;
  showVisibility?: boolean;
  submitLabel?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const batchFileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const uploadEditCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const batchEditCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const uploadEraserCursorRef = useRef<HTMLDivElement | null>(null);
  const batchEraserCursorRef = useRef<HTMLDivElement | null>(null);
  const batchItemsRef = useRef<BatchGlyphItem[]>([]);
  const batchCharInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const batchOriginalAnalysisRef = useRef<{ imageData: ImageData; width: number; height: number } | null>(null);
  const isErasingUploadPreviewRef = useRef(false);
  const isErasingBatchEditRef = useRef(false);
  const successToastTimerRef = useRef<number | null>(null);
  const uploadUndoStackRef = useRef<ImageData[]>([]);
  const batchEditUndoStackRef = useRef<ImageData[]>([]);
  const uploadProcessRequestRef = useRef(0);
  const isReplacingGlyph = Boolean(replaceGlyph);
  const [uploadMode, setUploadMode] = useState<"single" | "batch">("single");
  const [uploadColorMode, setUploadColorMode] = useState<UploadColorMode>("bw");
  const [uploadChar, setUploadChar] = useState("");
  const [uploadAuthor, setUploadAuthor] = useState("");
  const [uploadScriptType, setUploadScriptType] = useState("");
  const [uploadWorkTitle, setUploadWorkTitle] = useState("");
  const [uploadSource, setUploadSource] = useState("");
  const [uploadLicense, setUploadLicense] = useState("");
  const [uploadQualityScore, setUploadQualityScore] = useState("0");
  const [uploadVisibility, setUploadVisibility] = useState<"public" | "private">("public");
  const [isComposingUploadChar, setIsComposingUploadChar] = useState(false);
  const [isComposingUploadAuthor, setIsComposingUploadAuthor] = useState(false);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    char: string;
    file: string;
    author: string;
    scriptType: string;
    workTitle: string;
    source: string;
    license: string;
  }>({ char: "", file: "", author: "", scriptType: "", workTitle: "", source: "", license: "" });
  const [successToast, setSuccessToast] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessingUploadImage, setIsProcessingUploadImage] = useState(false);
  const [processedUploadFile, setProcessedUploadFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState("");
  const [uploadSourceFile, setUploadSourceFile] = useState<File | null>(null);
  const [uploadOriginalPreviewUrl, setUploadOriginalPreviewUrl] = useState("");
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadEdgeSoftness, setUploadEdgeSoftness] = useState(defaultUploadProcessOptions.edgeSoftness);
  const [uploadInkStrength, setUploadInkStrength] = useState(defaultUploadProcessOptions.inkStrength);
  const [uploadForegroundSeparation, setUploadForegroundSeparation] = useState(defaultUploadProcessOptions.foregroundSeparation);
  const [uploadNoiseReduction, setUploadNoiseReduction] = useState(defaultUploadProcessOptions.noiseReduction);
  const [uploadProcessingMs, setUploadProcessingMs] = useState(0);
  const [uploadEraserSize, setUploadEraserSize] = useState(44);
  const [isUploadEditing, setIsUploadEditing] = useState(false);
  const [isErasingUploadPreview, setIsErasingUploadPreview] = useState(false);
  const [uploadUndoCount, setUploadUndoCount] = useState(0);
  const [isUploadEditApplying, setIsUploadEditApplying] = useState(false);
  const [uploadPreviewDimensions, setUploadPreviewDimensions] = useState<{ width: number; height: number } | null>(null);
  const [batchDirection, setBatchDirection] = useState<BatchSplitDirection>("auto");
  const [manualSelections, setManualSelections] = useState<{ id: string; x: number; y: number; w: number; h: number }[]>([]);
  const [manualImgDimensions, setManualImgDimensions] = useState<{ w: number; h: number } | null>(null);
  const manualSelectionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const manualSourceImageRef = useRef<HTMLImageElement | null>(null);
  const manualDrawRef = useRef<{ startX: number; startY: number; curX: number; curY: number } | null>(null);
  const isManualDrawingRef = useRef(false);
  type ManualHandle = "NW" | "N" | "NE" | "E" | "SE" | "S" | "SW" | "W";
  const manualResizeRef = useRef<{
    id: string; handle: ManualHandle;
    orig: { x: number; y: number; w: number; h: number };
    startX: number; startY: number;
  } | null>(null);
  const manualMoveRef = useRef<{
    id: string;
    origX: number; origY: number;
    startX: number; startY: number;
  } | null>(null);
  const manualSelectionsRef = useRef<{ id: string; x: number; y: number; w: number; h: number }[]>([]);
  const [batchExpectedCount, setBatchExpectedCount] = useState("");
  const [batchItems, setBatchItems] = useState<BatchGlyphItem[]>([]);
  const [batchFileName, setBatchFileName] = useState("");
  const [batchOriginalPreviewUrl, setBatchOriginalPreviewUrl] = useState("");
  const [batchQuickText, setBatchQuickText] = useState("");
  const [batchStatusFilter, setBatchStatusFilter] = useState<"all" | "missing" | "error" | "adjusted">("all");
  const [draggingBatchId, setDraggingBatchId] = useState<string | null>(null);
  const [dragOverBatchId, setDragOverBatchId] = useState<string | null>(null);
  const [dragOverBatchSide, setDragOverBatchSide] = useState<"before" | "after">("before");
  const [composingBatchCharIds, setComposingBatchCharIds] = useState<Set<string>>(() => new Set());
  const [batchMissingCharIds, setBatchMissingCharIds] = useState<Set<string>>(() => new Set());
  const [batchColorMode, setBatchColorMode] = useState<UploadColorMode>("bw");
  const [isManualOverlayOpen, setIsManualOverlayOpen] = useState(false);

  async function changeBatchColorMode(mode: UploadColorMode) {
    setBatchColorMode(mode);
    const analysis = batchOriginalAnalysisRef.current;
    const items = batchItemsRef.current.filter((item) => !item.colorMode);
    if (!analysis || items.length === 0) return;

    const updatedPreviews = new Map<string, string>();
    for (const item of items) {
      let newPreviewUrl: string;
      if (mode === "bw") {
        newPreviewUrl = URL.createObjectURL(item.file);
      } else {
        const effectiveBounds = adjustImageBounds(item.bounds, analysis.width, analysis.height, item.cropAdjustment);
        const previewFile = await fileFromImageDataBounds(analysis.imageData, analysis.width, analysis.height, effectiveBounds, item.file.name, mode);
        newPreviewUrl = URL.createObjectURL(previewFile);
      }
      updatedPreviews.set(item.id, newPreviewUrl);
    }
    setBatchItems((currentItems) => currentItems.map((item) => {
      const newUrl = updatedPreviews.get(item.id);
      if (!newUrl) return item;
      if (newUrl !== item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return { ...item, previewUrl: newUrl };
    }));
  }
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [isBatchUploading, setIsBatchUploading] = useState(false);
  const [batchUploadCount, setBatchUploadCount] = useState(0);
  const [batchEditingId, setBatchEditingId] = useState<string | null>(null);
  const [batchEditEraserSize, setBatchEditEraserSize] = useState(44);
  const [batchEditColorMode, setBatchEditColorMode] = useState<UploadColorMode>("bw");
  const [isErasingBatchEdit, setIsErasingBatchEdit] = useState(false);
  const [batchEditUndoCount, setBatchEditUndoCount] = useState(0);
  const [isBatchEditApplying, setIsBatchEditApplying] = useState(false);
  const batchSourceFileRef = useRef<File | null>(null);

  function clearUploadImage() {
    uploadProcessRequestRef.current += 1;
    if (uploadPreviewUrl) {
      URL.revokeObjectURL(uploadPreviewUrl);
    }
    if (uploadOriginalPreviewUrl) {
      URL.revokeObjectURL(uploadOriginalPreviewUrl);
    }
    setProcessedUploadFile(null);
    setUploadPreviewUrl("");
    setUploadSourceFile(null);
    setUploadOriginalPreviewUrl("");
    setUploadFileName("");
    setUploadPreviewDimensions(null);
    setIsProcessingUploadImage(false);
    setIsUploadEditing(false);
    setIsErasingUploadPreview(false);
    isErasingUploadPreviewRef.current = false;
    uploadUndoStackRef.current = [];
    setUploadUndoCount(0);
    setUploadColorMode("bw");
    setFieldErrors({ char: "", file: "", author: "", scriptType: "", workTitle: "", source: "", license: "" });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function processUploadImage(file: File, options: UploadProcessOptions, colorMode: UploadColorMode = "bw") {
    const requestId = uploadProcessRequestRef.current + 1;
    uploadProcessRequestRef.current = requestId;
    setIsProcessingUploadImage(true);
    const modeLabel = colorMode === "bw" ? "黑白" : colorMode === "grayscale" ? "灰階" : "原圖";
    setMessage(`正在轉成${modeLabel}預覽...`);
    const startedAt = performance.now();
    try {
      const nextFile = colorMode === "bw"
        ? await imageToBlackWhitePng(file, options)
        : colorMode === "grayscale"
        ? await imageToGrayscalePng(file)
        : await imageToNormalizedPng(file);
      if (requestId !== uploadProcessRequestRef.current) return;
      const nextPreviewUrl = URL.createObjectURL(nextFile);
      setProcessedUploadFile(nextFile);
      setUploadPreviewUrl((currentUrl) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        return nextPreviewUrl;
      });
      uploadUndoStackRef.current = [];
      setUploadUndoCount(0);
      setUploadProcessingMs(Math.round(performance.now() - startedAt));
      setMessage("");
    } catch (error) {
      if (requestId !== uploadProcessRequestRef.current) return;
      setMessage(error instanceof Error ? error.message : "圖片處理失敗");
    } finally {
      if (requestId === uploadProcessRequestRef.current) {
        setIsProcessingUploadImage(false);
      }
    }
  }

  function clearBatchItems() {
    for (const item of batchItems) {
      URL.revokeObjectURL(item.previewUrl);
    }
    if (batchOriginalPreviewUrl) {
      URL.revokeObjectURL(batchOriginalPreviewUrl);
    }
    setBatchItems([]);
    setBatchMissingCharIds(new Set());
    setBatchColorMode("bw");
    batchOriginalAnalysisRef.current = null;
    manualSelectionsRef.current = [];
    setManualSelections([]);
    manualSourceImageRef.current = null;
    setManualImgDimensions(null);
    setIsManualOverlayOpen(false);
    manualDrawRef.current = null;
    manualResizeRef.current = null;
    manualMoveRef.current = null;
    setBatchFileName("");
    setBatchOriginalPreviewUrl("");
    setBatchQuickText("");
    setBatchStatusFilter("all");
    setDraggingBatchId(null);
    setDragOverBatchId(null);
    batchSourceFileRef.current = null;
    if (batchFileInputRef.current) {
      batchFileInputRef.current.value = "";
    }
  }

  function showSuccessToast(text: string) {
    if (successToastTimerRef.current) {
      window.clearTimeout(successToastTimerRef.current);
    }
    setSuccessToast(text);
    successToastTimerRef.current = window.setTimeout(() => {
      setSuccessToast("");
      successToastTimerRef.current = null;
    }, 3200);
  }

  const HANDLE_R = 7;
  const HANDLE_CURSORS: Record<string, string> = {
    NW: "nw-resize", N: "n-resize", NE: "ne-resize",
    E: "e-resize", SE: "se-resize", S: "s-resize", SW: "sw-resize", W: "w-resize",
  };

  function getHandlesForSel(sel: { x: number; y: number; w: number; h: number }) {
    return [
      ["NW", sel.x, sel.y], ["N", sel.x + sel.w / 2, sel.y], ["NE", sel.x + sel.w, sel.y],
      ["E", sel.x + sel.w, sel.y + sel.h / 2],
      ["SE", sel.x + sel.w, sel.y + sel.h], ["S", sel.x + sel.w / 2, sel.y + sel.h],
      ["SW", sel.x, sel.y + sel.h], ["W", sel.x, sel.y + sel.h / 2],
    ] as [ManualHandle, number, number][];
  }

  function getHandleAt(px: number, py: number) {
    for (const sel of [...manualSelectionsRef.current].reverse()) {
      for (const [handle, hx, hy] of getHandlesForSel(sel)) {
        if (Math.abs(px - hx) <= HANDLE_R && Math.abs(py - hy) <= HANDLE_R) {
          return { id: sel.id, handle, sel };
        }
      }
    }
    return null;
  }

  function applyResize(
    orig: { x: number; y: number; w: number; h: number },
    handle: ManualHandle, dx: number, dy: number
  ) {
    let { x, y, w, h } = orig;
    if (handle.includes("N")) { y += dy; h -= dy; }
    if (handle.includes("S")) { h += dy; }
    if (handle.includes("W")) { x += dx; w -= dx; }
    if (handle.includes("E")) { w += dx; }
    if (w < 10) { w = 10; if (handle.includes("W")) x = orig.x + orig.w - 10; }
    if (h < 10) { h = 10; if (handle.includes("N")) y = orig.y + orig.h - 10; }
    return { x, y, w, h };
  }

  function redrawManualCanvas() {
    const canvas = manualSelectionCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    const image = manualSourceImageRef.current;
    if (!canvas || !ctx || !image) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    manualSelectionsRef.current.forEach((sel, i) => {
      ctx.strokeStyle = "#b91c1c";
      ctx.lineWidth = 2;
      ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
      ctx.fillStyle = "rgba(185,28,28,0.15)";
      ctx.fillRect(sel.x, sel.y, sel.w, sel.h);
      ctx.fillStyle = "#b91c1c";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText(String(i + 1), sel.x + 4, sel.y + 15);
      for (const [, hx, hy] of getHandlesForSel(sel)) {
        const hs = HANDLE_R;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
        ctx.strokeStyle = "#b91c1c";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
      }
    });
    const d = manualDrawRef.current;
    if (d) {
      const x = Math.min(d.startX, d.curX), y = Math.min(d.startY, d.curY);
      const w = Math.abs(d.curX - d.startX), h = Math.abs(d.curY - d.startY);
      ctx.setLineDash([5, 3]);
      ctx.strokeStyle = "#b91c1c";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
  }

  function getManualPoint(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = manualSelectionCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvas.width, (e.clientX - rect.left) / rect.width * canvas.width)),
      y: Math.max(0, Math.min(canvas.height, (e.clientY - rect.top) / rect.height * canvas.height)),
    };
  }

  function getSelectionAt(px: number, py: number) {
    for (const sel of [...manualSelectionsRef.current].reverse()) {
      if (px >= sel.x && px <= sel.x + sel.w && py >= sel.y && py <= sel.y + sel.h) return sel;
    }
    return null;
  }

  function startManualDraw(e: PointerEvent<HTMLCanvasElement>) {
    const p = getManualPoint(e);
    if (!p) return;
    const hit = getHandleAt(p.x, p.y);
    if (hit) {
      manualResizeRef.current = { id: hit.id, handle: hit.handle, orig: { ...hit.sel }, startX: p.x, startY: p.y };
    } else {
      const sel = getSelectionAt(p.x, p.y);
      if (sel) {
        manualMoveRef.current = { id: sel.id, origX: sel.x, origY: sel.y, startX: p.x, startY: p.y };
      } else {
        isManualDrawingRef.current = true;
        manualDrawRef.current = { startX: p.x, startY: p.y, curX: p.x, curY: p.y };
      }
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function moveManualDraw(e: PointerEvent<HTMLCanvasElement>) {
    const p = getManualPoint(e);
    if (!p) return;
    const resize = manualResizeRef.current;
    if (resize) {
      const dx = p.x - resize.startX, dy = p.y - resize.startY;
      const next = applyResize(resize.orig, resize.handle, dx, dy);
      manualSelectionsRef.current = manualSelectionsRef.current.map((s) =>
        s.id === resize.id ? { ...s, ...next } : s
      );
      redrawManualCanvas();
      return;
    }
    const move = manualMoveRef.current;
    if (move) {
      const dx = p.x - move.startX, dy = p.y - move.startY;
      const canvas = manualSelectionCanvasRef.current;
      manualSelectionsRef.current = manualSelectionsRef.current.map((s) => {
        if (s.id !== move.id) return s;
        return {
          ...s,
          x: Math.max(0, Math.min((canvas?.width ?? Infinity) - s.w, move.origX + dx)),
          y: Math.max(0, Math.min((canvas?.height ?? Infinity) - s.h, move.origY + dy)),
        };
      });
      redrawManualCanvas();
      return;
    }
    if (isManualDrawingRef.current && manualDrawRef.current) {
      manualDrawRef.current = { ...manualDrawRef.current, curX: p.x, curY: p.y };
      redrawManualCanvas();
      return;
    }
    // 懸停時更新游標
    const hit = getHandleAt(p.x, p.y);
    if (manualSelectionCanvasRef.current) {
      manualSelectionCanvasRef.current.style.cursor = hit
        ? HANDLE_CURSORS[hit.handle]
        : getSelectionAt(p.x, p.y) ? "move" : "crosshair";
    }
  }

  function finishManualDraw(e: PointerEvent<HTMLCanvasElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (manualResizeRef.current) {
      manualResizeRef.current = null;
      setManualSelections([...manualSelectionsRef.current]);
      redrawManualCanvas();
      return;
    }
    if (manualMoveRef.current) {
      manualMoveRef.current = null;
      setManualSelections([...manualSelectionsRef.current]);
      redrawManualCanvas();
      return;
    }
    if (!isManualDrawingRef.current) return;
    isManualDrawingRef.current = false;
    const p = getManualPoint(e);
    const d = manualDrawRef.current;
    manualDrawRef.current = null;
    if (p && d) {
      const x = Math.min(d.startX, p.x), y = Math.min(d.startY, p.y);
      const w = Math.abs(p.x - d.startX), h = Math.abs(p.y - d.startY);
      if (w > 8 && h > 8) {
        const next = [...manualSelectionsRef.current, { id: `m-${Date.now()}`, x, y, w, h }];
        manualSelectionsRef.current = next;
        setManualSelections(next);
      }
    }
    redrawManualCanvas();
  }

  function removeManualSelection(id: string) {
    const next = manualSelectionsRef.current.filter((s) => s.id !== id);
    manualSelectionsRef.current = next;
    setManualSelections(next);
    redrawManualCanvas();
  }

  async function processManualSelections() {
    if (!batchSourceFileRef.current || manualSelectionsRef.current.length === 0) {
      setMessage("請先在圖片上匡選至少一個字");
      return;
    }
    setIsBatchProcessing(true);
    setMessage("正在處理手動匡選範圍...");
    try {
      const { imageData, inkLayer, width: analysisW, height: analysisH } = await buildBatchInkLayerFromFile(
        batchSourceFileRef.current, "auto", currentUploadProcessOptions()
      );
      batchOriginalAnalysisRef.current = { imageData, width: analysisW, height: analysisH };
      // 使用 manualImgDimensions（原圖自然尺寸），避免 overlay 關閉後 canvas ref 為 null
      const imgW = manualImgDimensions?.w ?? manualSelectionCanvasRef.current?.width ?? analysisW;
      const imgH = manualImgDimensions?.h ?? manualSelectionCanvasRef.current?.height ?? analysisH;
      const scaleX = analysisW / imgW;
      const scaleY = analysisH / imgH;
      const images = await Promise.all(
        manualSelectionsRef.current.map(async (sel, index) => {
          const bounds: ImageBounds = {
            x: Math.max(0, Math.round(sel.x * scaleX)),
            y: Math.max(0, Math.round(sel.y * scaleY)),
            width: Math.max(1, Math.min(analysisW, Math.round(sel.w * scaleX))),
            height: Math.max(1, Math.min(analysisH, Math.round(sel.h * scaleY))),
          };
          const fileName = `${fileNameWithoutExtension(batchFileName || "manual")}_${String(index + 1).padStart(2, "0")}.png`;
          const glyphFile = await fileFromInkBounds(inkLayer, analysisW, analysisH, bounds, fileName, currentUploadProcessOptions());
          return { file: glyphFile, previewUrl: URL.createObjectURL(glyphFile), bounds };
        })
      );
      setBatchItems(images.map((img, i) => ({
        ...img,
        id: `manual-${Date.now()}-${i}`,
        char: "",
        cropAdjustment: 0,
        status: "idle" as const,
      })));
      setMessage(`已匡選 ${images.length} 個字，請依序輸入單字後批次上傳`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "手動匡選處理失敗");
      setBatchItems([]);
    } finally {
      setIsBatchProcessing(false);
    }
  }

  async function splitBatchFile(file: File) {
    setIsBatchProcessing(true);
    setMessage("正在自動拆字...");
    try {
      const expectedCount = Number(batchExpectedCount);
      const { images: splitImages, imageData, analysisWidth, analysisHeight } = await splitImageToGlyphFiles(
        file,
        batchDirection,
        Number.isInteger(expectedCount) && expectedCount > 1 ? expectedCount : 0,
        currentUploadProcessOptions()
      );
      batchOriginalAnalysisRef.current = { imageData, width: analysisWidth, height: analysisHeight };
      setBatchItems(
        splitImages.map((image, index) => ({
          ...image,
          id: `${Date.now()}-${index}`,
          char: "",
          cropAdjustment: 0,
          status: "idle",
        }))
      );
      setMessage(`已拆出 ${splitImages.length} 個字，請依序輸入單字後批次上傳`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "自動拆字失敗");
      setBatchItems([]);
    } finally {
      setIsBatchProcessing(false);
    }
  }

  function updateBatchExpectedCount(value: string) {
    setBatchExpectedCount(value);
  }

  function currentUploadProcessOptions(): UploadProcessOptions {
    return {
      edgeSoftness: uploadEdgeSoftness,
      inkStrength: uploadInkStrength,
      foregroundSeparation: uploadForegroundSeparation,
      noiseReduction: uploadNoiseReduction,
    };
  }

  function setBatchCharComposing(id: string, isComposing: boolean) {
    setComposingBatchCharIds((ids) => {
      const nextIds = new Set(ids);
      if (isComposing) {
        nextIds.add(id);
      } else {
        nextIds.delete(id);
      }
      return nextIds;
    });
  }

  async function updateBatchItemColorMode(id: string, mode: UploadColorMode | undefined) {
    const analysis = batchOriginalAnalysisRef.current;
    const item = batchItemsRef.current.find((i) => i.id === id);
    if (!item) return;

    let newPreviewUrl: string;
    if (!mode || mode === "bw") {
      newPreviewUrl = URL.createObjectURL(item.file);
    } else if (analysis) {
      const effectiveBounds = adjustImageBounds(item.bounds, analysis.width, analysis.height, item.cropAdjustment);
      const previewFile = await fileFromImageDataBounds(analysis.imageData, analysis.width, analysis.height, effectiveBounds, item.file.name, mode);
      newPreviewUrl = URL.createObjectURL(previewFile);
    } else {
      newPreviewUrl = item.previewUrl;
    }

    setBatchItems((items) => items.map((candidate) => {
      if (candidate.id !== id) return candidate;
      if (newPreviewUrl !== candidate.previewUrl) URL.revokeObjectURL(candidate.previewUrl);
      return { ...candidate, colorMode: mode, previewUrl: newPreviewUrl };
    }));
  }

  function updateBatchChar(id: string, value: string, isComposing = false) {
    const char = isComposing ? value : onlyChinese(value).slice(0, 1);
    setBatchItems((items) => items.map((item) => (item.id === id ? { ...item, char, status: "idle", message: "" } : item)));
    if (!isComposing && char) {
      setBatchMissingCharIds((ids) => {
        if (!ids.has(id)) return ids;
        const next = new Set(ids);
        next.delete(id);
        return next;
      });
    }
  }

  function updateBatchQuickText(value: string) {
    const chars = Array.from(onlyChinese(value));
    setBatchQuickText(value);
    setBatchItems((items) =>
      items.map((item, index) => ({
        ...item,
        char: chars[index] ?? "",
        status: "idle",
        message: item.status === "done" || item.status === "error" ? "" : item.message,
      }))
    );
  }

  function moveBatchItem(fromId: string, toId: string, side: "before" | "after" = "before") {
    if (fromId === toId) return;
    setBatchItems((items) => {
      const fromIndex = items.findIndex((item) => item.id === fromId);
      const toIndex = items.findIndex((item) => item.id === toId);
      if (fromIndex < 0 || toIndex < 0) return items;
      const nextItems = [...items];
      const [movedItem] = nextItems.splice(fromIndex, 1);
      const adjustedToIndex = nextItems.findIndex((item) => item.id === toId);
      nextItems.splice(adjustedToIndex + (side === "after" ? 1 : 0), 0, movedItem);
      return nextItems;
    });
  }

  const dragPointerRef = useRef<{ id: string } | null>(null);

  function startBatchDrag(e: PointerEvent<HTMLButtonElement>, id: string) {
    if (isBatchUploading || isBatchEditApplying) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragPointerRef.current = { id };
    setDraggingBatchId(id);
    setDragOverBatchId(null);
  }

  function moveBatchDrag(e: PointerEvent<HTMLButtonElement>) {
    if (!dragPointerRef.current) return;
    const fromId = dragPointerRef.current.id;
    const els = document.elementsFromPoint(e.clientX, e.clientY);
    let targetId: string | null = null;
    let side: "before" | "after" = "before";
    for (const el of els) {
      const itemId = (el as HTMLElement).dataset?.batchItemId;
      if (itemId && itemId !== fromId) {
        const rect = el.getBoundingClientRect();
        side = e.clientY > rect.top + rect.height / 2 ? "after" : "before";
        targetId = itemId;
        break;
      }
    }
    setDragOverBatchId(targetId);
    if (targetId) setDragOverBatchSide(side);
  }

  function endBatchDrag(e: PointerEvent<HTMLButtonElement>) {
    if (!dragPointerRef.current) return;
    const fromId = dragPointerRef.current.id;
    const toId = dragOverBatchId;
    const side = dragOverBatchSide;
    dragPointerRef.current = null;
    setDraggingBatchId(null);
    setDragOverBatchId(null);
    if (toId && toId !== fromId) moveBatchItem(fromId, toId, side);
  }

  function cancelBatchDrag() {
    dragPointerRef.current = null;
    setDraggingBatchId(null);
    setDragOverBatchId(null);
  }

  function handleBatchCardKeyDown(event: KeyboardEvent<HTMLDivElement>, id: string) {
    if (event.target instanceof HTMLInputElement || isBatchUploading || isBatchEditApplying) return;
    const index = batchItems.findIndex((item) => item.id === id);
    if (index < 0) return;

    if ((event.key === "ArrowUp" || event.key === "ArrowLeft") && index > 0) {
      event.preventDefault();
      moveBatchItem(id, batchItems[index - 1].id, "before");
    } else if ((event.key === "ArrowDown" || event.key === "ArrowRight") && index < batchItems.length - 1) {
      event.preventDefault();
      moveBatchItem(id, batchItems[index + 1].id, "after");
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeBatchItem(id);
    } else if (event.key === "Enter") {
      event.preventDefault();
      batchCharInputRefs.current[id]?.focus();
    }
  }

  function removeBatchItem(id: string) {
    setBatchItems((items) => {
      const item = items.find((candidate) => candidate.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return items.filter((candidate) => candidate.id !== id);
    });
    if (batchEditingId === id) {
      setBatchEditingId(null);
    }
  }

  async function copyBatchItem(id: string) {
    const item = batchItems.find((candidate) => candidate.id === id);
    if (!item) return;
    try {
      const file = new File([await item.file.arrayBuffer()], item.file.name, { type: item.file.type || "image/png" });
      const copiedItem: BatchGlyphItem = {
        ...item,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        char: item.char,
        status: "idle",
        message: "",
      };
      setBatchItems((items) => {
        const index = items.findIndex((candidate) => candidate.id === id);
        if (index < 0) return [...items, copiedItem];
        return [...items.slice(0, index + 1), copiedItem, ...items.slice(index + 1)];
      });
      setMessage("已複製一份字圖");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "複製字圖失敗");
    }
  }

  function startBatchEdit(id: string) {
    const item = batchItemsRef.current.find((i) => i.id === id);
    batchEditUndoStackRef.current = [];
    setBatchEditUndoCount(0);
    setBatchEditColorMode(item?.colorMode ?? batchColorMode);
    setBatchEditingId(id);
  }

  function cancelBatchEdit() {
    isErasingBatchEditRef.current = false;
    setIsErasingBatchEdit(false);
    setBatchEditingId(null);
    batchEditUndoStackRef.current = [];
    setBatchEditUndoCount(0);
  }

  function getBatchEditPoint(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = batchEditCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width * canvas.width,
      y: (e.clientY - rect.top) / rect.height * canvas.height,
    };
  }

  function eraseBatchEditAt(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = batchEditCanvasRef.current;
    const point = getBatchEditPoint(e);
    if (!canvas || !point) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true }) ?? canvas.getContext("2d");
    if (!ctx) return;

    if (batchEditColorMode !== "bw") {
      contentAwareFillAt(ctx, point.x, point.y, batchEditEraserSize);
    } else {
      featheredWhiteFillAt(ctx, point.x, point.y, batchEditEraserSize);
    }
  }

  function pushBatchEditUndoState() {
    const canvas = batchEditCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    batchEditUndoStackRef.current = [
      ...batchEditUndoStackRef.current.slice(-(maxUploadUndoSteps - 1)),
      ctx.getImageData(0, 0, canvas.width, canvas.height),
    ];
    setBatchEditUndoCount(batchEditUndoStackRef.current.length);
  }

  function startBatchEditErase(e: PointerEvent<HTMLCanvasElement>) {
    pushBatchEditUndoState();
    isErasingBatchEditRef.current = true;
    setIsErasingBatchEdit(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    eraseBatchEditAt(e);
  }

  function moveBatchEditErase(e: PointerEvent<HTMLCanvasElement>) {
    updateEraserCursorDiv(batchEraserCursorRef.current, batchEditCanvasRef.current, e, batchEditEraserSize);
    if (!isErasingBatchEditRef.current) return;
    eraseBatchEditAt(e);
  }

  function finishBatchEditErase(e: PointerEvent<HTMLCanvasElement>) {
    if (!isErasingBatchEditRef.current) return;
    isErasingBatchEditRef.current = false;
    setIsErasingBatchEdit(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function undoBatchEditErase() {
    const canvas = batchEditCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    const previousImage = batchEditUndoStackRef.current.pop();
    if (!canvas || !ctx || !previousImage) return;
    ctx.putImageData(previousImage, 0, 0);
    setBatchEditUndoCount(batchEditUndoStackRef.current.length);
  }

  async function applyBatchEdit(id: string) {
    const canvas = batchEditCanvasRef.current;
    const item = batchItems.find((candidate) => candidate.id === id);
    if (!canvas || !item) return;

    setIsBatchEditApplying(true);
    try {
      const normalizedFile = batchEditColorMode === "bw"
        ? await canvasToCenteredGlyphFile(canvas, item.file.name)
        : await canvasToCenteredColorFile(canvas, item.file.name, batchEditColorMode);
      const nextPreviewUrl = URL.createObjectURL(normalizedFile);
      setBatchItems((items) =>
        items.map((candidate) => {
          if (candidate.id !== id) return candidate;
          URL.revokeObjectURL(candidate.previewUrl);
          return {
            ...candidate,
            file: normalizedFile,
            previewUrl: nextPreviewUrl,
            status: "idle",
            message: "已套用編輯",
            hasManualEdit: true,
          };
        })
      );
      cancelBatchEdit();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "套用編輯失敗");
    } finally {
      setIsBatchEditApplying(false);
    }
  }

  async function adjustBatchCrop(id: string, delta: number) {
    const sourceFile = batchSourceFileRef.current;
    const item = batchItems.find((candidate) => candidate.id === id);
    if (!sourceFile || !item || isBatchEditApplying) return;

    setIsBatchEditApplying(true);
    setBatchItems((items) =>
      items.map((candidate) =>
        candidate.id === id ? { ...candidate, status: "idle", message: "重新裁切中" } : candidate
      )
    );
    try {
      const nextAdjustment = item.cropAdjustment + delta;
      const effectiveColorMode = item.colorMode ?? batchColorMode;
      const { imageData, inkLayer, width, height } = await buildBatchInkLayerFromFile(
        sourceFile,
        batchDirection,
        currentUploadProcessOptions()
      );
      batchOriginalAnalysisRef.current = { imageData, width, height };
      const adjustedBounds = adjustImageBounds(item.bounds, width, height, nextAdjustment);
      const nextFile = effectiveColorMode === "bw"
        ? await fileFromInkBounds(inkLayer, width, height, adjustedBounds, item.file.name, currentUploadProcessOptions())
        : await fileFromImageDataBounds(imageData, width, height, adjustedBounds, item.file.name, effectiveColorMode);
      const nextPreviewUrl = URL.createObjectURL(nextFile);
      setBatchItems((items) =>
        items.map((candidate) => {
          if (candidate.id !== id) return candidate;
          URL.revokeObjectURL(candidate.previewUrl);
          return {
            ...candidate,
            file: nextFile,
            previewUrl: nextPreviewUrl,
            cropAdjustment: nextAdjustment,
            status: "idle",
            message: nextAdjustment === 0 ? "已還原裁切" : nextAdjustment > 0 ? "已放大裁切範圍" : "已縮小裁切範圍",
          };
        })
      );

      // 若此項目正在擦除 overlay 中開啟，同步更新 canvas
      if (batchEditingId === id) {
        const canvas = batchEditCanvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (canvas && ctx) {
          batchEditUndoStackRef.current = [];
          setBatchEditUndoCount(0);
          let reloadUrl: string;
          if (batchEditColorMode !== "bw") {
            const analysis = batchOriginalAnalysisRef.current;
            const previewFile = analysis
              ? await fileFromImageDataBounds(analysis.imageData, analysis.width, analysis.height, adjustedBounds, nextFile.name, batchEditColorMode)
              : nextFile;
            reloadUrl = URL.createObjectURL(previewFile);
          } else {
            reloadUrl = URL.createObjectURL(nextFile);
          }
          const img = new window.Image();
          img.onload = () => {
            URL.revokeObjectURL(reloadUrl);
            canvas.width = img.naturalWidth || normalizedUploadImageSize;
            canvas.height = img.naturalHeight || normalizedUploadImageSize;
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          };
          img.src = reloadUrl;
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重新裁切失敗");
      setBatchItems((items) =>
        items.map((candidate) =>
          candidate.id === id ? { ...candidate, status: "error", message: "重新裁切失敗" } : candidate
        )
      );
    } finally {
      setIsBatchEditApplying(false);
    }
  }

  async function handleBatchFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    clearBatchItems();
    setBatchFileName(file?.name ?? "");
    if (!file) return;
    if (!isAllowedUploadImage(file)) {
      setMessage(`請上傳支援的圖檔格式：${allowedUploadImageLabel}`);
      e.target.value = "";
      setBatchFileName("");
      return;
    }

    batchSourceFileRef.current = file;
    setBatchOriginalPreviewUrl(URL.createObjectURL(file));
    await splitBatchFile(file);
  }

  async function resplitBatchFile() {
    const file = batchSourceFileRef.current;
    if (!file) {
      setMessage("請先選擇一張多字圖片");
      return;
    }
    const hasEditedResults = batchItems.some(
      (item) => item.char.trim() || item.message || item.cropAdjustment !== 0 || item.status !== "idle"
    );
    if (hasEditedResults && !window.confirm("重拆會覆蓋目前拆字結果、單字輸入與手動調整，確定要重拆嗎？")) {
      return;
    }
    for (const item of batchItems) {
      URL.revokeObjectURL(item.previewUrl);
    }
    setBatchItems([]);
    setBatchQuickText("");
    await splitBatchFile(file);
  }

  async function uploadBatch() {
    const nextErrors = { char: "", file: "", author: "", scriptType: "", workTitle: "", source: "", license: "" };
    if (!uploadAuthor.trim()) nextErrors.author = "請填寫作者（必填）";
    if (!uploadScriptType || uploadScriptType === "未標註") nextErrors.scriptType = "請選擇書體（必填）";
    if (!uploadWorkTitle.trim()) nextErrors.workTitle = "請填寫作品名稱（必填）";
    if (!uploadSource.trim()) nextErrors.source = "請填寫來源（必填）";
    if (!uploadLicense.trim()) nextErrors.license = "請填寫授權類型（必填）";
    if (Object.values(nextErrors).some(Boolean)) {
      setFieldErrors(nextErrors);
      return;
    }
    setFieldErrors({ char: "", file: "", author: "", scriptType: "", workTitle: "", source: "", license: "" });

    if (batchItems.length === 0) {
      setMessage("請先選擇一張多字圖片");
      return;
    }
    const missingItems = batchItems.filter((item) => !onlyChinese(item.char).slice(0, 1));
    if (missingItems.length > 0) {
      setBatchMissingCharIds(new Set(missingItems.map((item) => item.id)));
      const firstId = missingItems[0].id;
      setTimeout(() => batchCharInputRefs.current[firstId]?.focus(), 0);
      return;
    }
    setBatchMissingCharIds(new Set());

    setIsBatchUploading(true);
    setBatchUploadCount(0);
    setMessage("批次上傳中...");

    // 建立字組並上傳原圖
    let batchSetId: number | null = null;
    const batchSetName = batchItems.map((item) => onlyChinese(item.char).slice(0, 1)).filter(Boolean).join("");
    if (batchSourceFileRef.current && !replaceGlyph) {
      try {
        const setFormData = new FormData();
        setFormData.set("sourceImage", batchSourceFileRef.current, batchFileName || "source.jpg");
        setFormData.set("visibility", uploadVisibility);
        if (batchSetName) setFormData.set("name", batchSetName);
        const setRes = await fetch("/api/glyph-sets", { method: "POST", body: setFormData });
        if (setRes.ok) {
          const setJson = await setRes.json() as { id: number };
          batchSetId = setJson.id;
        }
      } catch { /* 字組建立失敗不影響上傳 */ }
    }

    // Pre-load original imageData if any item needs non-bw color
    const needsOriginalData = batchItems.some((item) => (item.colorMode ?? batchColorMode) !== "bw");
    let originalImageAnalysis: { imageData: ImageData; width: number; height: number } | null = null;
    if (needsOriginalData && batchSourceFileRef.current) {
      try {
        const { imageData, width, height } = await buildBatchInkLayerFromFile(
          batchSourceFileRef.current, batchDirection, currentUploadProcessOptions()
        );
        originalImageAnalysis = { imageData, width, height };
      } catch { /* fall back to bw */ }
    }

    let successCount = 0;
    try {
      for (const [batchIndex, item] of batchItems.entries()) {
        setBatchItems((items) =>
          items.map((candidate) =>
            candidate.id === item.id ? { ...candidate, status: "uploading", message: "上傳中" } : candidate
          )
        );
        const effectiveColorMode = item.colorMode ?? batchColorMode;
        let fileToUpload = item.file;
        if (effectiveColorMode !== "bw" && !item.hasManualEdit && originalImageAnalysis) {
          const { imageData, width, height } = originalImageAnalysis;
          const effectiveBounds = adjustImageBounds(item.bounds, width, height, item.cropAdjustment);
          try {
            fileToUpload = await fileFromImageDataBounds(imageData, width, height, effectiveBounds, item.file.name, effectiveColorMode);
          } catch { /* fall back to bw */ }
        }
        const formData = new FormData();
        formData.set("char", onlyChinese(item.char).slice(0, 1));
        formData.set("author", onlyChinese(uploadAuthor));
        formData.set("scriptType", uploadScriptType === "未標註" ? "" : uploadScriptType);
        formData.set("workTitle", uploadWorkTitle);
        formData.set("source", uploadSource);
        formData.set("license", uploadLicense);
        formData.set("qualityScore", uploadQualityScore);
        formData.set("visibility", uploadVisibility);
        formData.set("processingMs", String(uploadProcessingMs));
        if (batchSetId) {
          formData.set("setId", String(batchSetId));
          formData.set("setPosition", String(batchIndex + 1));
        }
        formData.set("file", fileToUpload, fileToUpload.name);
        const thumbnailFile = await imageFileToThumbnailPng(fileToUpload, `${fileNameWithoutExtension(fileToUpload.name)}_thumb.png`);
        formData.set("thumbnailFile", thumbnailFile, thumbnailFile.name);

        const res = await fetch(uploadEndpoint, {
          method: "POST",
          body: formData,
        });
        const json = await res.json();
        if (!res.ok) {
          setBatchItems((items) =>
            items.map((candidate) =>
              candidate.id === item.id ? { ...candidate, status: "error", message: json.error ?? "上傳失敗" } : candidate
            )
          );
          setBatchUploadCount((n) => n + 1);
          continue;
        }
        successCount += 1;
        setBatchItems((items) =>
          items.map((candidate) =>
            candidate.id === item.id ? { ...candidate, status: "done", message: `ID ${json.id}` } : candidate
          )
        );
        setBatchUploadCount((n) => n + 1);
      }
      const failureCount = batchItems.length - successCount;
      setMessage(`批次上傳完成：成功 ${successCount} 筆，失敗 ${failureCount} 筆`);
      if (successCount > 0) {
        showSuccessToast(failureCount > 0 ? `已上傳 ${successCount} 筆，${failureCount} 筆未完成` : `已成功上傳 ${successCount} 筆`);
      }
      await onUploaded?.();
      if (failureCount === 0 && successCount > 0) {
        clearBatchItems();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "批次上傳失敗");
    } finally {
      setIsBatchUploading(false);
    }
  }

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const canvas = uploadPreviewCanvasRef.current;
    const nextErrors = { char: "", file: "", author: "", scriptType: "", workTitle: "", source: "", license: "" };
    if (!isReplacingGlyph && !onlyChinese(uploadChar).slice(0, 1)) {
      nextErrors.char = "請輸入一個中文字（必填）";
    }
    if (!replaceGlyph && (!processedUploadFile || !canvas)) {
      nextErrors.file = "請先選擇圖片（必填）";
    }
    if (!uploadAuthor.trim()) {
      nextErrors.author = "請填寫作者（必填）";
    }
    if (!uploadScriptType || uploadScriptType === "未標註") {
      nextErrors.scriptType = "請選擇書體（必填）";
    }
    if (!uploadWorkTitle.trim()) {
      nextErrors.workTitle = "請填寫作品名稱（必填）";
    }
    if (!uploadSource.trim()) {
      nextErrors.source = "請填寫來源（必填）";
    }
    if (!uploadLicense.trim()) {
      nextErrors.license = "請填寫授權類型（必填）";
    }
    if (Object.values(nextErrors).some(Boolean)) {
      setFieldErrors(nextErrors);
      return;
    }
    setFieldErrors({ char: "", file: "", author: "", scriptType: "", workTitle: "", source: "", license: "" });

    setIsUploading(true);
    setMessage(replaceGlyph && !processedUploadFile ? "儲存中..." : "上傳中...");
    const form = e.currentTarget;

    try {
      const formData = new FormData(form);
      formData.set("char", onlyChinese(uploadChar).slice(0, 1));
      formData.set("author", onlyChinese(uploadAuthor));
      formData.set("scriptType", uploadScriptType === "未標註" ? "" : uploadScriptType);
      formData.set("workTitle", uploadWorkTitle);
      formData.set("source", uploadSource);
      formData.set("license", uploadLicense);
      formData.set("qualityScore", uploadQualityScore);
      formData.set("visibility", uploadVisibility);
      formData.set("processingMs", String(uploadProcessingMs));
      if (processedUploadFile && canvas) {
        const renderedFile = await canvasToPngFile(canvas, processedUploadFile.name);
        formData.set("file", renderedFile, renderedFile.name);
        const thumbnailFile = await imageFileToThumbnailPng(renderedFile, `${fileNameWithoutExtension(renderedFile.name)}_thumb.png`);
        formData.set("thumbnailFile", thumbnailFile, thumbnailFile.name);
      } else {
        formData.delete("file");
        formData.delete("thumbnailFile");
      }

      const endpoint = replaceGlyph ? `/api/glyphs/${replaceGlyph.id}/image` : uploadEndpoint;
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
          ? processedUploadFile
            ? `已替換字圖 ID：${replaceGlyph.id} 的圖片`
            : `已儲存字圖 ID：${replaceGlyph.id} 的資料`
          : `已新增字圖 ID：${json.id}，已存入 Blob：${json.blobName ?? json.imageUrl}`
      );
      showSuccessToast(
        replaceGlyph
          ? processedUploadFile
            ? "已成功替換字圖"
            : "已成功儲存資料"
          : "已成功上傳 1 筆"
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

    setUploadSourceFile(file);
    setUploadOriginalPreviewUrl(URL.createObjectURL(file));
  }

  useEffect(() => {
    if (!uploadSourceFile) return;

    const timeoutId = window.setTimeout(() => {
      void processUploadImage(uploadSourceFile, {
        edgeSoftness: uploadEdgeSoftness,
        inkStrength: uploadInkStrength,
        foregroundSeparation: uploadForegroundSeparation,
        noiseReduction: uploadNoiseReduction,
      }, uploadColorMode);
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [uploadSourceFile, uploadEdgeSoftness, uploadInkStrength, uploadForegroundSeparation, uploadNoiseReduction, uploadColorMode]);

  function getUploadPreviewPoint(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = uploadEditCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width * canvas.width,
      y: (e.clientY - rect.top) / rect.height * canvas.height,
    };
  }

  function eraseUploadPreviewAt(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = uploadEditCanvasRef.current;
    const point = getUploadPreviewPoint(e);
    if (!canvas || !point) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true }) ?? canvas.getContext("2d");
    if (!ctx) return;

    if (uploadColorMode !== "bw") {
      contentAwareFillAt(ctx, point.x, point.y, uploadEraserSize);
    } else {
      featheredWhiteFillAt(ctx, point.x, point.y, uploadEraserSize);
    }
  }

  function pushUploadUndoState() {
    const canvas = uploadEditCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    uploadUndoStackRef.current = [
      ...uploadUndoStackRef.current.slice(-(maxUploadUndoSteps - 1)),
      ctx.getImageData(0, 0, canvas.width, canvas.height),
    ];
    setUploadUndoCount(uploadUndoStackRef.current.length);
  }

  function startUploadPreviewErase(e: PointerEvent<HTMLCanvasElement>) {
    if (!processedUploadFile || !isUploadEditing) return;
    pushUploadUndoState();
    isErasingUploadPreviewRef.current = true;
    setIsErasingUploadPreview(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    eraseUploadPreviewAt(e);
  }

  function updateEraserCursorDiv(div: HTMLDivElement | null, canvas: HTMLCanvasElement | null, e: PointerEvent<HTMLCanvasElement>, size: number) {
    if (!div || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / canvas.width;
    const r = size * scale;
    div.style.left = `${e.clientX - r}px`;
    div.style.top = `${e.clientY - r}px`;
    div.style.width = `${r * 2}px`;
    div.style.height = `${r * 2}px`;
    div.style.display = "block";
  }

  function moveUploadPreviewErase(e: PointerEvent<HTMLCanvasElement>) {
    updateEraserCursorDiv(uploadEraserCursorRef.current, uploadEditCanvasRef.current, e, uploadEraserSize);
    if (!isErasingUploadPreviewRef.current) return;
    eraseUploadPreviewAt(e);
  }

  function finishUploadPreviewErase(e: PointerEvent<HTMLCanvasElement>) {
    if (!isErasingUploadPreviewRef.current) return;
    isErasingUploadPreviewRef.current = false;
    setIsErasingUploadPreview(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

  }

  function undoUploadPreviewErase() {
    const canvas = uploadEditCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    const previousImage = uploadUndoStackRef.current.pop();
    if (!canvas || !ctx || !previousImage || !processedUploadFile) return;

    ctx.putImageData(previousImage, 0, 0);
    setUploadUndoCount(uploadUndoStackRef.current.length);
  }

  async function loadExistingGlyphForEdit() {
    if (!replaceGlyph?.imageUrl) return;
    setIsProcessingUploadImage(true);
    setMessage("載入現有字圖...");
    try {
      const res = await fetch(replaceGlyph.imageUrl);
      if (!res.ok) throw new Error("無法載入字圖");
      const blob = await res.blob();
      const ext = blob.type.includes("png") ? "png" : blob.type.includes("jpeg") || blob.type.includes("jpg") ? "jpg" : "png";
      const fileName = `${replaceGlyph.char}_edit.${ext}`;
      const file = new File([blob], fileName, { type: blob.type || "image/png" });
      const objectUrl = URL.createObjectURL(file);
      setProcessedUploadFile(file);
      setUploadFileName(fileName);
      setUploadColorMode("original");
      setUploadPreviewUrl((currentUrl) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        return objectUrl;
      });
      uploadUndoStackRef.current = [];
      setUploadUndoCount(0);
      setUploadProcessingMs(0);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "載入字圖失敗");
    } finally {
      setIsProcessingUploadImage(false);
    }
  }

  function startUploadEdit() {
    if (!processedUploadFile || !uploadPreviewUrl) return;
    uploadUndoStackRef.current = [];
    setUploadUndoCount(0);
    setIsUploadEditing(true);
  }

  function cancelUploadEdit() {
    isErasingUploadPreviewRef.current = false;
    setIsErasingUploadPreview(false);
    setIsUploadEditing(false);
    uploadUndoStackRef.current = [];
    setUploadUndoCount(0);
  }

  async function applyUploadEdit() {
    const canvas = uploadEditCanvasRef.current;
    if (!canvas || !processedUploadFile) return;

    setIsUploadEditApplying(true);
    try {
      const nextFile = uploadColorMode === "bw"
        ? await canvasToCenteredGlyphFile(canvas, processedUploadFile.name)
        : await canvasToCenteredColorFile(canvas, processedUploadFile.name, uploadColorMode);
      if (uploadPreviewUrl) {
        URL.revokeObjectURL(uploadPreviewUrl);
      }
      setProcessedUploadFile(nextFile);
      setUploadPreviewUrl(URL.createObjectURL(nextFile));
      cancelUploadEdit();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法套用圖片編輯");
    } finally {
      setIsUploadEditApplying(false);
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
    return () => {
      if (uploadOriginalPreviewUrl) {
        URL.revokeObjectURL(uploadOriginalPreviewUrl);
      }
    };
  }, [uploadOriginalPreviewUrl]);

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
    if (!isUploadEditing || !uploadPreviewUrl) return;
    const canvas = uploadEditCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const image = new window.Image();
    image.onload = () => {
      canvas.width = image.naturalWidth || normalizedUploadImageSize;
      canvas.height = image.naturalHeight || normalizedUploadImageSize;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = uploadPreviewUrl;
  }, [isUploadEditing, uploadPreviewUrl]);

  useEffect(() => {
    if (!replaceGlyph) return;
    setUploadMode("single");
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

  useEffect(() => {
    batchItemsRef.current = batchItems;
  }, [batchItems]);

  useEffect(() => {
    return () => {
      if (batchOriginalPreviewUrl) {
        URL.revokeObjectURL(batchOriginalPreviewUrl);
      }
    };
  }, [batchOriginalPreviewUrl]);

  // Effect 1: 載入原圖，取得尺寸（不依賴 overlay 狀態）
  useEffect(() => {
    if (!batchOriginalPreviewUrl || batchDirection !== "manual") return;
    const img = new window.Image();
    img.onload = () => {
      manualSourceImageRef.current = img;
      setManualImgDimensions({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = batchOriginalPreviewUrl;
  }, [batchOriginalPreviewUrl, batchDirection]);

  // Effect 2: Overlay 開啟時初始化互動 canvas
  useEffect(() => {
    if (!isManualOverlayOpen || !manualSourceImageRef.current) return;
    const img = manualSourceImageRef.current;
    const canvas = manualSelectionCanvasRef.current;
    if (canvas) {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
    }
    redrawManualCanvas();
  }, [isManualOverlayOpen]);

  useEffect(() => {
    if (!batchEditingId) return;
    const item = batchItemsRef.current.find((candidate) => candidate.id === batchEditingId);
    const canvas = batchEditCanvasRef.current;
    if (!item || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    batchEditUndoStackRef.current = [];
    setBatchEditUndoCount(0);

    async function load() {
      let objectUrl: string;
      let needsRevoke = false;
      if (batchEditColorMode === "bw") {
        objectUrl = URL.createObjectURL(item!.file);
        needsRevoke = true;
      } else {
        const analysis = batchOriginalAnalysisRef.current;
        if (analysis) {
          const effectiveBounds = adjustImageBounds(item!.bounds, analysis.width, analysis.height, item!.cropAdjustment);
          const previewFile = await fileFromImageDataBounds(analysis.imageData, analysis.width, analysis.height, effectiveBounds, item!.file.name, batchEditColorMode);
          objectUrl = URL.createObjectURL(previewFile);
          needsRevoke = true;
        } else {
          objectUrl = URL.createObjectURL(item!.file);
          needsRevoke = true;
        }
      }
      const image = new window.Image();
      image.onload = () => {
        if (needsRevoke) URL.revokeObjectURL(objectUrl);
        if (!canvas || !ctx) return;
        canvas.width = image.naturalWidth || normalizedUploadImageSize;
        canvas.height = image.naturalHeight || normalizedUploadImageSize;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      };
      image.src = objectUrl;
    }
    void load();
  }, [batchEditingId, batchEditColorMode]);

  useEffect(() => {
    return () => {
      for (const item of batchItemsRef.current) {
        URL.revokeObjectURL(item.previewUrl);
      }
      if (successToastTimerRef.current) {
        window.clearTimeout(successToastTimerRef.current);
      }
    };
  }, []);

  const editingBatchItem = batchItems.find((item) => item.id === batchEditingId);
  const batchQuickTextLength = Array.from(onlyChinese(batchQuickText)).length;
  const batchQuickTextMessage =
    batchQuickTextLength === 0 || batchItems.length === 0
      ? ""
      : batchQuickTextLength === batchItems.length
      ? "字數剛好符合拆字結果"
      : batchQuickTextLength > batchItems.length
      ? `文字多 ${batchQuickTextLength - batchItems.length} 字，後面的字不會填入`
      : `文字少 ${batchItems.length - batchQuickTextLength} 字，後面字圖會留空`;
  const visibleBatchItems = batchItems.filter((item) => {
    if (batchStatusFilter === "missing") return !onlyChinese(item.char).slice(0, 1);
    if (batchStatusFilter === "error") return item.status === "error";
    if (batchStatusFilter === "adjusted") return item.cropAdjustment !== 0 || Boolean(item.message?.includes("裁切"));
    return true;
  });
  const metadataFields = (
    <>
      <div>
        <input
          name="author"
          value={uploadAuthor}
          onCompositionStart={() => setIsComposingUploadAuthor(true)}
          onCompositionEnd={(e) => {
            setIsComposingUploadAuthor(false);
            const v = onlyChinese(e.currentTarget.value);
            setUploadAuthor(v);
            if (fieldErrors.author && v.trim()) setFieldErrors((prev) => ({ ...prev, author: "" }));
          }}
          onChange={(e) => {
            const nativeEvent = e.nativeEvent as InputEvent;
            const v = isComposingUploadAuthor || nativeEvent.isComposing ? e.target.value : onlyChinese(e.target.value);
            setUploadAuthor(v);
            if (fieldErrors.author && v.trim()) setFieldErrors((prev) => ({ ...prev, author: "" }));
          }}
          placeholder="作者，例如：孫過庭（必填）"
          disabled={isUploading || isBatchUploading}
          className={`min-h-12 w-full rounded-xl border bg-stone-50 px-3 py-3 outline-none focus:border-red-700 disabled:opacity-70 ${fieldErrors.author ? "border-red-500" : "border-stone-300"}`}
          autoComplete="off"
        />
        {fieldErrors.author && <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.author}</p>}
      </div>
      <div>
        <select
          name="scriptType"
          value={uploadScriptType}
          onChange={(e) => {
            setUploadScriptType(e.target.value);
            if (fieldErrors.scriptType && e.target.value && e.target.value !== "未標註") {
              setFieldErrors((prev) => ({ ...prev, scriptType: "" }));
            }
          }}
          disabled={isUploading || isBatchUploading}
          className={`min-h-12 w-full rounded-xl border bg-stone-50 px-3 py-3 outline-none focus:border-red-700 disabled:opacity-70 ${fieldErrors.scriptType ? "border-red-500" : "border-stone-300"}`}
        >
          <option value="">書體（必填）</option>
          {scriptOptions.map((scriptType) => (
            <option key={scriptType} value={scriptType}>
              {scriptType}
            </option>
          ))}
        </select>
        {fieldErrors.scriptType && <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.scriptType}</p>}
      </div>
      <div>
        <input
          name="workTitle"
          value={uploadWorkTitle}
          onChange={(e) => {
            setUploadWorkTitle(e.target.value);
            if (fieldErrors.workTitle && e.target.value.trim()) setFieldErrors((prev) => ({ ...prev, workTitle: "" }));
          }}
          placeholder="作品，例如：書譜（必填）"
          disabled={isUploading || isBatchUploading}
          className={`min-h-12 w-full rounded-xl border bg-stone-50 px-3 py-3 outline-none focus:border-red-700 disabled:opacity-70 ${fieldErrors.workTitle ? "border-red-500" : "border-stone-300"}`}
        />
        {fieldErrors.workTitle && <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.workTitle}</p>}
      </div>
      <div>
        <input
          name="source"
          value={uploadSource}
          onChange={(e) => {
            setUploadSource(e.target.value);
            if (fieldErrors.source && e.target.value.trim()) setFieldErrors((prev) => ({ ...prev, source: "" }));
          }}
          placeholder="來源，例如：local-dataset（必填）"
          disabled={isUploading || isBatchUploading}
          className={`min-h-12 w-full rounded-xl border bg-stone-50 px-3 py-3 outline-none focus:border-red-700 disabled:opacity-70 ${fieldErrors.source ? "border-red-500" : "border-stone-300"}`}
        />
        {fieldErrors.source && <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.source}</p>}
      </div>
      <div>
        <input
          name="license"
          value={uploadLicense}
          onChange={(e) => {
            setUploadLicense(e.target.value);
            if (fieldErrors.license && e.target.value.trim()) setFieldErrors((prev) => ({ ...prev, license: "" }));
          }}
          placeholder="授權，例如：non-commercial-research（必填）"
          disabled={isUploading || isBatchUploading}
          className={`min-h-12 w-full rounded-xl border bg-stone-50 px-3 py-3 outline-none focus:border-red-700 disabled:opacity-70 ${fieldErrors.license ? "border-red-500" : "border-stone-300"}`}
        />
        {fieldErrors.license && <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.license}</p>}
      </div>
      <input
        name="qualityScore"
        type="number"
        value={uploadQualityScore}
        onChange={(e) => setUploadQualityScore(e.target.value)}
        placeholder="品質分數（排序用，選填）"
        disabled={isUploading || isBatchUploading}
        className="min-h-12 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-3 outline-none focus:border-red-700 disabled:opacity-70"
      />
    </>
  );
  const visibilityControl = showVisibility && !isReplacingGlyph ? (
    <div className="grid grid-cols-2 gap-2 rounded-xl bg-stone-100 p-1">
      {[
        ["public", "公開"],
        ["private", "私人"],
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => setUploadVisibility(value as "public" | "private")}
          disabled={isUploading || isBatchUploading}
          className={`min-h-10 rounded-lg px-3 text-sm font-bold ${
            uploadVisibility === value ? "bg-white text-red-800 shadow-sm" : "text-stone-600 hover:text-stone-900"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {label}
        </button>
      ))}
    </div>
  ) : null;

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (isUploading || isProcessingUploadImage || isBatchProcessing || isBatchUploading) return;
    
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (uploadMode === "single" || isReplacingGlyph) {
      if (fileInputRef.current) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInputRef.current.files = dataTransfer.files;
        const event = new Event('change', { bubbles: true });
        fileInputRef.current.dispatchEvent(event);
      }
    } else {
      if (batchFileInputRef.current) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        batchFileInputRef.current.files = dataTransfer.files;
        const event = new Event('change', { bubbles: true });
        batchFileInputRef.current.dispatchEvent(event);
      }
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative rounded-3xl transition-all ${
        isDragging ? "ring-4 ring-red-500/50 ring-offset-4 ring-offset-stone-50 bg-red-50/50" : ""
      }`}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-3xl bg-white/80 backdrop-blur-sm border-2 border-dashed border-red-500">
          <div className="flex flex-col items-center gap-3 text-red-700">
            <div className="rounded-full bg-red-100 p-4">
              <Upload className="h-8 w-8" />
            </div>
            <p className="font-bold text-lg">將圖片拖放至此</p>
          </div>
        </div>
      )}
      <form onSubmit={upload} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] lg:gap-5">
      <div className="space-y-3">
        {!isReplacingGlyph && (
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-stone-100 p-1">
            <button
              type="button"
              onClick={() => { setUploadMode("single"); setFieldErrors({ char: "", file: "", author: "", scriptType: "", workTitle: "", source: "", license: "" }); }}
              className={`min-h-10 rounded-lg px-3 text-sm font-bold ${
                uploadMode === "single" ? "bg-white text-red-800 shadow-sm" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              單張上傳
            </button>
            <button
              type="button"
              onClick={() => { setUploadMode("batch"); setFieldErrors({ char: "", file: "", author: "", scriptType: "", workTitle: "", source: "", license: "" }); }}
              className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold ${
                uploadMode === "batch" ? "bg-white text-red-800 shadow-sm" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <Scissors className="h-4 w-4" />
              多字拆圖
            </button>
          </div>
        )}

        {uploadMode === "single" || isReplacingGlyph ? (
          <>
            <div>
              <input
                name="file"
                ref={fileInputRef}
                type="file"
                accept={uploadImageAccept}
                onChange={(e) => {
                  if (fieldErrors.file) setFieldErrors((prev) => ({ ...prev, file: "" }));
                  void handleUploadFileChange(e);
                }}
                disabled={isUploading || isProcessingUploadImage}
                className={`min-h-12 w-full rounded-xl border bg-stone-50 px-3 py-3 text-sm disabled:opacity-70 ${fieldErrors.file ? "border-red-500" : "border-stone-300"}`}
              />
              {fieldErrors.file && (
                <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.file}</p>
              )}
            </div>
            <div>
              <input
                name="char"
                value={uploadChar}
                onCompositionStart={() => setIsComposingUploadChar(true)}
                onCompositionEnd={(e) => {
                  setIsComposingUploadChar(false);
                  setUploadChar(onlyChinese(e.currentTarget.value).slice(0, 1));
                  if (fieldErrors.char) setFieldErrors((prev) => ({ ...prev, char: "" }));
                }}
                onChange={(e) => {
                  const nativeEvent = e.nativeEvent as InputEvent;
                  const nextValue =
                    isComposingUploadChar || nativeEvent.isComposing
                      ? e.target.value
                      : onlyChinese(e.target.value).slice(0, 1);
                  setUploadChar(nextValue);
                  if (fieldErrors.char && onlyChinese(nextValue).slice(0, 1)) {
                    setFieldErrors((prev) => ({ ...prev, char: "" }));
                  }
                }}
                placeholder="單字，例如：小（必填）"
                disabled={isUploading}
                className={`min-h-12 w-full rounded-xl border bg-stone-50 px-3 py-3 outline-none focus:border-red-700 ${fieldErrors.char ? "border-red-500" : "border-stone-300"}`}
                autoComplete="off"
              />
              {fieldErrors.char && (
                <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.char}</p>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-3">
            <div>
              <div className="font-bold text-stone-900">圖片處理</div>
              <div className="text-xs text-stone-500">先選擇來源圖片、拆字方向與品質，再重拆檢查結果。</div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["auto", "自動"],
                ["horizontal", "橫排"],
                ["vertical", "直排"],
                ["manual", "手動匡選"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setBatchDirection(value as BatchSplitDirection); if (value !== "manual") { manualSelectionsRef.current = []; setManualSelections([]); } }}
                  disabled={isBatchProcessing || isBatchUploading}
                  className={`min-h-10 rounded-xl border px-2 text-xs font-bold sm:text-sm ${
                    batchDirection === value
                      ? "border-red-800 bg-red-800 text-white"
                      : "border-stone-300 bg-stone-50 text-stone-700 hover:border-red-700"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              ref={batchFileInputRef}
              type="file"
              accept={uploadImageAccept}
              onChange={(e) => void handleBatchFileChange(e)}
              disabled={isBatchProcessing || isBatchUploading}
              className="min-h-12 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-3 text-sm disabled:opacity-70"
            />
            {batchFileName && <div className="rounded-xl bg-stone-50 p-3 text-sm text-stone-600">{batchFileName}</div>}
            {batchOriginalPreviewUrl && batchDirection !== "manual" && (
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                <div className="mb-2 text-xs font-bold text-stone-500">原圖預覽</div>
                <div className="flex max-h-64 items-center justify-center overflow-hidden rounded-lg border border-stone-200 bg-white">
                  <img
                    src={batchOriginalPreviewUrl}
                    alt={`${batchFileName || "多字圖片"} 原圖`}
                    className="max-h-64 max-w-full object-contain p-2"
                  />
                </div>
              </div>
            )}
            {batchDirection === "manual" && batchOriginalPreviewUrl && (
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2 text-xs font-bold text-stone-500">
                  <span>{manualSelections.length > 0 ? `已選 ${manualSelections.length} 個範圍` : "尚未匡選任何字"}</span>
                  {manualSelections.length > 0 && (
                    <button type="button" onClick={() => { manualSelectionsRef.current = []; setManualSelections([]); }} disabled={isBatchProcessing} className="text-red-600 hover:text-red-800 disabled:opacity-50">全部清除</button>
                  )}
                </div>
                <div className="relative overflow-hidden rounded-lg border border-stone-200 bg-white">
                  <img src={batchOriginalPreviewUrl} alt="原圖預覽" className="max-h-40 w-full object-contain" />
                  {manualSelections.length > 0 && manualImgDimensions && (
                    <svg
                      className="pointer-events-none absolute inset-0 h-full w-full"
                      viewBox={`0 0 ${manualImgDimensions.w} ${manualImgDimensions.h}`}
                      preserveAspectRatio="xMidYMid meet"
                    >
                      {manualSelections.map((sel, i) => {
                        const sw = Math.max(2, manualImgDimensions.w * 0.007);
                        const fs = manualImgDimensions.w * 0.055;
                        return (
                          <g key={sel.id}>
                            <rect x={sel.x} y={sel.y} width={sel.w} height={sel.h} fill="rgba(185,28,28,0.18)" stroke="#b91c1c" strokeWidth={sw} />
                            <text x={sel.x + sw * 2} y={sel.y + fs} fill="#b91c1c" fontSize={fs} fontWeight="bold">{i + 1}</text>
                          </g>
                        );
                      })}
                    </svg>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsManualOverlayOpen(true)}
                  disabled={isBatchProcessing || isBatchUploading}
                  className="mt-2 inline-flex w-full min-h-11 items-center justify-center gap-2 rounded-xl bg-stone-800 px-4 font-bold text-white hover:bg-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Maximize2 className="h-4 w-4" />
                  開啟全螢幕匡選
                </button>
              </div>
            )}
            {batchDirection !== "manual" && <div className="grid gap-3 rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-stone-700">拆字品質模板</span>
                {uploadQualityPresets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setUploadEdgeSoftness(preset.options.edgeSoftness);
                      setUploadInkStrength(preset.options.inkStrength);
                      setUploadForegroundSeparation(preset.options.foregroundSeparation);
                      setUploadNoiseReduction(preset.options.noiseReduction);
                    }}
                    disabled={isBatchProcessing || isBatchUploading}
                    className="rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700 hover:border-red-700 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              {[
                ["邊緣柔化", uploadEdgeSoftness, setUploadEdgeSoftness],
                ["墨色強度", uploadInkStrength, setUploadInkStrength],
                ["前景/背景分離", uploadForegroundSeparation, setUploadForegroundSeparation],
                ["去雜點強度", uploadNoiseReduction, setUploadNoiseReduction],
              ].map(([label, value, setter]) => (
                <label key={label as string} className="grid gap-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-stone-700">{label as string}</span>
                    <span className="text-xs tabular-nums text-stone-500">{value as number}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={value as number}
                    onChange={(event) => (setter as (next: number) => void)(Number(event.target.value))}
                    disabled={isBatchProcessing || isBatchUploading}
                    className="accent-red-800"
                  />
                </label>
              ))}
            </div>}
            {batchDirection !== "manual" ? (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-xl border border-stone-200 bg-stone-50 p-2">
                <input
                  type="number"
                  min="2"
                  max="60"
                  value={batchExpectedCount}
                  onChange={(e) => updateBatchExpectedCount(e.target.value)}
                  placeholder="預期字數，可留空"
                  disabled={isBatchProcessing || isBatchUploading}
                  className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 py-3 outline-none focus:border-red-700 disabled:opacity-70"
                />
                <button
                  type="button"
                  onClick={() => void resplitBatchFile()}
                  disabled={isBatchProcessing || isBatchUploading || !batchSourceFileRef.current}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-stone-800 px-4 font-bold text-white hover:bg-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isBatchProcessing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
                  重拆
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void processManualSelections()}
                disabled={isBatchProcessing || isBatchUploading || manualSelections.length === 0}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-stone-800 px-4 font-bold text-white hover:bg-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBatchProcessing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                確認匡選（{manualSelections.length} 個）
              </button>
            )}
          </div>
        )}
        {(uploadMode === "single" || isReplacingGlyph) && (
          <>
            {metadataFields}
            {visibilityControl}
            <button type="submit" disabled={isForbidden || isUploading || isProcessingUploadImage} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-800 px-4 py-3 font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-red-800">
              {isUploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {isUploading ? (processedUploadFile ? "上傳中" : "儲存中") : isReplacingGlyph ? "儲存字圖資料" : submitLabel ?? "上傳並寫入資料庫"}
            </button>
          </>
        )}
        {message && <div className="rounded-xl bg-stone-50 p-3 text-sm text-stone-600">{message}</div>}
      </div>

      <div className="space-y-3">
        {uploadMode === "batch" && !isReplacingGlyph ? (
          <>
          <div className="rounded-2xl border border-stone-200 bg-white p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <div className="font-bold text-stone-900">字圖資料</div>
                <div className="text-xs text-stone-500">這些資料會套用到本次批次上傳的所有字圖。</div>
              </div>
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-600">
                {batchItems.length ? `${batchItems.length} 個字` : "尚未拆字"}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {metadataFields}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs font-bold text-stone-700">整批圖片模式</span>
              {([
                ["bw", "轉黑白"],
                ["grayscale", "灰階"],
                ["original", "原圖"],
              ] as [UploadColorMode, string][]).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => void changeBatchColorMode(mode)}
                  disabled={isBatchUploading}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-bold ${
                    batchColorMode === mode
                      ? "border-red-800 bg-red-800 text-white"
                      : "border-stone-300 text-stone-700 hover:border-red-700 hover:text-red-800"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              {visibilityControl}
              <button
                type="button"
                onClick={() => void uploadBatch()}
                disabled={isForbidden || isBatchProcessing || isBatchUploading}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-red-800 px-4 py-3 font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-red-800"
              >
                {isBatchProcessing || isBatchUploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {isBatchProcessing ? "拆字中" : isBatchUploading ? "批次上傳中" : `批次上傳 ${batchItems.length || ""}`}
              </button>
            </div>
            {isBatchUploading && batchItems.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-xs text-stone-500">
                  <span>上傳進度</span>
                  <span>{batchUploadCount} / {batchItems.length}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
                  <div
                    className="h-full rounded-full bg-red-700 transition-all duration-300"
                    style={{ width: `${Math.round((batchUploadCount / batchItems.length) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-stone-500">
              <span className="truncate">拆字結果</span>
              <span className="shrink-0">{batchItems.length ? `${batchItems.length} 個字` : "等待圖片"}</span>
            </div>
            {batchItems.length > 0 && (
              <div className="mb-3 rounded-xl border border-stone-200 bg-white p-2">
                <input
                  value={batchQuickText}
                  onChange={(event) => updateBatchQuickText(event.target.value)}
                  placeholder="整段文字，例如：小橋流水人家"
                  disabled={isBatchUploading}
                  className="min-h-11 w-full rounded-lg border border-stone-300 bg-stone-50 px-3 text-sm outline-none focus:border-red-700 disabled:opacity-70"
                  autoComplete="off"
                />
                {batchQuickTextMessage && (
                  <div className={`mt-2 text-xs font-bold ${
                    batchQuickTextLength === batchItems.length ? "text-emerald-700" : "text-amber-700"
                  }`}>
                    {batchQuickTextMessage}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    ["all", "全部"],
                    ["missing", "未填字"],
                    ["error", "上傳失敗"],
                    ["adjusted", "已調整"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setBatchStatusFilter(value as "all" | "missing" | "error" | "adjusted")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                        batchStatusFilter === value
                          ? "bg-red-800 text-white"
                          : "border border-stone-300 bg-white text-stone-600 hover:border-red-700 hover:text-red-800"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {batchMissingCharIds.size > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                <X className="h-4 w-4 shrink-0" />
                <span>有 {batchMissingCharIds.size} 個字圖尚未填寫中文字，請逐一填入後再批次上傳</span>
              </div>
            )}
            {isBatchProcessing ? (
              <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-stone-200 bg-white text-sm text-stone-500">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                拆字中
              </div>
            ) : batchItems.length ? (
              <div className="grid max-h-[680px] grid-cols-2 gap-3 overflow-auto pr-1 sm:grid-cols-3 lg:grid-cols-2">
                {visibleBatchItems.map((item) => {
                  const index = batchItems.findIndex((candidate) => candidate.id === item.id);
                  return (
                  <div
                    key={item.id}
                    data-batch-item-id={item.id}
                    tabIndex={0}
                    onKeyDown={(event) => handleBatchCardKeyDown(event, item.id)}
                    className={`relative rounded-xl border bg-white p-2 transition ${
                      draggingBatchId === item.id
                        ? "border-red-700 opacity-70"
                        : dragOverBatchId === item.id
                        ? "border-red-700 bg-red-50 shadow-[0_0_0_3px_rgba(185,28,28,0.12)]"
                        : "border-stone-200"
                    }`}
                  >
                    {dragOverBatchId === item.id && draggingBatchId !== item.id && (
                      <div
                        className={`pointer-events-none absolute left-2 right-2 z-10 h-1 rounded-full bg-red-700 shadow-[0_0_0_3px_rgba(185,28,28,0.16)] ${
                          dragOverBatchSide === "before" ? "-top-1" : "-bottom-1"
                        }`}
                      />
                    )}
                    <div className="mb-2 grid gap-2 text-xs text-stone-500">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={isBatchUploading || isBatchEditApplying}
                            onPointerDown={(e) => startBatchDrag(e, item.id)}
                            onPointerMove={moveBatchDrag}
                            onPointerUp={endBatchDrag}
                            onPointerCancel={cancelBatchDrag}
                            className="inline-flex h-7 w-7 touch-none cursor-grab items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label={`拖曳排序第 ${index + 1} 個字`}
                            title="拖曳排序"
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
                          <span>#{index + 1}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeBatchItem(item.id)}
                          disabled={isBatchUploading || isBatchEditApplying}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`移除第 ${index + 1} 個字`}
                          title="移除"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        <button
                          type="button"
                          onClick={() => void adjustBatchCrop(item.id, -1)}
                          disabled={isBatchUploading || isBatchEditApplying}
                          className="inline-flex h-8 min-w-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`縮小第 ${index + 1} 個字的裁切範圍`}
                          title="縮小裁切範圍"
                        >
                          <Minimize2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void adjustBatchCrop(item.id, 1)}
                          disabled={isBatchUploading || isBatchEditApplying}
                          className="inline-flex h-8 min-w-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`放大第 ${index + 1} 個字的裁切範圍`}
                          title="放大裁切範圍"
                        >
                          <Maximize2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void copyBatchItem(item.id)}
                          disabled={isBatchUploading || isBatchEditApplying}
                          className="inline-flex h-8 min-w-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`複製第 ${index + 1} 個字`}
                          title="複製"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => (batchEditingId === item.id ? cancelBatchEdit() : startBatchEdit(item.id))}
                          disabled={isBatchUploading || isBatchEditApplying}
                          className={`inline-flex h-8 min-w-0 items-center justify-center rounded-lg hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 ${
                            batchEditingId === item.id ? "text-red-800" : "text-stone-500 hover:text-red-800"
                          }`}
                          aria-label={`擦除第 ${index + 1} 個字`}
                          title="擦除"
                        >
                          <Eraser className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mb-2 flex aspect-square items-center justify-center rounded-lg border border-stone-100 bg-white">
                      <img src={item.previewUrl} alt={`拆出的第 ${index + 1} 個字`} className="max-h-full max-w-full object-contain p-2" loading="lazy" />
                    </div>
                    <input
                      ref={(node) => {
                        batchCharInputRefs.current[item.id] = node;
                      }}
                      value={item.char}
                      onCompositionStart={() => setBatchCharComposing(item.id, true)}
                      onCompositionEnd={(e) => {
                        setBatchCharComposing(item.id, false);
                        updateBatchChar(item.id, e.currentTarget.value);
                      }}
                      onChange={(e) => {
                        const nativeEvent = e.nativeEvent as InputEvent;
                        updateBatchChar(
                          item.id,
                          e.target.value,
                          composingBatchCharIds.has(item.id) || nativeEvent.isComposing
                        );
                      }}
                      placeholder="單字（必填）"
                      disabled={isBatchUploading}
                      className={`min-h-10 w-full rounded-lg border bg-stone-50 px-2 text-center text-lg font-bold outline-none focus:border-red-700 disabled:opacity-70 ${batchMissingCharIds.has(item.id) ? "border-red-500" : "border-stone-300"}`}
                      autoComplete="off"
                    />
                    <div className="mt-1 flex gap-1">
                      {([
                        ["bw", "黑白"],
                        ["grayscale", "灰階"],
                        ["original", "原圖"],
                      ] as [UploadColorMode, string][]).map(([mode, label]) => {
                        const effective = item.colorMode ?? batchColorMode;
                        const isActive = mode === effective;
                        const isOverride = item.colorMode !== undefined && mode === item.colorMode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => void updateBatchItemColorMode(item.id, mode === item.colorMode ? undefined : mode)}
                            disabled={isBatchUploading}
                            title={isOverride ? "已覆蓋整批設定，點擊恢復" : label}
                            className={`flex-1 rounded-lg border py-1 text-[10px] font-bold leading-none ${
                              isActive
                                ? isOverride
                                  ? "border-amber-600 bg-amber-50 text-amber-700"
                                  : "border-red-800 bg-red-800 text-white"
                                : "border-stone-200 text-stone-400 hover:border-stone-400 hover:text-stone-600"
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    {item.message && (
                      <div className={`mt-2 truncate text-xs ${item.status === "error" ? "text-red-700" : "text-stone-500"}`}>
                        {item.message}
                      </div>
                    )}
                  </div>
                );
                })}
                {visibleBatchItems.length === 0 && (
                  <div className="col-span-full rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
                    目前沒有符合篩選的拆字結果。
                  </div>
                )}
              </div>
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-stone-200 bg-white px-4 text-center text-sm text-stone-500">
                選擇一張包含多個字的圖片後，這裡會顯示自動拆出的字圖。
              </div>
            )}
          </div>
          </>
        ) : (
          <>
            {replaceGlyph?.imageUrl && (
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2 text-xs text-stone-500">
                  <span className="truncate">現有字圖</span>
                  <span className="shrink-0">ID {replaceGlyph.id}</span>
                </div>
                <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-white">
                  <img
                    src={replaceGlyph.imageUrl}
                    alt={`${replaceGlyph.char} 現有字圖`}
                    className="max-h-full max-w-full object-contain p-4"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void loadExistingGlyphForEdit()}
                  disabled={isUploading || isProcessingUploadImage}
                  className="mt-2 inline-flex w-full min-h-10 items-center justify-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-sm font-bold text-stone-700 hover:border-red-700 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isProcessingUploadImage ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                  載入並直接編輯字圖
                </button>
              </div>
            )}

            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2 text-xs text-stone-500">
                <span className="truncate">{uploadFileName || (isReplacingGlyph ? "新的 Canvas 預覽" : uploadColorMode === "bw" ? "黑白預覽" : uploadColorMode === "grayscale" ? "灰階預覽" : "原圖預覽")}</span>
                <span className="shrink-0">
                  {uploadPreviewDimensions
                    ? `${uploadPreviewDimensions.width}x${uploadPreviewDimensions.height}`
                    : `最長邊 ${normalizedUploadImageSize}px`}
                </span>
                {isProcessingUploadImage && <RefreshCw className="h-4 w-4 animate-spin" />}
              </div>
              <div className={`grid gap-2 ${uploadOriginalPreviewUrl ? "sm:grid-cols-2" : ""}`}>
                {uploadOriginalPreviewUrl && (
                  <div>
                    <div className="mb-1 text-xs font-bold text-stone-500">原圖</div>
                    <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-white">
                      <img
                        src={uploadOriginalPreviewUrl}
                        alt={`${uploadFileName || "上傳圖片"} 原圖`}
                        className="max-h-full max-w-full object-contain p-3"
                      />
                    </div>
                  </div>
                )}
                <div>
                  {uploadOriginalPreviewUrl && <div className="mb-1 text-xs font-bold text-stone-500">處理後</div>}
                  <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-white">
                    {uploadPreviewUrl ? (
                      <>
                        <button
                          type="button"
                          onClick={startUploadEdit}
                          disabled={isUploading || isProcessingUploadImage}
                          className="absolute right-2 top-2 z-10 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white/90 text-stone-700 shadow-sm backdrop-blur hover:border-red-700 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="全螢幕編輯圖片"
                          title="全螢幕編輯"
                        >
                          <Maximize2 className="h-4 w-4" />
                        </button>
                        <canvas
                          ref={uploadPreviewCanvasRef}
                          width={uploadPreviewSize}
                          height={uploadPreviewSize}
                          className="max-h-full max-w-full bg-white"
                          style={{ aspectRatio: `${uploadPreviewDimensions?.width ?? 1} / ${uploadPreviewDimensions?.height ?? 1}` }}
                          aria-label="黑白字圖預覽"
                        />
                      </>
                    ) : (
                      <span className="px-4 text-center text-sm text-stone-500">
                        {isReplacingGlyph
                          ? "未選擇新圖檔時會保留原圖，只儲存左側資料。"
                          : "選擇或拍攝圖檔後，這裡會顯示處理後的預覽。"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {uploadOriginalPreviewUrl && (
                <div className="mt-3 grid gap-3 rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-stone-700">圖片模式</span>
                    {([
                      ["bw", "轉黑白"],
                      ["grayscale", "灰階"],
                      ["original", "原圖"],
                    ] as [UploadColorMode, string][]).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setUploadColorMode(mode)}
                        disabled={isUploading || isProcessingUploadImage || isUploadEditing}
                        className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                          uploadColorMode === mode
                            ? "border-red-800 bg-red-800 text-white"
                            : "border-stone-300 text-stone-700 hover:border-red-700 hover:text-red-800"
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {uploadColorMode === "bw" && <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-stone-700">品質模板</span>
                    {uploadQualityPresets.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setUploadEdgeSoftness(preset.options.edgeSoftness);
                          setUploadInkStrength(preset.options.inkStrength);
                          setUploadForegroundSeparation(preset.options.foregroundSeparation);
                          setUploadNoiseReduction(preset.options.noiseReduction);
                        }}
                        disabled={isUploading || isProcessingUploadImage || isUploadEditing}
                        className="rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700 hover:border-red-700 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <label className="grid gap-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold text-stone-700">邊緣柔化</span>
                      <span className="text-xs tabular-nums text-stone-500">{uploadEdgeSoftness}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={uploadEdgeSoftness}
                      onChange={(event) => setUploadEdgeSoftness(Number(event.target.value))}
                      disabled={isUploading || isProcessingUploadImage || isUploadEditing}
                      className="accent-red-800"
                    />
                  </label>
                  <label className="grid gap-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold text-stone-700">前景/背景分離</span>
                      <span className="text-xs tabular-nums text-stone-500">{uploadForegroundSeparation}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={uploadForegroundSeparation}
                      onChange={(event) => setUploadForegroundSeparation(Number(event.target.value))}
                      disabled={isUploading || isProcessingUploadImage || isUploadEditing}
                      className="accent-red-800"
                    />
                  </label>
                  <label className="grid gap-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold text-stone-700">去雜點強度</span>
                      <span className="text-xs tabular-nums text-stone-500">{uploadNoiseReduction}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={uploadNoiseReduction}
                      onChange={(event) => setUploadNoiseReduction(Number(event.target.value))}
                      disabled={isUploading || isProcessingUploadImage || isUploadEditing}
                      className="accent-red-800"
                    />
                  </label>
                  <label className="grid gap-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold text-stone-700">墨色強度</span>
                      <span className="text-xs tabular-nums text-stone-500">{uploadInkStrength}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={uploadInkStrength}
                      onChange={(event) => setUploadInkStrength(Number(event.target.value))}
                      disabled={isUploading || isProcessingUploadImage || isUploadEditing}
                      className="accent-red-800"
                    />
                  </label>
                  </>}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {isUploadEditing && uploadPreviewUrl && (
        <div className="fixed inset-0 z-50 flex bg-stone-950/90 p-2 text-stone-900 backdrop-blur sm:p-4">
          <div className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-2xl bg-stone-100 shadow-2xl">
            <div className="absolute left-3 top-3 z-10 rounded-xl bg-white/90 px-3 py-2 text-xs text-stone-600 shadow-sm backdrop-blur">
              <div className="max-w-[56vw] truncate font-bold text-stone-900">{uploadFileName || "編輯圖片"}</div>
              <div>套用後自動置中縮放</div>
            </div>

            <div className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-xl border border-stone-200 bg-white/90 p-1 shadow-sm backdrop-blur">
              <button
                type="button"
                onClick={undoUploadPreviewErase}
                disabled={uploadUndoCount === 0 || isUploadEditApplying}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-stone-700 hover:bg-stone-100 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="還原上一筆擦除"
                title="還原"
              >
                <RotateCcw className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={cancelUploadEdit}
                disabled={isUploadEditApplying}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-stone-700 hover:bg-stone-100 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="取消編輯"
                title="取消"
              >
                <X className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => void applyUploadEdit()}
                disabled={isUploadEditApplying}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-red-800 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="套用編輯"
                title="套用"
              >
                {isUploadEditApplying ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
              </button>
            </div>

            <div className="absolute bottom-3 left-1/2 z-10 flex w-[min(560px,calc(100%-1.5rem))] -translate-x-1/2 flex-col gap-2 rounded-xl border border-stone-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur">
              <div className="flex items-center gap-3">
                <Eraser className={`h-5 w-5 shrink-0 ${isErasingUploadPreview ? "text-red-700" : "text-stone-600"}`} />
                <input
                  type="range"
                  min="8"
                  max="120"
                  value={uploadEraserSize}
                  onChange={(e) => setUploadEraserSize(Number(e.target.value))}
                  disabled={isUploadEditApplying}
                  className="min-w-0 flex-1 accent-red-800"
                  aria-label="擦除大小"
                />
                <span className="w-11 text-right text-xs tabular-nums text-stone-500">{uploadEraserSize}px</span>
              </div>
              <div className="flex items-center gap-2">
                {([["bw", "黑白"], ["grayscale", "灰階"], ["original", "原圖"]] as [UploadColorMode, string][]).map(([mode, label]) => (
                  <button key={mode} type="button" onClick={() => setUploadColorMode(mode)} disabled={isUploadEditApplying} className={`rounded-lg border px-2 py-1 text-xs font-bold ${uploadColorMode === mode ? "border-red-800 bg-red-800 text-white" : "border-stone-300 text-stone-600 hover:border-red-700 hover:text-red-800"} disabled:opacity-50`}>{label}</button>
                ))}
              </div>
            </div>

            <div className="flex h-full w-full items-center justify-center overflow-auto p-3 pt-16 pb-24 sm:p-5 sm:pt-16 sm:pb-24">
              <canvas
                ref={uploadEditCanvasRef}
                width={uploadPreviewSize}
                height={uploadPreviewSize}
                onPointerDown={startUploadPreviewErase}
                onPointerMove={moveUploadPreviewErase}
                onPointerUp={finishUploadPreviewErase}
                onPointerCancel={finishUploadPreviewErase}
                onPointerLeave={() => { if (uploadEraserCursorRef.current) uploadEraserCursorRef.current.style.display = "none"; }}
                className="max-h-full max-w-full touch-none bg-white shadow-lg"
                style={{ cursor: "none" }}
                aria-label="全螢幕編輯單張圖片"
              />
            </div>
            <div
              ref={uploadEraserCursorRef}
              className="pointer-events-none fixed z-[51] rounded-full border-2 border-red-600/75"
              style={{ display: "none", boxShadow: "0 0 0 1px rgba(255,255,255,0.6)" }}
            />
          </div>
        </div>
      )}
      {editingBatchItem && (
        <div className="fixed inset-0 z-50 flex bg-stone-950/90 p-2 text-stone-900 backdrop-blur sm:p-4">
          <div className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-2xl bg-stone-100 shadow-2xl">
            <div className="absolute left-3 top-3 z-10 rounded-xl bg-white/90 px-3 py-2 text-xs text-stone-600 shadow-sm backdrop-blur">
              <div className="truncate font-bold text-stone-900">編輯拆字圖片</div>
              <div>套用後自動置中縮放</div>
            </div>

            <div className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-xl border border-stone-200 bg-white/90 p-1 shadow-sm backdrop-blur">
              <button
                type="button"
                onClick={undoBatchEditErase}
                disabled={batchEditUndoCount === 0 || isBatchEditApplying}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-stone-700 hover:bg-stone-100 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="還原上一筆擦除"
                title="還原"
              >
                <RotateCcw className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={cancelBatchEdit}
                disabled={isBatchEditApplying}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-stone-700 hover:bg-stone-100 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="關閉編輯"
                title="取消"
              >
                <X className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => void applyBatchEdit(editingBatchItem.id)}
                disabled={isBatchEditApplying}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-red-800 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="套用編輯"
                title="套用"
              >
                {isBatchEditApplying ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
              </button>
            </div>

            <div className="absolute bottom-3 left-1/2 z-10 flex w-[min(560px,calc(100%-1.5rem))] -translate-x-1/2 flex-col gap-2 rounded-xl border border-stone-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur">
              <div className="flex items-center gap-3">
                <Eraser className={`h-5 w-5 shrink-0 ${isErasingBatchEdit ? "text-red-700" : "text-stone-600"}`} />
                <input
                  type="range"
                  min="8"
                  max="120"
                  value={batchEditEraserSize}
                  onChange={(e) => setBatchEditEraserSize(Number(e.target.value))}
                  disabled={isBatchEditApplying}
                  className="min-w-0 flex-1 accent-red-800"
                  aria-label="批次編輯擦除大小"
                />
                <span className="w-11 text-right text-xs tabular-nums text-stone-500">{batchEditEraserSize}px</span>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => void adjustBatchCrop(editingBatchItem.id, -1)} disabled={isBatchEditApplying} className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-stone-300 text-stone-600 hover:border-red-700 hover:text-red-800 disabled:opacity-40" title="縮小截字範圍"><Minimize2 className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => void adjustBatchCrop(editingBatchItem.id, 1)} disabled={isBatchEditApplying} className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-stone-300 text-stone-600 hover:border-red-700 hover:text-red-800 disabled:opacity-40" title="放大截字範圍"><Maximize2 className="h-3.5 w-3.5" /></button>
                <div className="mx-1 h-4 w-px bg-stone-200" />
                {([["bw", "黑白"], ["grayscale", "灰階"], ["original", "原圖"]] as [UploadColorMode, string][]).map(([mode, label]) => (
                  <button key={mode} type="button" onClick={() => setBatchEditColorMode(mode as UploadColorMode)} disabled={isBatchEditApplying} className={`rounded-lg border px-2 py-1 text-xs font-bold ${batchEditColorMode === mode ? "border-red-800 bg-red-800 text-white" : "border-stone-300 text-stone-600 hover:border-red-700 hover:text-red-800"} disabled:opacity-50`}>{label}</button>
                ))}
              </div>
            </div>

            <div className="flex h-full w-full items-center justify-center overflow-auto p-3 pt-16 pb-24 sm:p-5 sm:pt-16 sm:pb-24">
              <canvas
                ref={batchEditCanvasRef}
                width={uploadPreviewSize}
                height={uploadPreviewSize}
                onPointerDown={startBatchEditErase}
                onPointerMove={moveBatchEditErase}
                onPointerUp={finishBatchEditErase}
                onPointerCancel={finishBatchEditErase}
                onPointerLeave={() => { if (batchEraserCursorRef.current) batchEraserCursorRef.current.style.display = "none"; }}
                className="max-h-full max-w-full touch-none bg-white shadow-lg"
                style={{ cursor: "none" }}
                aria-label="大版面編輯拆字圖片"
              />
            </div>
            <div
              ref={batchEraserCursorRef}
              className="pointer-events-none fixed z-[51] rounded-full border-2 border-red-600/75"
              style={{ display: "none", boxShadow: "0 0 0 1px rgba(255,255,255,0.6)" }}
            />
          </div>
        </div>
      )}
      {isManualOverlayOpen && batchOriginalPreviewUrl && (
        <div className="fixed inset-0 z-50 flex bg-stone-950/90 p-2 text-stone-900 backdrop-blur sm:p-4">
          <div className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-2xl bg-stone-100 shadow-2xl">
            <div className="absolute left-3 top-3 z-10 rounded-xl bg-white/90 px-3 py-2 text-xs text-stone-600 shadow-sm backdrop-blur">
              <div className="font-bold text-stone-900">手動匡選</div>
              <div>點擊拖曳選取字的範圍｜已選 {manualSelections.length} 個</div>
            </div>
            <div className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-xl border border-stone-200 bg-white/90 p-1 shadow-sm backdrop-blur">
              {manualSelections.length > 0 && (
                <button
                  type="button"
                  onClick={() => { manualSelectionsRef.current = []; setManualSelections([]); redrawManualCanvas(); }}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-bold text-stone-700 hover:bg-stone-100 hover:text-red-800"
                  title="清除全部"
                >
                  <X className="h-4 w-4" />
                  清除全部
                </button>
              )}
              {manualSelections.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setIsManualOverlayOpen(false); void processManualSelections(); }}
                  disabled={isBatchProcessing}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-red-800 px-3 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  title="確認匡選"
                >
                  <Check className="h-4 w-4" />
                  確認匡選（{manualSelections.length}）
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsManualOverlayOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-stone-800 text-white hover:bg-stone-900"
                title="關閉"
              >
                <Minimize2 className="h-5 w-5" />
              </button>
            </div>
            <div className="flex h-full w-full items-center justify-center overflow-auto p-3 pt-16 pb-4 sm:p-5 sm:pt-16 sm:pb-6">
              <canvas
                ref={manualSelectionCanvasRef}
                onPointerDown={startManualDraw}
                onPointerMove={moveManualDraw}
                onPointerUp={finishManualDraw}
                onPointerCancel={finishManualDraw}
                className="max-h-full max-w-full touch-none bg-white shadow-lg"
                style={{ cursor: "crosshair" }}
                aria-label="手動匡選畫布"
              />
            </div>
          </div>
        </div>
      )}
      {successToast && (
        <div
          className="fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border border-emerald-200 bg-white/95 px-4 py-2 text-sm font-bold text-emerald-800 shadow-lg backdrop-blur"
          role="status"
          aria-live="polite"
        >
          <Check className="h-4 w-4" />
          {successToast}
        </div>
      )}
    </form>
    </div>
  );
}
