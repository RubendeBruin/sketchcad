import { AnyElement } from "./types";
import { dist, screenToWorld } from "./utils";

const HIT_THRESHOLD_PX = 8;

export function hitTestElement(
  el: AnyElement,
  sx: number,
  sy: number,
  panX: number,
  panY: number,
  zoom: number,
  _canvasWidth: number,
  _canvasHeight: number
): boolean {
  const world = screenToWorld(sx, sy, panX, panY, zoom);
  const wx = world.x;
  const wy = world.y;
  const threshold = HIT_THRESHOLD_PX / zoom;

  switch (el.type) {
    case "hline": {
      return Math.abs(wy - el.y) < threshold;
    }
    case "vline": {
      return Math.abs(wx - el.x) < threshold;
    }
    case "line":
    case "arrow": {
      return distToSegment(wx, wy, el.x1, el.y1, el.x2, el.y2) < threshold;
    }
    case "circle": {
      const d = dist(wx, wy, el.cx, el.cy);
      return Math.abs(d - el.r) < threshold;
    }
    case "arc": {
      const d = dist(wx, wy, el.cx, el.cy);
      if (Math.abs(d - el.r) > threshold * 2) return false;
      let angle = Math.atan2(wy - el.cy, wx - el.cx);
      return isAngleInArc(angle, el.startAngle, el.endAngle);
    }
    case "measurement": {
      // Check dimension line (offset from baseline)
      const nx = -(el.y2 - el.y1);
      const ny = el.x2 - el.x1;
      const len = Math.sqrt(nx * nx + ny * ny) || 1;
      const ox = (nx / len) * el.offset;
      const oy = (ny / len) * el.offset;
      return (
        distToSegment(wx, wy, el.x1 + ox, el.y1 + oy, el.x2 + ox, el.y2 + oy) < threshold ||
        distToSegment(wx, wy, el.x1, el.y1, el.x1 + ox, el.y1 + oy) < threshold ||
        distToSegment(wx, wy, el.x2, el.y2, el.x2 + ox, el.y2 + oy) < threshold
      );
    }
    case "anglemeasurement": {
      // Check distance to arc
      const d = dist(wx, wy, el.cx, el.cy);
      if (Math.abs(d - el.radius) < threshold * 2) {
        const angle = Math.atan2(wy - el.cy, wx - el.cx);
        const a1 = Math.atan2(el.y1 - el.cy, el.x1 - el.cx);
        const a2 = Math.atan2(el.y2 - el.cy, el.x2 - el.cx);
        const spanDiff = ((a2 - a1) + 2 * Math.PI) % (2 * Math.PI);
        const anticlockwise = spanDiff > Math.PI;
        if (!anticlockwise) {
          return isAngleInArc(angle, a1, a2);
        } else {
          return isAngleInArc(angle, a2, a1);
        }
      }
      // Check extension lines
      const a1 = Math.atan2(el.y1 - el.cy, el.x1 - el.cx);
      const a2 = Math.atan2(el.y2 - el.cy, el.x2 - el.cx);
      const extEnd = el.radius + 8;
      return (
        distToSegment(wx, wy, el.cx, el.cy, el.cx + Math.cos(a1) * extEnd, el.cy + Math.sin(a1) * extEnd) < threshold ||
        distToSegment(wx, wy, el.cx, el.cy, el.cx + Math.cos(a2) * extEnd, el.cy + Math.sin(a2) * extEnd) < threshold
      );
    }
    case "point": {
      return dist(wx, wy, el.x, el.y) < threshold * 2;
    }
    case "annotation": {
      // simple bounding box hit
      return (
        wx >= el.x - 4 &&
        wx <= el.x + 200 &&
        wy >= el.y - el.fontSize - 4 &&
        wy <= el.y + 4
      );
    }
    case "viewsymbol": {
      return dist(wx, wy, el.x, el.y) < 30;
    }
    case "rect": {
      // Hit edges
      const left = el.x, right = el.x + el.width;
      const top = el.y, bottom = el.y + el.height;
      return (
        (Math.abs(wx - left) < threshold && wy >= top && wy <= bottom) ||
        (Math.abs(wx - right) < threshold && wy >= top && wy <= bottom) ||
        (Math.abs(wy - top) < threshold && wx >= left && wx <= right) ||
        (Math.abs(wy - bottom) < threshold && wx >= left && wx <= right) ||
        // filled check
        (!!el.fillColor && el.fillColor !== "none" && wx >= left && wx <= right && wy >= top && wy <= bottom)
      );
    }
    case "image": {
      return wx >= el.x && wx <= el.x + el.width && wy >= el.y && wy <= el.y + el.height;
    }
    case "spline": {
      const pts = el.points;
      if (!pts || pts.length < 2) return false;
      const n = pts.length;
      for (let i = 0; i < n - 1; i++) {
        const prev = i > 0 ? pts[i - 1] : { x: 2 * pts[0].x - pts[1].x, y: 2 * pts[0].y - pts[1].y };
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const next = i < n - 2 ? pts[i + 2] : { x: 2 * pts[n - 1].x - pts[n - 2].x, y: 2 * pts[n - 1].y - pts[n - 2].y };
        const cp1x = p1.x + (p2.x - prev.x) / 6;
        const cp1y = p1.y + (p2.y - prev.y) / 6;
        const cp2x = p2.x - (next.x - p1.x) / 6;
        const cp2y = p2.y - (next.y - p1.y) / 6;
        let lastX = p1.x, lastY = p1.y;
        const STEPS = 12;
        for (let s = 1; s <= STEPS; s++) {
          const t = s / STEPS;
          const mt = 1 - t;
          const nx = mt*mt*mt*p1.x + 3*mt*mt*t*cp1x + 3*mt*t*t*cp2x + t*t*t*p2.x;
          const ny = mt*mt*mt*p1.y + 3*mt*mt*t*cp1y + 3*mt*t*t*cp2y + t*t*t*p2.y;
          if (distToSegment(wx, wy, lastX, lastY, nx, ny) < threshold) return true;
          lastX = nx; lastY = ny;
        }
      }
      return false;
    }
  }
  return false;
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(px, py, ax, ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return dist(px, py, ax + t * dx, ay + t * dy);
}

function isAngleInArc(angle: number, start: number, end: number): boolean {
  // Normalize angles to [0, 2π)
  const TWO_PI = Math.PI * 2;
  angle = ((angle % TWO_PI) + TWO_PI) % TWO_PI;
  start = ((start % TWO_PI) + TWO_PI) % TWO_PI;
  end = ((end % TWO_PI) + TWO_PI) % TWO_PI;
  if (start <= end) {
    return angle >= start && angle <= end;
  } else {
    return angle >= start || angle <= end;
  }
}

// ────────────────────────────────────────────────────
// Handle definitions
// ────────────────────────────────────────────────────
export interface Handle {
  id: string;
  x: number; // world coords
  y: number;
  cursor: string;
}

export function getHandles(el: AnyElement): Handle[] {
  switch (el.type) {
    case "hline":
      return [{ id: "y", x: 0, y: el.y, cursor: "ns-resize" }];
    case "vline":
      return [{ id: "x", x: el.x, y: 0, cursor: "ew-resize" }];
    case "line":
    case "arrow":
      return [
        { id: "p1", x: el.x1, y: el.y1, cursor: "crosshair" },
        { id: "p2", x: el.x2, y: el.y2, cursor: "crosshair" },
        { id: "mid", x: (el.x1 + el.x2) / 2, y: (el.y1 + el.y2) / 2, cursor: "move" },
      ];
    case "circle":
      return [
        { id: "center", x: el.cx, y: el.cy, cursor: "move" },
        { id: "r", x: el.cx + el.r, y: el.cy, cursor: "ew-resize" },
      ];
    case "arc":
      return [
        { id: "center", x: el.cx, y: el.cy, cursor: "move" },
        { id: "start", x: el.cx + el.r * Math.cos(el.startAngle), y: el.cy + el.r * Math.sin(el.startAngle), cursor: "crosshair" },
        { id: "end", x: el.cx + el.r * Math.cos(el.endAngle), y: el.cy + el.r * Math.sin(el.endAngle), cursor: "crosshair" },
        { id: "r", x: el.cx + el.r * Math.cos((el.startAngle + el.endAngle) / 2), y: el.cy + el.r * Math.sin((el.startAngle + el.endAngle) / 2), cursor: "ew-resize" },
      ];
    case "measurement": {
      const nx = -(el.y2 - el.y1);
      const ny = el.x2 - el.x1;
      const len = Math.sqrt(nx * nx + ny * ny) || 1;
      const ox = (nx / len) * el.offset;
      const oy = (ny / len) * el.offset;
      return [
        { id: "p1", x: el.x1, y: el.y1, cursor: "crosshair" },
        { id: "p2", x: el.x2, y: el.y2, cursor: "crosshair" },
        { id: "offset", x: el.x1 + ox + (el.x2 - el.x1) / 2, y: el.y1 + oy + (el.y2 - el.y1) / 2, cursor: "ns-resize" },
      ];
    }
    case "anglemeasurement": {
      const a1 = Math.atan2(el.y1 - el.cy, el.x1 - el.cx);
      const a2 = Math.atan2(el.y2 - el.cy, el.x2 - el.cx);
      const diff = ((a2 - a1) + 2 * Math.PI) % (2 * Math.PI);
      const midAngle = diff > Math.PI ? a1 - (2 * Math.PI - diff) / 2 : a1 + diff / 2;
      return [
        { id: "vertex", x: el.cx, y: el.cy, cursor: "move" },
        { id: "arm1", x: el.x1, y: el.y1, cursor: "crosshair" },
        { id: "arm2", x: el.x2, y: el.y2, cursor: "crosshair" },
        { id: "r", x: el.cx + Math.cos(midAngle) * el.radius, y: el.cy + Math.sin(midAngle) * el.radius, cursor: "move" },
      ];
    }
    case "point":
      return [{ id: "p", x: el.x, y: el.y, cursor: "move" }];
    case "annotation":
      return [{ id: "p", x: el.x, y: el.y, cursor: "move" }];
    case "viewsymbol":
      return [
        { id: "p", x: el.x, y: el.y, cursor: "move" },
        {
          id: "dir",
          x: el.x + 40 * Math.cos(el.direction),
          y: el.y + 40 * Math.sin(el.direction),
          cursor: "crosshair",
        },
      ];
    case "rect":
      return [
        { id: "tl", x: el.x, y: el.y, cursor: "nwse-resize" },
        { id: "tr", x: el.x + el.width, y: el.y, cursor: "nesw-resize" },
        { id: "bl", x: el.x, y: el.y + el.height, cursor: "nesw-resize" },
        { id: "br", x: el.x + el.width, y: el.y + el.height, cursor: "nwse-resize" },
        { id: "tm", x: el.x + el.width / 2, y: el.y, cursor: "ns-resize" },
        { id: "bm", x: el.x + el.width / 2, y: el.y + el.height, cursor: "ns-resize" },
        { id: "ml", x: el.x, y: el.y + el.height / 2, cursor: "ew-resize" },
        { id: "mr", x: el.x + el.width, y: el.y + el.height / 2, cursor: "ew-resize" },
      ];
    case "image":
      return [
        { id: "tl", x: el.x, y: el.y, cursor: "nwse-resize" },
        { id: "tr", x: el.x + el.width, y: el.y, cursor: "nesw-resize" },
        { id: "bl", x: el.x, y: el.y + el.height, cursor: "nesw-resize" },
        { id: "br", x: el.x + el.width, y: el.y + el.height, cursor: "nwse-resize" },
      ];
    case "spline": {
      if (!el.points) return [];
      return el.points.map((p, i) => ({
        id: `p${i}`,
        x: p.x,
        y: p.y,
        cursor: "crosshair",
      }));
    }
    default:
      return [];
  }
}

export function applyHandleDrag(
  el: AnyElement,
  handleId: string,
  dx: number,
  dy: number,
  newX: number,
  newY: number
): Partial<AnyElement> {
  switch (el.type) {
    case "hline":
      return { y: newY };
    case "vline":
      return { x: newX };
    case "line":
    case "arrow":
      if (handleId === "p1") return { x1: newX, y1: newY };
      if (handleId === "p2") return { x2: newX, y2: newY };
      if (handleId === "mid") return { x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
      break;
    case "circle":
      if (handleId === "center") return { cx: el.cx + dx, cy: el.cy + dy };
      if (handleId === "r") {
        const r = Math.max(1, Math.abs(newX - el.cx));
        return { r };
      }
      break;
    case "arc":
      if (handleId === "center") return { cx: el.cx + dx, cy: el.cy + dy };
      if (handleId === "start") {
        const angle = Math.atan2(newY - el.cy, newX - el.cx);
        return { startAngle: angle };
      }
      if (handleId === "end") {
        const angle = Math.atan2(newY - el.cy, newX - el.cx);
        return { endAngle: angle };
      }
      if (handleId === "r") {
        const r = Math.max(1, dist(newX, newY, el.cx, el.cy));
        return { r };
      }
      break;
    case "measurement":
      if (handleId === "p1") return { x1: newX, y1: newY };
      if (handleId === "p2") return { x2: newX, y2: newY };
      if (handleId === "offset") {
        // compute new offset from drag
        const nx = -(el.y2 - el.y1);
        const ny = el.x2 - el.x1;
        const len = Math.sqrt(nx * nx + ny * ny) || 1;
        const ux = nx / len;
        const uy = ny / len;
        const mx = (el.x1 + el.x2) / 2;
        const my = (el.y1 + el.y2) / 2;
        const offset = (newX - mx) * ux + (newY - my) * uy;
        return { offset };
      }
      break;
    case "anglemeasurement":
      if (handleId === "vertex") return { cx: el.cx + dx, cy: el.cy + dy, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
      if (handleId === "arm1") return { x1: newX, y1: newY };
      if (handleId === "arm2") return { x2: newX, y2: newY };
      if (handleId === "r") return { radius: Math.max(5, dist(newX, newY, el.cx, el.cy)) };
      break;
    case "point":
      return { x: newX, y: newY };
    case "annotation":
      return { x: newX, y: newY };
    case "viewsymbol":
      if (handleId === "p") return { x: newX, y: newY };
      if (handleId === "dir") {
        const direction = Math.atan2(newY - el.y, newX - el.x);
        return { direction };
      }
      break;
    case "rect":
      return applyRectHandle(el, handleId, newX, newY);
    case "image":
      return applyImageHandle(el, handleId, newX, newY);
    case "spline": {
      const idx = parseInt(handleId.slice(1), 10);
      if (isNaN(idx)) break;
      const newPoints = el.points.map((p, i) =>
        i === idx ? { x: newX, y: newY } : { ...p }
      );
      return { points: newPoints } as Partial<AnyElement>;
    }
  }
  return {};
}

function applyRectHandle(
  el: { x: number; y: number; width: number; height: number },
  handleId: string,
  newX: number,
  newY: number
): Partial<{ x: number; y: number; width: number; height: number }> {
  const r = el.x + el.width;
  const b = el.y + el.height;
  switch (handleId) {
    case "tl": return { x: newX, y: newY, width: Math.max(1, r - newX), height: Math.max(1, b - newY) };
    case "tr": return { y: newY, width: Math.max(1, newX - el.x), height: Math.max(1, b - newY) };
    case "bl": return { x: newX, width: Math.max(1, r - newX), height: Math.max(1, newY - el.y) };
    case "br": return { width: Math.max(1, newX - el.x), height: Math.max(1, newY - el.y) };
    case "tm": return { y: newY, height: Math.max(1, b - newY) };
    case "bm": return { height: Math.max(1, newY - el.y) };
    case "ml": return { x: newX, width: Math.max(1, r - newX) };
    case "mr": return { width: Math.max(1, newX - el.x) };
    default: return {};
  }
}

function applyImageHandle(
  el: { x: number; y: number; width: number; height: number },
  handleId: string,
  newX: number,
  _newY: number
): Partial<{ x: number; y: number; width: number; height: number }> {
  const aspect = el.width / el.height;
  switch (handleId) {
    case "tl": {
      const newW = Math.max(10, el.x + el.width - newX);
      return { x: el.x + el.width - newW, y: el.y + el.height - newW / aspect, width: newW, height: newW / aspect };
    }
    case "tr": {
      const newW = Math.max(10, newX - el.x);
      return { width: newW, height: newW / aspect };
    }
    case "bl": {
      const newW = Math.max(10, el.x + el.width - newX);
      return { x: el.x + el.width - newW, width: newW, height: newW / aspect };
    }
    case "br": {
      const newW = Math.max(10, newX - el.x);
      return { width: newW, height: newW / aspect };
    }
    default: return {};
  }
}

export function moveElement(el: AnyElement, dx: number, dy: number): Partial<AnyElement> {
  switch (el.type) {
    case "hline": return { y: el.y + dy };
    case "vline": return { x: el.x + dx };
    case "line":
    case "arrow":
    case "measurement":
      return { x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
    case "anglemeasurement":
      return { cx: el.cx + dx, cy: el.cy + dy, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
    case "circle":
    case "arc":
      return { cx: el.cx + dx, cy: el.cy + dy };
    case "point":
      return { x: el.x + dx, y: el.y + dy };
    case "annotation":
      return { x: el.x + dx, y: el.y + dy };
    case "viewsymbol":
      return { x: el.x + dx, y: el.y + dy };
    case "rect":
    case "image":
      return { x: el.x + dx, y: el.y + dy };
    default:
      return {};
  }
}
