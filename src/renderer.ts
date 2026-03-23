import { AnyElement } from "./types";
import { worldToScreen } from "./utils";
import { Handle } from "./hitTest";

const HANDLE_RADIUS = 5;
const SELECTION_COLOR = "#2563eb";
const SELECTION_FILL = "rgba(37,99,235,0.08)";
const HANDLE_COLOR = "#fff";
const HANDLE_BORDER = "#2563eb";
const GRID_COLOR = "#e5e7eb";
const GRID_MAJOR_COLOR = "#d1d5db";
const SNAP_COLOR = "#f59e0b";

export function renderGrid(
  ctx: CanvasRenderingContext2D,
  panX: number,
  panY: number,
  zoom: number,
  width: number,
  height: number
) {
  const baseGrid = 20;
  const gridSize = baseGrid; // world units
  const screenGridSize = gridSize * zoom;

  if (screenGridSize < 6) return; // too small to draw

  // Determine first grid line in world coords (unused but kept for clarity)
  // const startX = ...
  ctx.save();
  ctx.lineWidth = 0.5;

  for (let sx = ((panX % (gridSize * zoom)) + gridSize * zoom) % (gridSize * zoom); sx < width; sx += screenGridSize) {
    const wx = Math.round((sx - panX) / zoom / gridSize) * gridSize;
    const isMajor = wx % (gridSize * 5) === 0;
    ctx.strokeStyle = isMajor ? GRID_MAJOR_COLOR : GRID_COLOR;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, height);
    ctx.stroke();
  }

  for (let sy = ((panY % (gridSize * zoom)) + gridSize * zoom) % (gridSize * zoom); sy < height; sy += screenGridSize) {
    const wy = Math.round((sy - panY) / zoom / gridSize) * gridSize;
    const isMajor = wy % (gridSize * 5) === 0;
    ctx.strokeStyle = isMajor ? GRID_MAJOR_COLOR : GRID_COLOR;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(width, sy);
    ctx.stroke();
  }

  ctx.restore();
}

export function renderElement(
  ctx: CanvasRenderingContext2D,
  el: AnyElement,
  panX: number,
  panY: number,
  zoom: number,
  canvasWidth: number,
  canvasHeight: number,
  images: Map<string, HTMLImageElement>
) {
  ctx.save();

  // Apply element styles
  ctx.globalAlpha = el.opacity;
  ctx.strokeStyle = el.strokeColor;
  ctx.lineWidth = el.strokeWidth * zoom;
  if (el.strokeDash && el.strokeDash.length > 0) {
    ctx.setLineDash(el.strokeDash.map((d) => d * zoom));
  } else {
    ctx.setLineDash([]);
  }
  ctx.fillStyle = el.fillColor ?? "none";

  function w2s(wx: number, wy: number) {
    return worldToScreen(wx, wy, panX, panY, zoom);
  }

  switch (el.type) {
    case "hline": {
      const { y: sy } = w2s(0, el.y);
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(canvasWidth, sy);
      ctx.stroke();
      break;
    }
    case "vline": {
      const { x: sx } = w2s(el.x, 0);
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, canvasHeight);
      ctx.stroke();
      break;
    }
    case "line": {
      const p1 = w2s(el.x1, el.y1);
      const p2 = w2s(el.x2, el.y2);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      break;
    }
    case "circle": {
      const c = w2s(el.cx, el.cy);
      ctx.beginPath();
      ctx.arc(c.x, c.y, el.r * zoom, 0, Math.PI * 2);
      if (el.fillColor && el.fillColor !== "none") {
        ctx.fillStyle = el.fillColor;
        ctx.fill();
      }
      ctx.stroke();
      break;
    }
    case "arc": {
      const c = w2s(el.cx, el.cy);
      ctx.beginPath();
      ctx.arc(c.x, c.y, el.r * zoom, el.startAngle, el.endAngle);
      ctx.stroke();
      break;
    }
    case "measurement": {
      renderMeasurement(ctx, el, panX, panY, zoom);
      break;
    }
    case "anglemeasurement": {
      renderAngleMeasurement(ctx, el, panX, panY, zoom);
      break;
    }
    case "point": {
      const p = w2s(el.x, el.y);
      const s = el.size * zoom;
      ctx.lineWidth = Math.max(1, el.strokeWidth * zoom);
      ctx.beginPath();
      if (el.style === "cross") {
        ctx.moveTo(p.x - s, p.y);
        ctx.lineTo(p.x + s, p.y);
        ctx.moveTo(p.x, p.y - s);
        ctx.lineTo(p.x, p.y + s);
        ctx.stroke();
      } else if (el.style === "x") {
        ctx.moveTo(p.x - s, p.y - s);
        ctx.lineTo(p.x + s, p.y + s);
        ctx.moveTo(p.x + s, p.y - s);
        ctx.lineTo(p.x - s, p.y + s);
        ctx.stroke();
      } else {
        ctx.arc(p.x, p.y, s / 2, 0, Math.PI * 2);
        ctx.fillStyle = el.strokeColor;
        ctx.fill();
      }
      break;
    }
    case "annotation": {
      const p = w2s(el.x, el.y);
      let fontStr = "";
      if (el.italic) fontStr += "italic ";
      if (el.bold) fontStr += "bold ";
      fontStr += `${el.fontSize * zoom}px ${el.fontFamily}`;
      ctx.font = fontStr;
      ctx.fillStyle = el.strokeColor;
      ctx.textAlign = el.align;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(el.text, p.x, p.y);
      break;
    }
    case "arrow": {
      const p1 = w2s(el.x1, el.y1);
      const p2 = w2s(el.x2, el.y2);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      if (el.arrowEnd) drawArrowhead(ctx, p1.x, p1.y, p2.x, p2.y, el.strokeColor, el.strokeWidth * zoom);
      if (el.arrowStart) drawArrowhead(ctx, p2.x, p2.y, p1.x, p1.y, el.strokeColor, el.strokeWidth * zoom);
      break;
    }
    case "viewsymbol": {
      renderViewSymbol(ctx, el, panX, panY, zoom);
      break;
    }
    case "rect": {
      const p = w2s(el.x, el.y);
      const w = el.width * zoom;
      const h = el.height * zoom;
      if (el.fillColor && el.fillColor !== "none") {
        ctx.fillStyle = el.fillColor;
        ctx.fillRect(p.x, p.y, w, h);
      }
      ctx.strokeRect(p.x, p.y, w, h);
      break;
    }
    case "image": {
      const p = w2s(el.x, el.y);
      const w = el.width * zoom;
      const h = el.height * zoom;
      const img = images.get(el.id);
      if (img) {
        ctx.drawImage(img, p.x, p.y, w, h);
      } else {
        ctx.strokeStyle = "#aaa";
        ctx.strokeRect(p.x, p.y, w, h);
        ctx.fillStyle = "#f3f4f6";
        ctx.fillRect(p.x + 1, p.y + 1, w - 2, h - 2);
        ctx.fillStyle = "#9ca3af";
        ctx.font = `${12 * zoom}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Image", p.x + w / 2, p.y + h / 2);
      }
      break;
    }
    case "spline": {
      if (el.points && el.points.length >= 2) {
        catmullRomOnCanvas(ctx, el.points, panX, panY, zoom);
      }
      break;
    }
  }

  ctx.restore();
}

function renderAngleMeasurement(
  ctx: CanvasRenderingContext2D,
  el: {
    cx: number; cy: number;
    x1: number; y1: number;
    x2: number; y2: number;
    radius: number;
    text: string; unit: string;
    strokeColor: string; strokeWidth: number;
  },
  panX: number,
  panY: number,
  zoom: number
) {
  function w2s(wx: number, wy: number) {
    return worldToScreen(wx, wy, panX, panY, zoom);
  }

  const a1 = Math.atan2(el.y1 - el.cy, el.x1 - el.cx);
  const a2 = Math.atan2(el.y2 - el.cy, el.x2 - el.cx);
  const r = el.radius * zoom;
  const vc = w2s(el.cx, el.cy);

  // Determine whether to sweep CW or CCW to get the shorter arc
  const diff = ((a2 - a1) + 2 * Math.PI) % (2 * Math.PI);
  const anticlockwise = diff > Math.PI;

  // Extension lines: small gap at vertex, extend a little past the arc
  const extEnd = el.radius + 8;
  const extGap = 4;
  ctx.setLineDash([]);
  for (const [ang] of [[a1], [a2]]) {
    const ps = w2s(el.cx + Math.cos(ang) * extGap, el.cy + Math.sin(ang) * extGap);
    const pe = w2s(el.cx + Math.cos(ang) * extEnd, el.cy + Math.sin(ang) * extEnd);
    ctx.beginPath();
    ctx.moveTo(ps.x, ps.y);
    ctx.lineTo(pe.x, pe.y);
    ctx.stroke();
  }

  // Arc
  ctx.beginPath();
  ctx.arc(vc.x, vc.y, r, a1, a2, anticlockwise);
  ctx.stroke();

  // Arrowheads at arc endpoints, pointing tangentially along the arc
  const arc1x = vc.x + r * Math.cos(a1);
  const arc1y = vc.y + r * Math.sin(a1);
  const arc2x = vc.x + r * Math.cos(a2);
  const arc2y = vc.y + r * Math.sin(a2);
  const eps = 5;
  const lw = el.strokeWidth * zoom;
  if (!anticlockwise) {
    // CCW: tangent at a1 forward = (-sin, cos); "behind" = (sin, -cos)
    drawArrowhead(ctx, arc1x + eps * Math.sin(a1), arc1y - eps * Math.cos(a1), arc1x, arc1y, el.strokeColor, lw);
    drawArrowhead(ctx, arc2x - eps * Math.sin(a2), arc2y + eps * Math.cos(a2), arc2x, arc2y, el.strokeColor, lw);
  } else {
    // CW: tangent at a1 forward = (sin, -cos); "behind" = (-sin, cos)
    drawArrowhead(ctx, arc1x - eps * Math.sin(a1), arc1y + eps * Math.cos(a1), arc1x, arc1y, el.strokeColor, lw);
    drawArrowhead(ctx, arc2x + eps * Math.sin(a2), arc2y - eps * Math.cos(a2), arc2x, arc2y, el.strokeColor, lw);
  }

  // Label at the midpoint of the arc, slightly outside
  const midAngle = anticlockwise
    ? a1 - (2 * Math.PI - diff) / 2
    : a1 + diff / 2;
  const textR = el.radius + 14;
  const tp = w2s(el.cx + Math.cos(midAngle) * textR, el.cy + Math.sin(midAngle) * textR);
  const fontSize = 12 * zoom;
  ctx.font = `${fontSize}px sans-serif`;
  const displayText = el.unit ? `${el.text}${el.unit}` : el.text;
  const tw = ctx.measureText(displayText).width;
  ctx.save();
  ctx.fillStyle = "rgba(248,250,252,0.85)";
  ctx.fillRect(tp.x - tw / 2 - 3, tp.y - fontSize / 2 - 2, tw + 6, fontSize + 4);
  ctx.restore();
  ctx.fillStyle = el.strokeColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(displayText, tp.x, tp.y);
}

function renderMeasurement(
  ctx: CanvasRenderingContext2D,
  el: {
    x1: number; y1: number; x2: number; y2: number;
    offset: number; text: string; unit: string;
    strokeColor: string; strokeWidth: number; fontSize?: number;
  },
  panX: number,
  panY: number,
  zoom: number
) {
  function w2s(wx: number, wy: number) {
    return worldToScreen(wx, wy, panX, panY, zoom);
  }

  const nx = -(el.y2 - el.y1);
  const ny = el.x2 - el.x1;
  const len = Math.sqrt(nx * nx + ny * ny) || 1;
  const ux = nx / len;
  const uy = ny / len;
  const ox = ux * el.offset;
  const oy = uy * el.offset;

  // Extension lines
  const extExtra = 5;
  const p1 = w2s(el.x1, el.y1);
  const p2 = w2s(el.x2, el.y2);
  const d1 = w2s(el.x1 + ox, el.y1 + oy);
  const d2 = w2s(el.x2 + ox, el.y2 + oy);
  const extDir = { x: ux * zoom, y: uy * zoom };

  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(p1.x + extDir.x * extExtra, p1.y + extDir.y * extExtra);
  ctx.lineTo(d1.x + extDir.x * extExtra, d1.y + extDir.y * extExtra);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(p2.x + extDir.x * extExtra, p2.y + extDir.y * extExtra);
  ctx.lineTo(d2.x + extDir.x * extExtra, d2.y + extDir.y * extExtra);
  ctx.stroke();

  // Dimension line with arrows
  ctx.beginPath();
  ctx.moveTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.stroke();
  drawArrowhead(ctx, d2.x, d2.y, d1.x, d1.y, el.strokeColor, el.strokeWidth * zoom);
  drawArrowhead(ctx, d1.x, d1.y, d2.x, d2.y, el.strokeColor, el.strokeWidth * zoom);

  // Text
  const mx = (d1.x + d2.x) / 2;
  const my = (d1.y + d2.y) / 2;
  const angleDeg = Math.atan2(d2.y - d1.y, d2.x - d1.x);
  const fontSize = (el.fontSize ?? 12) * zoom;
  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(angleDeg);
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle = el.strokeColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  const displayText = el.unit ? `${el.text} ${el.unit}` : el.text;
  const tw = ctx.measureText(displayText).width;
  const pad = 3;
  ctx.fillStyle = "rgba(248,250,252,0.85)";
  ctx.fillRect(-tw / 2 - pad, -fontSize - pad, tw + pad * 2, fontSize + pad * 2);
  ctx.fillStyle = el.strokeColor;
  ctx.fillText(displayText, 0, -4);
  ctx.restore();
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  lineWidth: number
) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const size = Math.max(8, lineWidth * 4);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.translate(toX, toY);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, -size / 2.5);
  ctx.lineTo(-size, size / 2.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function renderViewSymbol(
  ctx: CanvasRenderingContext2D,
  el: { x: number; y: number; label: string; direction: number; strokeColor: string; strokeWidth: number },
  panX: number,
  panY: number,
  zoom: number
) {
  function w2s(wx: number, wy: number) {
    return worldToScreen(wx, wy, panX, panY, zoom);
  }
  const p = w2s(el.x, el.y);
  const size = 20 * zoom;
  const lw = el.strokeWidth * zoom;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.strokeStyle = el.strokeColor;
  ctx.lineWidth = lw;
  ctx.setLineDash([]);

  // Triangle pointing in direction
  const dir = el.direction;
  const tipX = Math.cos(dir) * size * 1.5;
  const tipY = Math.sin(dir) * size * 1.5;
  const perpX = -Math.sin(dir) * size * 0.7;
  const perpY = Math.cos(dir) * size * 0.7;

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(perpX, perpY);
  ctx.lineTo(-perpX, -perpY);
  ctx.closePath();
  ctx.fillStyle = el.strokeColor;
  ctx.fill();

  // Circle at base
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.6, 0, Math.PI * 2);
  ctx.stroke();

  // Label
  ctx.fillStyle = el.strokeColor;
  ctx.font = `bold ${14 * zoom}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Label below circle
  ctx.fillText(el.label, 0, size * 1.4);

  ctx.restore();
}

export function renderSelectionBox(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  ctx.save();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.fillStyle = SELECTION_FILL;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 2]);
  const rx = Math.min(x1, x2);
  const ry = Math.min(y1, y2);
  const rw = Math.abs(x2 - x1);
  const rh = Math.abs(y2 - y1);
  ctx.fillRect(rx, ry, rw, rh);
  ctx.strokeRect(rx, ry, rw, rh);
  ctx.restore();
}

export function renderHandles(
  ctx: CanvasRenderingContext2D,
  handles: Handle[],
  panX: number,
  panY: number,
  zoom: number
) {
  ctx.save();
  ctx.setLineDash([]);
  for (const h of handles) {
    const { x, y } = worldToScreen(h.x, h.y, panX, panY, zoom);
    ctx.beginPath();
    ctx.arc(x, y, HANDLE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = HANDLE_COLOR;
    ctx.fill();
    ctx.strokeStyle = HANDLE_BORDER;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

export function renderSnapIndicator(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  type: string
) {
  ctx.save();
  ctx.strokeStyle = SNAP_COLOR;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  const r = 6;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.stroke();
  if (type === "midpoint") {
    ctx.beginPath();
    ctx.arc(sx, sy, 3, 0, Math.PI * 2);
    ctx.fillStyle = SNAP_COLOR;
    ctx.fill();
  }
  ctx.restore();
}

export function renderSelectionOverlay(
  ctx: CanvasRenderingContext2D,
  el: AnyElement,
  panX: number,
  panY: number,
  zoom: number,
  canvasWidth: number,
  canvasHeight: number
) {
  if (!el.selected) return;

  function w2s(wx: number, wy: number) {
    return worldToScreen(wx, wy, panX, panY, zoom);
  }

  ctx.save();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 2]);

  switch (el.type) {
    case "hline": {
      const { y } = w2s(0, el.y);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();
      break;
    }
    case "vline": {
      const { x } = w2s(el.x, 0);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
      ctx.stroke();
      break;
    }
    case "line":
    case "arrow": {
      const p1 = w2s(el.x1, el.y1);
      const p2 = w2s(el.x2, el.y2);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      break;
    }
    case "circle": {
      const c = w2s(el.cx, el.cy);
      ctx.beginPath();
      ctx.arc(c.x, c.y, el.r * zoom + 4, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "rect":
    case "image": {
      const p = w2s(el.x, el.y);
      ctx.strokeRect(p.x - 3, p.y - 3, el.width * zoom + 6, el.height * zoom + 6);
      break;
    }
    case "spline": {
      if ((el as any).points && (el as any).points.length >= 2) {
        catmullRomOnCanvas(ctx, (el as any).points, panX, panY, zoom);
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

export function catmullRomOnCanvas(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  panX: number,
  panY: number,
  zoom: number
) {
  const n = points.length;
  if (n < 2) return;
  function w2s(wx: number, wy: number) {
    return worldToScreen(wx, wy, panX, panY, zoom);
  }
  const p0s = w2s(points[0].x, points[0].y);
  ctx.beginPath();
  ctx.moveTo(p0s.x, p0s.y);
  for (let i = 0; i < n - 1; i++) {
    const prev = i > 0 ? points[i - 1] : { x: 2 * points[0].x - points[1].x, y: 2 * points[0].y - points[1].y };
    const p1 = points[i];
    const p2 = points[i + 1];
    const next = i < n - 2 ? points[i + 2] : { x: 2 * points[n - 1].x - points[n - 2].x, y: 2 * points[n - 1].y - points[n - 2].y };
    const cp1 = w2s(p1.x + (p2.x - prev.x) / 6, p1.y + (p2.y - prev.y) / 6);
    const cp2 = w2s(p2.x - (next.x - p1.x) / 6, p2.y - (next.y - p1.y) / 6);
    const p2s = w2s(p2.x, p2.y);
    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, p2s.x, p2s.y);
  }
  ctx.stroke();
}
