import { AnyElement, DrawingDocument } from "./types";
import { generateId } from "./utils";

type HistoryEntry = AnyElement[];

export class AppState {
  elements: AnyElement[] = [];
  panX: number = 0;
  panY: number = 0;
  zoom: number = 1;

  private history: HistoryEntry[] = [];
  private historyIndex: number = -1;
  private MAX_HISTORY = 100;

  // Save a snapshot (call before any mutation)
  snapshot() {
    // Trim forward history
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(this.cloneElements());
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift();
    }
    this.historyIndex = this.history.length - 1;
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.elements = this.cloneFrom(this.history[this.historyIndex]);
      return true;
    }
    return false;
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.elements = this.cloneFrom(this.history[this.historyIndex]);
      return true;
    }
    return false;
  }

  // Element operations
  addElement(el: AnyElement) {
    this.snapshot();
    this.elements.forEach((e) => (e.selected = false));
    el.selected = true;
    this.elements.push(el);
  }

  updateElement(id: string, patch: Partial<AnyElement>) {
    const idx = this.elements.findIndex((e) => e.id === id);
    if (idx !== -1) {
      this.elements[idx] = { ...this.elements[idx], ...patch } as AnyElement;
    }
  }

  updateElementNoHistory(id: string, patch: Partial<AnyElement>) {
    const idx = this.elements.findIndex((e) => e.id === id);
    if (idx !== -1) {
      this.elements[idx] = { ...this.elements[idx], ...patch } as AnyElement;
    }
  }

  deleteSelected() {
    const selected = this.elements.filter((e) => e.selected);
    if (selected.length === 0) return;
    this.snapshot();
    this.elements = this.elements.filter((e) => !e.selected);
  }

  selectAll() {
    this.elements.forEach((e) => (e.selected = true));
  }

  deselectAll() {
    this.elements.forEach((e) => (e.selected = false));
  }

  getSelected(): AnyElement[] {
    return this.elements.filter((e) => e.selected);
  }

  getElementById(id: string): AnyElement | undefined {
    return this.elements.find((e) => e.id === id);
  }

  moveSelected(dx: number, dy: number) {
    for (const el of this.elements) {
      if (!el.selected) continue;
      switch (el.type) {
        case "hline": (el as any).y += dy; break;
        case "vline": (el as any).x += dx; break;
        case "line":
        case "arrow":
        case "measurement": {
          const e = el as any;
          e.x1 += dx; e.y1 += dy; e.x2 += dx; e.y2 += dy;
          break;
        }
        case "anglemeasurement": {
          const e = el as any;
          e.cx += dx; e.cy += dy;
          e.x1 += dx; e.y1 += dy;
          e.x2 += dx; e.y2 += dy;
          break;
        }
        case "circle":
        case "arc": {
          const e = el as any;
          e.cx += dx; e.cy += dy;
          break;
        }
        case "point":
        case "annotation":
        case "viewsymbol":
        case "rect":
        case "image": {
          const e = el as any;
          e.x += dx; e.y += dy;
          break;
        }
        case "spline": {
          const e = el as any;
          e.points = e.points.map((p: { x: number; y: number }) => ({ x: p.x + dx, y: p.y + dy }));
          break;
        }
      }
    }
  }

  toDocument(): DrawingDocument {
    return {
      version: "1.0",
      elements: this.cloneElements(),
      viewport: { panX: this.panX, panY: this.panY, zoom: this.zoom },
    };
  }

  loadDocument(doc: DrawingDocument) {
    this.elements = doc.elements;
    this.panX = doc.viewport?.panX ?? 0;
    this.panY = doc.viewport?.panY ?? 0;
    this.zoom = doc.viewport?.zoom ?? 1;
    this.history = [];
    this.historyIndex = -1;
    this.snapshot();
  }

  private cloneElements(): AnyElement[] {
    return this.elements.map((e) => ({ ...e }));
  }

  private cloneFrom(arr: AnyElement[]): AnyElement[] {
    return arr.map((e) => ({ ...e }));
  }
}

// Default element factory helpers
const DEFAULT_STROKE = "#1e293b";
const DEFAULT_WIDTH = 1.5;
const DEFAULT_OPACITY = 1;

export function defaultBase(type: AnyElement["type"]) {
  return {
    id: generateId(),
    type,
    selected: false,
    strokeColor: DEFAULT_STROKE,
    strokeWidth: DEFAULT_WIDTH,
    opacity: DEFAULT_OPACITY,
  };
}
