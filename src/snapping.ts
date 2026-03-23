import { AnyElement, Point } from "./types";
import { screenToWorld } from "./utils";

const SNAP_RADIUS_PX = 12;

export interface SnapResult {
  x: number;
  y: number;
  snapped: boolean;
  type?: "endpoint" | "midpoint" | "center" | "grid" | "intersection";
}

export function snapPoint(
  rawSx: number,
  rawSy: number,
  panX: number,
  panY: number,
  zoom: number,
  elements: AnyElement[],
  gridSize: number = 20
): SnapResult {
  const world = screenToWorld(rawSx, rawSy, panX, panY, zoom);
  const snapWorldRadius = SNAP_RADIUS_PX / zoom;
  let best: SnapResult = { ...world, snapped: false };
  let bestDist = snapWorldRadius;

  function trySnap(x: number, y: number, type: SnapResult["type"]) {
    const d = Math.sqrt((x - world.x) ** 2 + (y - world.y) ** 2);
    if (d < bestDist) {
      bestDist = d;
      best = { x, y, snapped: true, type };
    }
  }

  // Snap to element key points
  for (const el of elements) {
    switch (el.type) {
      case "line":
      case "arrow":
      case "measurement":
        trySnap(el.x1, el.y1, "endpoint");
        trySnap(el.x2, el.y2, "endpoint");
        trySnap((el.x1 + el.x2) / 2, (el.y1 + el.y2) / 2, "midpoint");
        break;
      case "circle":
        trySnap(el.cx, el.cy, "center");
        trySnap(el.cx + el.r, el.cy, "endpoint");
        trySnap(el.cx - el.r, el.cy, "endpoint");
        trySnap(el.cx, el.cy + el.r, "endpoint");
        trySnap(el.cx, el.cy - el.r, "endpoint");
        break;
      case "arc":
        trySnap(el.cx, el.cy, "center");
        trySnap(el.cx + el.r * Math.cos(el.startAngle), el.cy + el.r * Math.sin(el.startAngle), "endpoint");
        trySnap(el.cx + el.r * Math.cos(el.endAngle), el.cy + el.r * Math.sin(el.endAngle), "endpoint");
        break;
      case "point":
        trySnap(el.x, el.y, "endpoint");
        break;
      case "rect":
        trySnap(el.x, el.y, "endpoint");
        trySnap(el.x + el.width, el.y, "endpoint");
        trySnap(el.x, el.y + el.height, "endpoint");
        trySnap(el.x + el.width, el.y + el.height, "endpoint");
        trySnap(el.x + el.width / 2, el.y, "midpoint");
        trySnap(el.x + el.width / 2, el.y + el.height, "midpoint");
        trySnap(el.x, el.y + el.height / 2, "midpoint");
        trySnap(el.x + el.width, el.y + el.height / 2, "midpoint");
        break;
      case "spline":
        for (const p of el.points) trySnap(p.x, p.y, "endpoint");
        break;
    }
  }

  // Grid snap (lower priority)
  if (!best.snapped) {
    const gx = Math.round(world.x / gridSize) * gridSize;
    const gy = Math.round(world.y / gridSize) * gridSize;
    const d = Math.sqrt((gx - world.x) ** 2 + (gy - world.y) ** 2);
    if (d < snapWorldRadius) {
      best = { x: gx, y: gy, snapped: true, type: "grid" };
    }
  }

  return best;
}

export function snapToAngle(x1: number, y1: number, x2: number, y2: number, angleDeg: number = 15): Point {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const snapRad = (angleDeg * Math.PI) / 180;
  const snapped = Math.round(angle / snapRad) * snapRad;
  return {
    x: x1 + len * Math.cos(snapped),
    y: y1 + len * Math.sin(snapped),
  };
}
