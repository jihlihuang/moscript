"use client";

import { ChangeEvent, DragEvent, FormEvent, KeyboardEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { Check, Copy, Eraser, GripVertical, Maximize2, Minimize2, RefreshCw, RotateCcw, Scissors, Upload, X } from "lucide-react";

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

type BatchSplitDirection = "auto" | "horizontal" | "vertical" | "grid" | "ruled";

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
  const scale = Math.max(0.72, Math.min(1.48, 1 + adjustment * 0.08));
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

    return Promise.all(
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
  const batchItemsRef = useRef<BatchGlyphItem[]>([]);
  const batchCharInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const isErasingUploadPreviewRef = useRef(false);
  const isErasingBatchEditRef = useRef(false);
  const successToastTimerRef = useRef<number | null>(null);
  const uploadUndoStackRef = useRef<ImageData[]>([]);
  const batchEditUndoStackRef = useRef<ImageData[]>([]);
  const uploadProcessRequestRef = useRef(0);
  const isReplacingGlyph = Boolean(replaceGlyph);
  const [uploadMode, setUploadMode] = useState<"single" | "batch">("single");
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
    workTitle: string;
    source: string;
    license: string;
  }>({ char: "", file: "", author: "", workTitle: "", source: "", license: "" });
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
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [isBatchUploading, setIsBatchUploading] = useState(false);
  const [batchEditingId, setBatchEditingId] = useState<string | null>(null);
  const [batchEditEraserSize, setBatchEditEraserSize] = useState(44);
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
    setFieldErrors({ char: "", file: "", author: "", workTitle: "", source: "", license: "" });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function processUploadImage(file: File, options: UploadProcessOptions) {
    const requestId = uploadProcessRequestRef.current + 1;
    uploadProcessRequestRef.current = requestId;
    setIsProcessingUploadImage(true);
    setMessage("正在轉成黑白預覽...");
    const startedAt = performance.now();
    try {
      const nextFile = await imageToBlackWhitePng(file, options);
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

  async function splitBatchFile(file: File) {
    setIsBatchProcessing(true);
    setMessage("正在自動拆字...");
    try {
      const expectedCount = Number(batchExpectedCount);
      const splitImages = await splitImageToGlyphFiles(
        file,
        batchDirection,
        Number.isInteger(expectedCount) && expectedCount > 1 ? expectedCount : 0,
        currentUploadProcessOptions()
      );
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

  function handleBatchDragStart(event: DragEvent<HTMLElement>, id: string) {
    setDraggingBatchId(id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  }

  function handleBatchDragOver(event: DragEvent<HTMLDivElement>, id: string) {
    event.preventDefault();
    if (draggingBatchId === id) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const side = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
    setDragOverBatchId(id);
    setDragOverBatchSide(side);
  }

  function handleBatchDrop(event: DragEvent<HTMLDivElement>, id: string) {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData("text/plain") || draggingBatchId;
    if (draggedId) moveBatchItem(draggedId, id, dragOverBatchId === id ? dragOverBatchSide : "before");
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
    batchEditUndoStackRef.current = [];
    setBatchEditUndoCount(0);
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
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(point.x, point.y, batchEditEraserSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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
      const normalizedFile = await canvasToCenteredGlyphFile(canvas, item.file.name);
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
      const nextAdjustment = Math.max(-4, Math.min(6, item.cropAdjustment + delta));
      const { inkLayer, width, height } = await buildBatchInkLayerFromFile(
        sourceFile,
        batchDirection,
        currentUploadProcessOptions()
      );
      const adjustedBounds = adjustImageBounds(item.bounds, width, height, nextAdjustment);
      const nextFile = await fileFromInkBounds(
        inkLayer,
        width,
        height,
        adjustedBounds,
        item.file.name,
        currentUploadProcessOptions()
      );
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
    const nextErrors = { char: "", file: "", author: "", workTitle: "", source: "", license: "" };
    if (!uploadAuthor.trim()) nextErrors.author = "請填寫作者（必填）";
    if (!uploadWorkTitle.trim()) nextErrors.workTitle = "請填寫作品名稱（必填）";
    if (!uploadSource.trim()) nextErrors.source = "請填寫來源（必填）";
    if (!uploadLicense.trim()) nextErrors.license = "請填寫授權類型（必填）";
    if (Object.values(nextErrors).some(Boolean)) {
      setFieldErrors(nextErrors);
      return;
    }
    setFieldErrors({ char: "", file: "", author: "", workTitle: "", source: "", license: "" });

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
    setMessage("批次上傳中...");
    let successCount = 0;
    try {
      for (const item of batchItems) {
        setBatchItems((items) =>
          items.map((candidate) =>
            candidate.id === item.id ? { ...candidate, status: "uploading", message: "上傳中" } : candidate
          )
        );
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
        formData.set("file", item.file, item.file.name);
        const thumbnailFile = await imageFileToThumbnailPng(item.file, `${fileNameWithoutExtension(item.file.name)}_thumb.png`);
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
          continue;
        }
        successCount += 1;
        setBatchItems((items) =>
          items.map((candidate) =>
            candidate.id === item.id ? { ...candidate, status: "done", message: `ID ${json.id}` } : candidate
          )
        );
      }
      const failureCount = batchItems.length - successCount;
      setMessage(`批次上傳完成：成功 ${successCount} 筆，失敗 ${failureCount} 筆`);
      if (successCount > 0) {
        showSuccessToast(failureCount > 0 ? `已上傳 ${successCount} 筆，${failureCount} 筆未完成` : `已成功上傳 ${successCount} 筆`);
      }
      await onUploaded?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "批次上傳失敗");
    } finally {
      setIsBatchUploading(false);
    }
  }

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const canvas = uploadPreviewCanvasRef.current;
    const nextErrors = { char: "", file: "", author: "", workTitle: "", source: "", license: "" };
    if (!isReplacingGlyph && !onlyChinese(uploadChar).slice(0, 1)) {
      nextErrors.char = "請輸入一個中文字（必填）";
    }
    if (!replaceGlyph && (!processedUploadFile || !canvas)) {
      nextErrors.file = "請先選擇圖片（必填）";
    }
    if (!uploadAuthor.trim()) {
      nextErrors.author = "請填寫作者（必填）";
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
    setFieldErrors({ char: "", file: "", author: "", workTitle: "", source: "", license: "" });

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
      });
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [uploadSourceFile, uploadEdgeSoftness, uploadInkStrength, uploadForegroundSeparation, uploadNoiseReduction]);

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

  function moveUploadPreviewErase(e: PointerEvent<HTMLCanvasElement>) {
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
      const nextFile = await canvasToCenteredGlyphFile(canvas, processedUploadFile.name);
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

  useEffect(() => {
    if (!batchEditingId) return;
    const item = batchItems.find((candidate) => candidate.id === batchEditingId);
    const canvas = batchEditCanvasRef.current;
    if (!item || !canvas) return;
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
    image.src = item.previewUrl;
  }, [batchEditingId, batchItems]);

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
      <select
        name="scriptType"
        value={uploadScriptType}
        onChange={(e) => setUploadScriptType(e.target.value)}
        disabled={isUploading || isBatchUploading}
        className="min-h-12 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-3 outline-none focus:border-red-700 disabled:opacity-70"
      >
        <option value="">書體（選填）</option>
        {scriptOptions.map((scriptType) => (
          <option key={scriptType} value={scriptType}>
            {scriptType}
          </option>
        ))}
      </select>
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
              onClick={() => { setUploadMode("single"); setFieldErrors({ char: "", file: "", author: "", workTitle: "", source: "", license: "" }); }}
              className={`min-h-10 rounded-lg px-3 text-sm font-bold ${
                uploadMode === "single" ? "bg-white text-red-800 shadow-sm" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              單張上傳
            </button>
            <button
              type="button"
              onClick={() => { setUploadMode("batch"); setFieldErrors({ char: "", file: "", author: "", workTitle: "", source: "", license: "" }); }}
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
            <div className="grid grid-cols-5 gap-2">
              {[
                ["auto", "自動"],
                ["horizontal", "橫排"],
                ["vertical", "直排"],
                ["grid", "多行"],
                ["ruled", "格線"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setBatchDirection(value as BatchSplitDirection)}
                  disabled={isBatchProcessing || isBatchUploading}
                  className={`min-h-10 rounded-xl border px-3 text-sm font-bold ${
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
            {batchOriginalPreviewUrl && (
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
            <div className="grid gap-3 rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm">
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
            </div>
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
                    tabIndex={0}
                    onKeyDown={(event) => handleBatchCardKeyDown(event, item.id)}
                    onDragOver={(event) => handleBatchDragOver(event, item.id)}
                    onDragLeave={() => {
                      if (dragOverBatchId === item.id) setDragOverBatchId(null);
                    }}
                    onDrop={(event) => handleBatchDrop(event, item.id)}
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
                            draggable={!isBatchUploading && !isBatchEditApplying}
                            onDragStart={(event) => handleBatchDragStart(event, item.id)}
                            onDragEnd={() => {
                              setDraggingBatchId(null);
                              setDragOverBatchId(null);
                            }}
                            disabled={isBatchUploading || isBatchEditApplying}
                            className="inline-flex h-7 w-7 cursor-grab items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-40"
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
                          disabled={isBatchUploading || isBatchEditApplying || item.cropAdjustment <= -4}
                          className="inline-flex h-8 min-w-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`縮小第 ${index + 1} 個字的裁切範圍`}
                          title="縮小裁切範圍"
                        >
                          <Minimize2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void adjustBatchCrop(item.id, 1)}
                          disabled={isBatchUploading || isBatchEditApplying || item.cropAdjustment >= 6}
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
                          : "選擇或拍攝圖檔後，這裡會顯示黑白化與裁放後的預覽。"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {uploadOriginalPreviewUrl && (
                <div className="mt-3 grid gap-3 rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm">
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

            <div className="absolute bottom-3 left-1/2 z-10 flex w-[min(520px,calc(100%-1.5rem))] -translate-x-1/2 items-center gap-3 rounded-xl border border-stone-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur">
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

            <div className="flex h-full w-full items-center justify-center overflow-auto p-3 pt-16 pb-20 sm:p-5 sm:pt-16 sm:pb-20">
              <canvas
                ref={uploadEditCanvasRef}
                width={uploadPreviewSize}
                height={uploadPreviewSize}
                onPointerDown={startUploadPreviewErase}
                onPointerMove={moveUploadPreviewErase}
                onPointerUp={finishUploadPreviewErase}
                onPointerCancel={finishUploadPreviewErase}
                className="max-h-full max-w-full touch-none bg-white shadow-lg"
                style={{ cursor: eraserCursor }}
                aria-label="全螢幕編輯單張圖片"
              />
            </div>
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

            <div className="absolute bottom-3 left-1/2 z-10 flex w-[min(520px,calc(100%-1.5rem))] -translate-x-1/2 items-center gap-3 rounded-xl border border-stone-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur">
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

            <div className="flex h-full w-full items-center justify-center overflow-auto p-3 pt-16 pb-20 sm:p-5 sm:pt-16 sm:pb-20">
              <canvas
                ref={batchEditCanvasRef}
                width={uploadPreviewSize}
                height={uploadPreviewSize}
                onPointerDown={startBatchEditErase}
                onPointerMove={moveBatchEditErase}
                onPointerUp={finishBatchEditErase}
                onPointerCancel={finishBatchEditErase}
                className="max-h-full max-w-full touch-none bg-white shadow-lg"
                style={{ cursor: eraserCursor }}
                aria-label="大版面編輯拆字圖片"
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
