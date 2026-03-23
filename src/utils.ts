import { AnyElement, Point } from "./types";

// ────────────────────────────────────────────────────
// ID generation
// ────────────────────────────────────────────────────
export function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ────────────────────────────────────────────────────
// Transform: world <-> screen
// ────────────────────────────────────────────────────
export function worldToScreen(
  wx: number,
  wy: number,
  panX: number,
  panY: number,
  zoom: number
): Point {
  return { x: wx * zoom + panX, y: wy * zoom + panY };
}

export function screenToWorld(
  sx: number,
  sy: number,
  panX: number,
  panY: number,
  zoom: number
): Point {
  return { x: (sx - panX) / zoom, y: (sy - panY) / zoom };
}

// ────────────────────────────────────────────────────
// Geometry helpers
// ────────────────────────────────────────────────────
export function dist(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function midpoint(x1: number, y1: number, x2: number, y2: number): Point {
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function angleDeg(x1: number, y1: number, x2: number, y2: number): number {
  return (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
}

// ────────────────────────────────────────────────────
// Element bounding box (in world space, used for hit testing + selection box)
// ────────────────────────────────────────────────────
export function getBoundingBox(el: AnyElement): {
  x: number;
  y: number;
  w: number;
  h: number;
} | null {
  const PAD = 20;
  switch (el.type) {
    case "hline":
      return null; // infinite – handled separately
    case "vline":
      return null;
    case "line":
      return {
        x: Math.min(el.x1, el.x2) - PAD,
        y: Math.min(el.y1, el.y2) - PAD,
        w: Math.abs(el.x2 - el.x1) + PAD * 2,
        h: Math.abs(el.y2 - el.y1) + PAD * 2,
      };
    case "circle":
      return { x: el.cx - el.r, y: el.cy - el.r, w: el.r * 2, h: el.r * 2 };
    case "arc": {
      // simple approximation: use full circle bounding box for arc
      return { x: el.cx - el.r, y: el.cy - el.r, w: el.r * 2, h: el.r * 2 };
    }
    case "measurement": {
      const nx = -(el.y2 - el.y1);
      const ny = el.x2 - el.x1;
      const len = Math.sqrt(nx * nx + ny * ny) || 1;
      const ox = (nx / len) * el.offset;
      const oy = (ny / len) * el.offset;
      const px1 = el.x1 + ox;
      const py1 = el.y1 + oy;
      const px2 = el.x2 + ox;
      const py2 = el.y2 + oy;
      return {
        x: Math.min(px1, px2) - PAD,
        y: Math.min(py1, py2) - PAD,
        w: Math.abs(px2 - px1) + PAD * 2,
        h: Math.abs(py2 - py1) + PAD * 2,
      };
    }
    case "point":
      return { x: el.x - PAD, y: el.y - PAD, w: PAD * 2, h: PAD * 2 };
    case "annotation":
      return { x: el.x - PAD, y: el.y - el.fontSize - PAD, w: 200, h: el.fontSize + PAD * 2 };
    case "arrow":
      return {
        x: Math.min(el.x1, el.x2) - PAD,
        y: Math.min(el.y1, el.y2) - PAD,
        w: Math.abs(el.x2 - el.x1) + PAD * 2,
        h: Math.abs(el.y2 - el.y1) + PAD * 2,
      };
    case "viewsymbol":
      return { x: el.x - 30, y: el.y - 30, w: 60, h: 60 };
    case "rect":
      return { x: el.x, y: el.y, w: el.width, h: el.height };
    case "image":
      return { x: el.x, y: el.y, w: el.width, h: el.height };
    default:
      return null;
  }
}
