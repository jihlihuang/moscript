"use client";

import getStroke from "perfect-freehand";
import { RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { type GlyphLike } from "@/components/GlyphImage";

type Point = {
  x: number;
  y: number;
  time: number;
  pressure: number;
};

type Stroke = {
  points: Point[];
  size: number;
  velocitySensitive: boolean;
};

export function GlyphPracticeCanvas({ glyph }: { glyph: GlyphLike }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  
  // 預設給平板/電腦的筆粗為 10
  const [brushSize, setBrushSize] = useState(15);
  const [inkTexture, setInkTexture] = useState(0.7);
  const [guideOpacity, setGuideOpacity] = useState(0.28);
  const [velocitySensitive, setVelocitySensitive] = useState(true);
  const [strokeCount, setStrokeCount] = useState(0);

  // 新增：元件掛載時偵測螢幕寬度，自動調整預設筆粗
  useEffect(() => {
    // 以 768px 作為手機與平板的分界 (對應 Tailwind 的 md 斷點)
    if (window.innerWidth < 768) {
      setBrushSize(7);
    }
  }, []);

  function getCanvasPoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
      time: performance.now(),
      pressure: event.pressure && event.pressure > 0 ? event.pressure : 0.55,
    };
  }

  function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  function getSegmentSize(stroke: Stroke, from: Point, to: Point, width: number, height: number) {
    if (!stroke.velocitySensitive) return stroke.size;

    const distance = Math.hypot((to.x - from.x) * width, (to.y - from.y) * height);
    const elapsed = Math.max(8, to.time - from.time);
    const speed = distance / elapsed;
    const pressure = (from.pressure + to.pressure) / 2;
    const sizeMultiplier = clamp(1.55 - speed * 0.55 + pressure * 0.35, 0.45, 1.9);
    return clamp(stroke.size * sizeMultiplier, 2, 40);
  }

  function getStrokeProgress(index: number, total: number) {
    return total <= 1 ? 1 : index / (total - 1);
  }

  function getFreehandPoint(
    stroke: Stroke,
    point: Point,
    previous: Point | undefined,
    index: number,
    total: number,
    width: number,
    height: number
  ) {
    let pressure = point.pressure;
    if (stroke.velocitySensitive && previous) {
      const distance = Math.hypot((point.x - previous.x) * width, (point.y - previous.y) * height);
      const elapsed = Math.max(8, point.time - previous.time);
      const speed = distance / elapsed;
      pressure = clamp(point.pressure + 0.4 - speed * 0.16, 0.08, 1);
    }
    const progress = getStrokeProgress(index, total);
    const pressIn = progress < 0.18 ? 0.72 + progress / 0.18 * 0.36 : 1;
    const liftOut = progress > 0.8 ? 1 - Math.pow((progress - 0.8) / 0.2, 1.35) * 0.55 : 1;
    pressure = clamp(pressure * pressIn * liftOut, 0.16, 1);
    return [point.x * width, point.y * height, pressure] as [number, number, number];
  }

  function getStrokeAngle(points: Point[], width: number, height: number, fromStart: boolean) {
    if (points.length < 2) return 0;
    const first = fromStart ? points[0] : points[points.length - 2];
    const second = fromStart ? points[1] : points[points.length - 1];
    return Math.atan2((second.y - first.y) * height, (second.x - first.x) * width) + Math.PI / 2;
  }

  function smoothPoints(points: Point[]) {
    if (points.length < 3) return points;
    return points.map((point, index) => {
      if (index === 0 || index === points.length - 1) return point;
      const previous = points[index - 1];
      const next = points[index + 1];
      return {
        ...point,
        x: previous.x * 0.2 + point.x * 0.6 + next.x * 0.2,
        y: previous.y * 0.2 + point.y * 0.6 + next.y * 0.2,
        pressure: previous.pressure * 0.15 + point.pressure * 0.7 + next.pressure * 0.15,
      };
    });
  }

  function interpolatePoints(points: Point[]) {
    if (points.length < 2) return points;
    const nextPoints: Point[] = [];
    for (let index = 0; index < points.length - 1; index += 1) {
      const current = points[index];
      const next = points[index + 1];
      nextPoints.push(current);
      const distance = Math.hypot(next.x - current.x, next.y - current.y);
      const steps = Math.max(1, Math.ceil(distance / 0.012));
      for (let step = 1; step < steps; step += 1) {
        const progress = step / steps;
        nextPoints.push({
          x: current.x + (next.x - current.x) * progress,
          y: current.y + (next.y - current.y) * progress,
          time: current.time + (next.time - current.time) * progress,
          pressure: current.pressure + (next.pressure - current.pressure) * progress,
        });
      }
    }
    nextPoints.push(points[points.length - 1]);
    return nextPoints;
  }

  function drawPressMark(
    ctx: CanvasRenderingContext2D,
    point: Point,
    angle: number,
    width: number,
    height: number,
    radius: number,
    alpha: number
  ) {
    ctx.save();
    ctx.translate(point.x * width, point.y * height);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#100d0c";
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.78, radius * 1.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFilledStroke(ctx: CanvasRenderingContext2D, outline: number[][]) {
    if (outline.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(outline[0][0], outline[0][1]);
    for (let index = 1; index < outline.length - 2; index += 1) {
      const current = outline[index];
      const next = outline[index + 1];
      ctx.quadraticCurveTo(
        current[0],
        current[1],
        (current[0] + next[0]) / 2,
        (current[1] + next[1]) / 2
      );
    }
    const last = outline[outline.length - 1];
    ctx.lineTo(last[0], last[1]);
    ctx.closePath();
    ctx.fill();
  }

  function seededNoise(seed: number) {
    return Math.sin(seed * 12.9898) * 43758.5453 % 1;
  }

  function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, width: number, height: number) {
    if (stroke.points.length < 2) return;
    const scale = Math.min((window.devicePixelRatio || 1) * 1.75, 4);
    const smoothedPoints = interpolatePoints(smoothPoints(stroke.points));
    const freehandPoints = smoothedPoints.map((point, index) =>
      getFreehandPoint(stroke, point, smoothedPoints[index - 1], index, smoothedPoints.length, width, height)
    );
    const outline = getStroke(freehandPoints, {
      size: stroke.size * scale * 2.4,
      thinning: 0.72,
      smoothing: 0.92,
      streamline: 0.68,
      easing: (t) => t,
      simulatePressure: false,
      start: {
        taper: stroke.size * scale * 0.45,
        easing: (t) => 1 - Math.pow(1 - t, 2),
      },
      end: {
        taper: stroke.size * scale * 2.8,
        easing: (t) => Math.sqrt(t),
      },
    });

    ctx.save();
    drawPressMark(ctx, smoothedPoints[0], getStrokeAngle(smoothedPoints, width, height, true), width, height, stroke.size * scale * 1.35, 0.5);
    ctx.fillStyle = "#171412";
    ctx.globalAlpha = 0.94;
    drawFilledStroke(ctx, outline);
    drawPressMark(ctx, smoothedPoints[0], getStrokeAngle(smoothedPoints, width, height, true), width, height, stroke.size * scale * 0.86, 0.26);

    if (inkTexture > 0) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = inkTexture * 0.045;
      for (let index = 1; index < stroke.points.length; index += 2) {
        const point = stroke.points[index];
        const previous = stroke.points[index - 1];
        const size = getSegmentSize(stroke, previous, point, width, height) * scale;
        const x = point.x * width + seededNoise(index) * size * 0.6;
        const y = point.y * height + seededNoise(index + 11) * size * 0.6;
        ctx.beginPath();
        ctx.ellipse(x, y, size * 0.16, size * 0.55, seededNoise(index + 23) * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = inkTexture * 0.18;
      ctx.fillStyle = "#0f0d0c";
      drawFilledStroke(ctx, getStroke(freehandPoints, {
        size: stroke.size * scale * 1.55,
        thinning: 0.5,
        smoothing: 0.9,
        streamline: 0.66,
        simulatePressure: false,
      }));
      const lastPoint = smoothedPoints[smoothedPoints.length - 1];
      drawPressMark(ctx, lastPoint, getStrokeAngle(smoothedPoints, width, height, false), width, height, stroke.size * scale * 0.34, inkTexture * 0.18);
    }
    ctx.restore();
  }

  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokesRef.current) {
      drawStroke(ctx, stroke, canvas.width, canvas.height);
    }
    if (currentStrokeRef.current) {
      drawStroke(ctx, currentStrokeRef.current, canvas.width, canvas.height);
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min((window.devicePixelRatio || 1) * 1.75, 4);
      canvas.width = Math.round(rect.width * scale);
      canvas.height = Math.round(rect.height * scale);
      redraw();
    };

    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  function startStroke(event: PointerEvent<HTMLCanvasElement>) {
    const point = getCanvasPoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    currentStrokeRef.current = { points: [point], size: brushSize, velocitySensitive };
  }

  function continueStroke(event: PointerEvent<HTMLCanvasElement>) {
    const point = getCanvasPoint(event);
    if (!point || !currentStrokeRef.current) return;
    currentStrokeRef.current.points.push(point);
    redraw();
  }

  function endStroke() {
    if (!currentStrokeRef.current) return;
    if (currentStrokeRef.current.points.length > 1) {
      strokesRef.current.push(currentStrokeRef.current);
    }
    currentStrokeRef.current = null;
    setStrokeCount(strokesRef.current.length);
    redraw();
  }

  function undoStroke() {
    strokesRef.current.pop();
    setStrokeCount(strokesRef.current.length);
    redraw();
  }

  function clearCanvas() {
    strokesRef.current = [];
    currentStrokeRef.current = null;
    setStrokeCount(0);
    redraw();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="rounded-3xl border border-stone-200 bg-white p-3 shadow-sm sm:p-5">
        <div className="relative mx-auto aspect-square w-full max-w-[min(88vw,720px)] overflow-hidden rounded-3xl bg-stone-50">
          
          <div className="absolute left-3 top-3 z-20 flex flex-col gap-2 sm:left-4 sm:top-4">
            <button
              type="button"
              onClick={undoStroke}
              disabled={strokeCount === 0}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-stone-600 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:text-stone-900 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              title="復原 (Undo)"
            >
              <RotateCcw className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={clearCanvas}
              disabled={strokeCount === 0}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-stone-600 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:text-red-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              title="清除畫面 (Clear)"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>

          <img
            src={glyph.imageUrl}
            alt={`${glyph.char}｜${glyph.author ?? "佚名"}`}
            className="absolute inset-0 h-full w-full object-contain p-8 mix-blend-multiply sm:p-12"
            style={{ opacity: guideOpacity }}
          />
          <canvas
            ref={canvasRef}
            onPointerDown={startStroke}
            onPointerMove={continueStroke}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
            aria-label={`${glyph.char} 筆順練習畫布`}
          />
        </div>
      </div>

      <aside className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-4">
          <div className="font-serif text-5xl font-bold text-stone-900">{glyph.char}</div>
          <div className="mt-2 text-sm text-stone-500">
            {glyph.author || "佚名"}｜{glyph.scriptType || "未標註"}｜{glyph.workTitle || "未標題"}
          </div>
        </div>

        <div className="space-y-4">
          <label className="block">
            <div className="mb-2 flex items-center justify-between text-sm font-bold text-stone-700">
              <span>筆粗</span>
              <span>{brushSize}px</span>
            </div>
            <input
              type="range"
              min="4"
              max="24"
              value={brushSize}
              onChange={(event) => setBrushSize(Number(event.target.value))}
              className="w-full accent-red-800"
            />
          </label>

          <label className="block">
            <div className="mb-2 flex items-center justify-between text-sm font-bold text-stone-700">
              <span>毛筆墨感</span>
              <span>{Math.round(inkTexture * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={inkTexture}
              onChange={(event) => setInkTexture(Number(event.target.value))}
              className="w-full accent-red-800"
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-2xl bg-stone-50 p-3">
            <span>
              <span className="block text-sm font-bold text-stone-700">速度感應筆粗</span>
              <span className="block text-xs text-stone-500">慢寫較粗，快寫較細</span>
            </span>
            <input
              type="checkbox"
              checked={velocitySensitive}
              onChange={(event) => setVelocitySensitive(event.target.checked)}
              className="h-5 w-5 accent-red-800"
            />
          </label>

          <label className="block">
            <div className="mb-2 flex items-center justify-between text-sm font-bold text-stone-700">
              <span>底稿濃淡</span>
              <span>{Math.round(guideOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.08"
              max="0.6"
              step="0.02"
              value={guideOpacity}
              onChange={(event) => setGuideOpacity(Number(event.target.value))}
              className="w-full accent-red-800"
            />
          </label>

          <div className="rounded-2xl bg-stone-50 p-3 text-sm text-stone-500">
            毛筆輪廓模式使用自然筆畫外形，並疊加墨色紋理；下筆較厚，提筆會收斂但不會過度尖銳。
          </div>
        </div>
      </aside>
    </div>
  );
}