import "./style.css";
import { AppState, defaultBase } from "./state";
import { AnyElement, AnnotationElement, MeasurementElement, AngleMeasurementElement, Point } from "./types";
import { save as tauriSave, open as tauriOpen } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import {
  renderGrid,
  renderElement,
  renderSelectionBox,
  renderHandles,
  renderSnapIndicator,
  renderSelectionOverlay,
} from "./renderer";
import { hitTestElement, getHandles, applyHandleDrag, Handle } from "./hitTest";
import { snapPoint, SnapResult } from "./snapping";
import { screenToWorld, worldToScreen } from "./utils";
import { exportSVG, serializeDocument, deserializeDocument } from "./fileOps";

// ────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────
type Tool =
  | "select"
  | "hline" | "vline" | "line" | "circle" | "arc" | "spline"
  | "measurement" | "anglemeasurement" | "point" | "annotation" | "arrow"
  | "viewsymbol" | "rect" | "image";

interface DrawState {
  active: boolean;
  phase: number; // multi-step tools use phases
  // temp points
  x1?: number; y1?: number;
  x2?: number; y2?: number;
  cx?: number; cy?: number;
  r?: number;
  pts?: Point[]; // accumulated control points for spline
  previewEl?: AnyElement;
}

// ────────────────────────────────────────────────────
// App setup
// ────────────────────────────────────────────────────
const appState = new AppState();
let activeTool: Tool = "select";
let drawState: DrawState = { active: false, phase: 0 };
let isDraggingCanvas = false;
let isDraggingElement = false;
let isDraggingHandle = false;
let activeHandle: Handle | null = null;
let activeHandleElId: string | null = null;
let dragStartSX = 0, dragStartSY = 0;
let dragLastSX = 0, dragLastSY = 0;
let panStartX = 0, panStartY = 0;
let selectBoxStart: { sx: number; sy: number } | null = null;
let selectBoxCurrent: { sx: number; sy: number } | null = null;
let snapResult: SnapResult | null = null;
let currentFilePath: string | null = null;
let isDirty = false;

// Images cache for image elements
const imageCache = new Map<string, HTMLImageElement>();

// Clipboard marker used to identify SketchCAD shape data in the system clipboard
const CLIPBOARD_MARKER = "sketchcad-elements";

// Property panel state
let propStrokeColor = "#1e293b";
let propStrokeWidth = 1.5;
let propFontSize = 14;
let propFontFamily = "sans-serif";

const PAGE_COLOR_PRESETS = ["#ffffff", "#f8fafc", "#f1f5f9", "#e2e8f0", "#111827"];

// ────────────────────────────────────────────────────
// Init DOM
// ────────────────────────────────────────────────────
const appEl = document.getElementById("app")!;
appEl.innerHTML = `
<div class="app-shell">
  <header class="menubar">
    <div class="menubar-brand">SketchCAD</div>
    <div class="menubar-menus">
      <div class="menu-item" id="menu-file">File</div>
      <div class="menu-dropdown" id="dropdown-file">
        <div class="menu-action" data-action="new">New</div>
        <div class="menu-action" data-action="open">Open…</div>
        <div class="menu-action" data-action="save">Save</div>
        <div class="menu-action" data-action="save-as">Save As…</div>
        <div class="menu-sep"></div>
        <div class="menu-action" data-action="export-svg">Export SVG…</div>
        <div class="menu-action" data-action="export-pdf">Export PDF…</div>
      </div>
      <div class="menu-item" id="menu-edit">Edit</div>
      <div class="menu-dropdown" id="dropdown-edit">
        <div class="menu-action" data-action="undo">Undo <span class="kb">Ctrl+Z</span></div>
        <div class="menu-action" data-action="redo">Redo <span class="kb">Ctrl+Y</span></div>
        <div class="menu-sep"></div>
        <div class="menu-action" data-action="delete">Delete</div>
        <div class="menu-action" data-action="select-all">Select All <span class="kb">Ctrl+A</span></div>
        <div class="menu-action" data-action="duplicate">Duplicate</div>
      </div>
      <div class="menu-item" id="menu-view">View</div>
      <div class="menu-dropdown" id="dropdown-view">
        <div class="menu-action" data-action="zoom-in">Zoom In <span class="kb">+</span></div>
        <div class="menu-action" data-action="zoom-out">Zoom Out <span class="kb">-</span></div>
        <div class="menu-action" data-action="zoom-fit">Fit to Window <span class="kb">0</span></div>
        <div class="menu-action" data-action="zoom-100">100% <span class="kb">1</span></div>
        <div class="menu-sep"></div>
        <div class="menu-action" data-action="toggle-grid">Toggle Grid</div>
        <div class="menu-action" data-action="toggle-snap">Toggle Snap</div>
        <div class="menu-sep"></div>
        <div class="menu-action" data-action="page-properties">Page Properties…</div>
      </div>
    </div>
    <div class="menubar-status" id="status-bar">Ready</div>
  </header>

  <div class="workspace">
    <aside class="palette">
      <div class="palette-section">
        <div class="palette-label">Select</div>
        <button class="tool-btn active" data-tool="select" title="Select (V)">
          <svg viewBox="0 0 24 24"><path d="M4 2l16 10-7 2-4 8z" fill="currentColor"/></svg>
        </button>
      </div>
      <div class="palette-section">
        <div class="palette-label">Lines</div>
        <button class="tool-btn" data-tool="hline" title="Horizontal Construction Line (H)">
          <svg viewBox="0 0 24 24"><line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2"/><line x1="2" y1="8" x2="2" y2="16" stroke="currentColor" stroke-width="1.5"/><line x1="22" y1="8" x2="22" y2="16" stroke="currentColor" stroke-width="1.5"/></svg>
        </button>
        <button class="tool-btn" data-tool="vline" title="Vertical Construction Line (V key not used)">
          <svg viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="22" stroke="currentColor" stroke-width="2"/><line x1="8" y1="2" x2="16" y2="2" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="22" x2="16" y2="22" stroke="currentColor" stroke-width="1.5"/></svg>
        </button>
        <button class="tool-btn" data-tool="line" title="Line Segment (L)">
          <svg viewBox="0 0 24 24"><line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" stroke-width="2"/></svg>
        </button>
      </div>
      <div class="palette-section">
        <div class="palette-label">Shapes</div>
        <button class="tool-btn" data-tool="rect" title="Rectangle (R)">
          <svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        </button>
        <button class="tool-btn" data-tool="circle" title="Circle (C)">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        </button>
        <button class="tool-btn" data-tool="arc" title="Arc (A)">
          <svg viewBox="0 0 24 24"><path d="M 4 20 A 12 12 0 0 1 20 4" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        </button>
        <button class="tool-btn" data-tool="spline" title="Spline (B)">
          <svg viewBox="0 0 24 24"><path d="M 4 18 C 6 6, 10 4, 12 12 S 18 20, 20 8" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        </button>
      </div>
      <div class="palette-section">
        <div class="palette-label">Annotation</div>
        <button class="tool-btn" data-tool="measurement" title="Measurement (M)">
          <svg viewBox="0 0 24 24"><line x1="4" y1="18" x2="20" y2="18" stroke="currentColor" stroke-width="2"/><line x1="4" y1="14" x2="4" y2="22" stroke="currentColor" stroke-width="1.5"/><line x1="20" y1="14" x2="20" y2="22" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="6" x2="12" y2="16" stroke="currentColor" stroke-width="1" stroke-dasharray="2,2"/><text x="9" y="8" font-size="6" font-family="sans-serif" fill="currentColor">42</text></svg>
        </button>
        <button class="tool-btn" data-tool="anglemeasurement" title="Angle Measurement (N)">
          <svg viewBox="0 0 24 24"><line x1="12" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="12" x2="17" y2="5" stroke="currentColor" stroke-width="1.5"/><path d="M 16 12 A 4 4 0 0 0 14.2 8.8" fill="none" stroke="currentColor" stroke-width="1.5"/><text x="15" y="12" font-size="5" font-family="sans-serif" fill="currentColor">45°</text></svg>
        </button>
        <button class="tool-btn" data-tool="annotation" title="Text Annotation (T)">
          <svg viewBox="0 0 24 24"><text x="4" y="16" font-size="14" font-weight="bold" font-family="serif" fill="currentColor">T</text></svg>
        </button>
        <button class="tool-btn" data-tool="arrow" title="Arrow (W)">
          <svg viewBox="0 0 24 24"><line x1="4" y1="20" x2="18" y2="6" stroke="currentColor" stroke-width="2"/><polygon points="20,4 14,6 18,10" fill="currentColor"/></svg>
        </button>
        <button class="tool-btn" data-tool="point" title="Point (.)">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="currentColor"/><line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="8" x2="12" y2="16" stroke="currentColor" stroke-width="1.5"/></svg>
        </button>
        <button class="tool-btn" data-tool="viewsymbol" title="View Symbol (K)">
          <svg viewBox="0 0 24 24"><polygon points="20,12 13,8 13,16" fill="currentColor"/><circle cx="10" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/><text x="7.5" y="14" font-size="6" font-weight="bold" font-family="sans-serif" fill="currentColor">A</text></svg>
        </button>
      </div>
      <div class="palette-section">
        <div class="palette-label">Image</div>
        <button class="tool-btn" data-tool="image" title="Insert Image (I)">
          <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" fill="none" stroke="currentColor" stroke-width="2" rx="1"/><circle cx="8" cy="10" r="2" fill="currentColor"/><path d="M3 18l5-5 4 4 3-3 6 6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
        </button>
      </div>
    </aside>

    <div class="canvas-area">
      <canvas id="main-canvas"></canvas>
    </div>

    <aside class="properties-panel" id="props-panel">
      <div class="props-title">Properties</div>
      <div id="props-content">
        <div class="prop-group">
          <label>Stroke Color</label>
          <input type="color" id="prop-stroke-color" value="#1e293b"/>
        </div>
        <div class="prop-group">
          <label>Stroke Width</label>
          <input type="number" id="prop-stroke-width" value="1.5" min="0.5" max="20" step="0.5"/>
        </div>
        <div class="prop-group">
          <label>Fill Color</label>
          <div class="fill-row">
            <input type="color" id="prop-fill-color" value="#ffffff"/>
            <label class="checkbox-label"><input type="checkbox" id="prop-fill-none" checked/> None</label>
          </div>
        </div>
        <div class="prop-group">
          <label>Opacity</label>
          <input type="range" id="prop-opacity" min="0.1" max="1" step="0.05" value="1"/>
        </div>
        <div class="prop-group">
          <label>Dash</label>
          <select id="prop-dash">
            <option value="">Solid</option>
            <option value="4,2">Dashed</option>
            <option value="1,4">Dotted</option>
            <option value="8,2,2,2">Center Line</option>
          </select>
        </div>
        <div id="props-text-section" style="display:none">
          <hr class="props-divider"/>
          <div class="prop-group">
            <label>Font Size</label>
            <input type="number" id="prop-font-size" value="14" min="6" max="96"/>
          </div>
          <div class="prop-group">
            <label>Font</label>
            <select id="prop-font-family">
              <option>sans-serif</option>
              <option>serif</option>
              <option>monospace</option>
              <option>Arial</option>
              <option>Helvetica</option>
              <option>Times New Roman</option>
            </select>
          </div>
          <div class="prop-group checkbox-row">
            <label><input type="checkbox" id="prop-bold"/> Bold</label>
            <label><input type="checkbox" id="prop-italic"/> Italic</label>
          </div>
        </div>
        <div id="props-measurement-section" style="display:none">
          <hr class="props-divider"/>
          <div class="prop-group">
            <label>Measurement Text</label>
            <input type="text" id="prop-measurement-text" placeholder="e.g. 42.5"/>
          </div>
          <div class="prop-group">
            <label>Unit</label>
            <input type="text" id="prop-measurement-unit" placeholder="mm"/>
          </div>
        </div>
        <div id="props-viewsymbol-section" style="display:none">
          <hr class="props-divider"/>
          <div class="prop-group">
            <label>View Label</label>
            <input type="text" id="prop-view-label" placeholder="A" maxlength="3"/>
          </div>
        </div>
        <div id="props-point-section" style="display:none">
          <hr class="props-divider"/>
          <div class="prop-group">
            <label>Point Style</label>
            <select id="prop-point-style">
              <option value="cross">Cross</option>
              <option value="dot">Dot</option>
              <option value="x">X</option>
            </select>
          </div>
          <div class="prop-group">
            <label>Size</label>
            <input type="number" id="prop-point-size" value="6" min="2" max="30"/>
          </div>
        </div>
      </div>
      <div style="margin-top:auto;padding:8px 0">
        <button id="btn-delete-selected" class="btn-danger">Delete Selected</button>
        <button id="btn-bring-front" class="btn-secondary" style="margin-top:4px">Bring to Front</button>
        <button id="btn-send-back" class="btn-secondary" style="margin-top:4px">Send to Back</button>
      </div>
    </aside>
  </div>

  <!-- Context menu -->
  <div class="context-menu" id="context-menu" style="display:none">
    <div class="ctx-item" data-action="delete">Delete</div>
    <div class="ctx-item" data-action="duplicate">Duplicate</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item" data-action="bring-front">Bring to Front</div>
    <div class="ctx-item" data-action="send-back">Send to Back</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item" data-action="select-all">Select All</div>
  </div>

  <!-- Annotation text input overlay -->
  <input type="text" id="annotation-input" class="annotation-input" style="display:none" placeholder="Type annotation…"/>

  <!-- Measurement value input overlay -->
  <div id="measurement-dialog" class="dialog-overlay" style="display:none">
    <div class="dialog-box">
      <div class="dialog-title">Measurement</div>
      <div class="dialog-row">
        <label>Value</label>
        <input type="text" id="meas-value-input" placeholder="42.5" style="width:100%"/>
      </div>
      <div class="dialog-row">
        <label>Unit</label>
        <input type="text" id="meas-unit-input" placeholder="mm" style="width:60px"/>
      </div>
      <div class="dialog-buttons">
        <button id="meas-ok">OK</button>
        <button id="meas-cancel">Cancel</button>
      </div>
    </div>
  </div>

  <!-- Page properties dialog -->
  <div id="page-properties-dialog" class="dialog-overlay" style="display:none">
    <div class="dialog-box">
      <div class="dialog-title">Page Properties</div>
      <div class="dialog-row">
        <label>Page Color</label>
        <select id="page-prop-color">
          <option value="#ffffff">White</option>
          <option value="#f8fafc">Off White</option>
          <option value="#f1f5f9">Slate Light</option>
          <option value="#e2e8f0">Slate</option>
          <option value="#111827">Near Black</option>
          <option value="custom">Custom…</option>
        </select>
      </div>
      <div class="dialog-row">
        <label>Custom</label>
        <input type="color" id="page-prop-color-custom" value="#f8fafc"/>
      </div>
      <div class="dialog-buttons">
        <button id="page-prop-close">Close</button>
      </div>
    </div>
  </div>
</div>
`;

// ────────────────────────────────────────────────────
// Canvas setup
// ────────────────────────────────────────────────────
const canvas = document.getElementById("main-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
let showGrid = true;
let snapEnabled = true;

function resizeCanvas() {
  const area = canvas.parentElement!;
  const dpr = window.devicePixelRatio || 1;
  const cssW = area.clientWidth;
  const cssH = area.clientHeight;
  // Size the backing buffer to physical pixels
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  // Keep the CSS display size at logical pixels
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  render();
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function canvasCssSize() {
  const dpr = window.devicePixelRatio || 1;
  return { w: canvas.width / dpr, h: canvas.height / dpr };
}

// ────────────────────────────────────────────────────
// Render loop
// ────────────────────────────────────────────────────
function render() {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.width;
  const H = canvas.height;
  // CSS-pixel dimensions used for all coordinate calculations
  const cssW = W / dpr;
  const cssH = H / dpr;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = appState.pageColor;
  ctx.fillRect(0, 0, cssW, cssH);

  if (showGrid) {
    renderGrid(ctx, appState.panX, appState.panY, appState.zoom, cssW, cssH);
  }

  // Render all elements
  for (const el of appState.elements) {
    renderElement(ctx, el, appState.panX, appState.panY, appState.zoom, cssW, cssH, imageCache);
    if (el.selected) {
      renderSelectionOverlay(ctx, el, appState.panX, appState.panY, appState.zoom, cssW, cssH);
    }
  }

  // Render preview element while drawing
  if (drawState.active && drawState.previewEl) {
    renderElement(ctx, drawState.previewEl, appState.panX, appState.panY, appState.zoom, cssW, cssH, imageCache);
  }

  // Render handles for selected elements
  const selected = appState.getSelected();
  if (selected.length === 1) {
    const handles = getHandles(selected[0]);
    renderHandles(ctx, handles, appState.panX, appState.panY, appState.zoom);
  }

  // Render selection rectangle
  if (selectBoxStart && selectBoxCurrent) {
    renderSelectionBox(ctx, selectBoxStart.sx, selectBoxStart.sy, selectBoxCurrent.sx, selectBoxCurrent.sy);
  }

  // Render snap indicator
  if (snapResult?.snapped) {
    const sp = worldToScreen(snapResult.x, snapResult.y, appState.panX, appState.panY, appState.zoom);
    renderSnapIndicator(ctx, sp.x, sp.y, snapResult.type ?? "");
  }

  ctx.restore();

  // Keep properties panel in sync with current selection
  updatePropertiesPanel();
}

// ────────────────────────────────────────────────────
// Input handling
// ────────────────────────────────────────────────────
function getSnap(e: MouseEvent): SnapResult {
  if (!snapEnabled || e.altKey) {
    const w = screenToWorld(e.offsetX, e.offsetY, appState.panX, appState.panY, appState.zoom);
    return { ...w, snapped: false };
  }
  return snapPoint(e.offsetX, e.offsetY, appState.panX, appState.panY, appState.zoom, appState.elements);
}

canvas.addEventListener("mousedown", onMouseDown);
canvas.addEventListener("mousemove", onMouseMove);
canvas.addEventListener("mouseup", onMouseUp);
canvas.addEventListener("wheel", onWheel, { passive: false });
canvas.addEventListener("contextmenu", onContextMenu);
canvas.addEventListener("dblclick", onDblClick);

function onMouseDown(e: MouseEvent) {
  if (e.button === 1 || (e.button === 0 && e.altKey)) {
    // Middle-click or alt+click: pan
    isDraggingCanvas = true;
    dragStartSX = e.clientX;
    dragStartSY = e.clientY;
    panStartX = appState.panX;
    panStartY = appState.panY;
    canvas.style.cursor = "grabbing";
    return;
  }

  if (e.button === 0) {
    const snap = getSnap(e);
    snapResult = snap;

    if (activeTool === "select") {
      handleSelectMouseDown(e, snap);
    } else {
      handleDrawMouseDown(e, snap);
    }
  }
}

function onMouseMove(e: MouseEvent) {
  if (isDraggingCanvas) {
    appState.panX = panStartX + (e.clientX - dragStartSX);
    appState.panY = panStartY + (e.clientY - dragStartSY);
    render();
    return;
  }

  const snap = getSnap(e);
  snapResult = snap;

  if (isDraggingHandle && activeHandle && activeHandleElId) {
    const el = appState.getElementById(activeHandleElId);
    if (el) {
      const dx = (e.offsetX - dragLastSX) / appState.zoom;
      const dy = (e.offsetY - dragLastSY) / appState.zoom;
      const patch = applyHandleDrag(el, activeHandle.id, dx, dy, snap.x, snap.y);
      void dx; void dy;
      appState.updateElementNoHistory(activeHandleElId, patch);
      dragLastSX = e.offsetX;
      dragLastSY = e.offsetY;
      markDirty();
      render();
    }
    return;
  }

  if (isDraggingElement) {
    const dx = (e.offsetX - dragLastSX) / appState.zoom;
    const dy = (e.offsetY - dragLastSY) / appState.zoom;
    appState.moveSelected(dx, dy);
    dragLastSX = e.offsetX;
    dragLastSY = e.offsetY;
    markDirty();
    render();
    return;
  }

  if (selectBoxStart && selectBoxCurrent) {
    selectBoxCurrent = { sx: e.offsetX, sy: e.offsetY };
    render();
    return;
  }

  if (activeTool === "select") {
    updateSelectCursor(e);
  } else {
    updateDrawPreview(snap);
  }

  render();
}

function onMouseUp(_e: MouseEvent) {
  if (isDraggingCanvas) {
    isDraggingCanvas = false;
    canvas.style.cursor = getCursorForTool();
    return;
  }

  if (isDraggingHandle) {
    isDraggingHandle = false;
    activeHandle = null;
    activeHandleElId = null;
    appState.snapshot();
    render();
    return;
  }

  if (isDraggingElement) {
    isDraggingElement = false;
    appState.snapshot();
    render();
    return;
  }

  if (selectBoxStart && selectBoxCurrent) {
    finishSelectionBox();
    selectBoxStart = null;
    selectBoxCurrent = null;
    render();
    return;
  }

  if (activeTool !== "select") {
    // Drawing tools don't finish on mouseUp - they finish on click/phase
  }
}

function onWheel(e: WheelEvent) {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  const wx = (e.offsetX - appState.panX) / appState.zoom;
  const wy = (e.offsetY - appState.panY) / appState.zoom;
  appState.zoom = Math.max(0.05, Math.min(50, appState.zoom * factor));
  appState.panX = e.offsetX - wx * appState.zoom;
  appState.panY = e.offsetY - wy * appState.zoom;
  render();
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault();
  const menu = document.getElementById("context-menu")!;
  menu.style.left = e.clientX + "px";
  menu.style.top = e.clientY + "px";
  menu.style.display = "block";
}

function onDblClick(e: MouseEvent) {
  // Finalize spline drawing on double-click
  if (activeTool === "spline" && drawState.active && drawState.pts) {
    const pts = drawState.pts.slice(0, -1); // remove duplicate point from 2nd mousedown of dblclick
    if (pts.length >= 2) {
      appState.addElement({
        ...defaultBase("spline"),
        type: "spline" as const,
        points: pts,
        strokeColor: propStrokeColor,
        strokeWidth: propStrokeWidth,
        opacity: 1,
      } as AnyElement);
      markDirty();
    }
    drawState = { active: false, phase: 0 };
    render();
    return;
  }

  // Double click on annotation - start editing
  for (let i = appState.elements.length - 1; i >= 0; i--) {
    const el = appState.elements[i];
    if (el.type === "annotation" && hitTestElement(el, e.offsetX, e.offsetY, appState.panX, appState.panY, appState.zoom, canvasCssSize().w, canvasCssSize().h)) {
      startAnnotationEdit(el);
      return;
    }
    if (el.type === "measurement" && hitTestElement(el, e.offsetX, e.offsetY, appState.panX, appState.panY, appState.zoom, canvasCssSize().w, canvasCssSize().h)) {
      startMeasurementEdit(el);
      return;
    }
    if (el.type === "anglemeasurement" && hitTestElement(el, e.offsetX, e.offsetY, appState.panX, appState.panY, appState.zoom, canvasCssSize().w, canvasCssSize().h)) {
      startAngleMeasurementEdit(el);
      return;
    }
  }
}

// ────────────────────────────────────────────────────
// Select tool
// ────────────────────────────────────────────────────
function handleSelectMouseDown(e: MouseEvent, _snap: SnapResult) {
  // Check handle hit first
  const selected = appState.getSelected();
  if (selected.length === 1) {
    const handles = getHandles(selected[0]);
    for (const h of handles) {
      const sp = worldToScreen(h.x, h.y, appState.panX, appState.panY, appState.zoom);
      const d = Math.sqrt((sp.x - e.offsetX) ** 2 + (sp.y - e.offsetY) ** 2);
      if (d < 10) {
        activeHandle = h;
        activeHandleElId = selected[0].id;
        isDraggingHandle = true;
        dragLastSX = e.offsetX;
        dragLastSY = e.offsetY;
        return;
      }
    }
  }

  // Hit test elements (reverse order - top first)
  let hit: AnyElement | null = null;
  for (let i = appState.elements.length - 1; i >= 0; i--) {
    if (hitTestElement(appState.elements[i], e.offsetX, e.offsetY, appState.panX, appState.panY, appState.zoom, canvasCssSize().w, canvasCssSize().h)) {
      hit = appState.elements[i];
      break;
    }
  }

  if (hit) {
    if (!e.shiftKey && !hit.selected) {
      appState.deselectAll();
    }
    hit.selected = true;
    isDraggingElement = true;
    dragLastSX = e.offsetX;
    dragLastSY = e.offsetY;
    updatePropertiesPanel();
    render();
  } else {
    if (!e.shiftKey) {
      appState.deselectAll();
    }
    selectBoxStart = { sx: e.offsetX, sy: e.offsetY };
    selectBoxCurrent = { sx: e.offsetX, sy: e.offsetY };
    updatePropertiesPanel();
    render();
  }
}

function finishSelectionBox() {
  if (!selectBoxStart || !selectBoxCurrent) return;
  const x1 = screenToWorld(Math.min(selectBoxStart.sx, selectBoxCurrent.sx), 0, appState.panX, appState.panY, appState.zoom).x;
  const x2 = screenToWorld(Math.max(selectBoxStart.sx, selectBoxCurrent.sx), 0, appState.panX, appState.panY, appState.zoom).x;
  const y1 = screenToWorld(0, Math.min(selectBoxStart.sy, selectBoxCurrent.sy), appState.panX, appState.panY, appState.zoom).y;
  const y2 = screenToWorld(0, Math.max(selectBoxStart.sy, selectBoxCurrent.sy), appState.panX, appState.panY, appState.zoom).y;

  if (!selectBoxStart) return;
  const draggedEnough = Math.abs(selectBoxCurrent!.sx - selectBoxStart.sx) > 3 || Math.abs(selectBoxCurrent!.sy - selectBoxStart.sy) > 3;
  if (!draggedEnough) return;

  for (const el of appState.elements) {
    if (isInSelectionBox(el, x1, y1, x2, y2)) {
      el.selected = true;
    }
  }
  updatePropertiesPanel();
}

function isInSelectionBox(el: AnyElement, x1: number, y1: number, x2: number, y2: number): boolean {
  function inBox(x: number, y: number) {
    return x >= x1 && x <= x2 && y >= y1 && y <= y2;
  }
  switch (el.type) {
    case "line": case "arrow": case "measurement":
      return inBox(el.x1, el.y1) && inBox(el.x2, el.y2);
    case "anglemeasurement":
      return inBox(el.cx, el.cy) && inBox(el.x1, el.y1) && inBox(el.x2, el.y2);
    case "circle": case "arc":
      return inBox(el.cx - el.r, el.cy - el.r) && inBox(el.cx + el.r, el.cy + el.r);
    case "point": case "annotation": case "viewsymbol":
      return inBox((el as any).x, (el as any).y);
    case "rect": case "image":
      return inBox(el.x, el.y) && inBox(el.x + el.width, el.y + el.height);
    case "hline":
      return el.y >= y1 && el.y <= y2;
    case "vline":
      return el.x >= x1 && el.x <= x2;
    default:
      return false;
  }
}

function updateSelectCursor(e: MouseEvent) {
  for (let i = appState.elements.length - 1; i >= 0; i--) {
    if (hitTestElement(appState.elements[i], e.offsetX, e.offsetY, appState.panX, appState.panY, appState.zoom, canvasCssSize().w, canvasCssSize().h)) {
      canvas.style.cursor = "move";
      return;
    }
  }
  canvas.style.cursor = "default";
}

// ────────────────────────────────────────────────────
// Draw tools
// ────────────────────────────────────────────────────
function handleDrawMouseDown(e: MouseEvent, snap: SnapResult) {
  const wx = snap.x;
  const wy = snap.y;

  switch (activeTool) {
    case "hline":
      appState.addElement({ ...defaultBase("hline"), type: "hline" as const, y: wy, strokeColor: propStrokeColor, strokeWidth: propStrokeWidth, opacity: 1 });
      markDirty();
      render();
      break;
    case "vline":
      appState.addElement({ ...defaultBase("vline"), type: "vline" as const, x: wx, strokeColor: propStrokeColor, strokeWidth: propStrokeWidth, opacity: 1 });
      markDirty();
      render();
      break;
    case "line":
    case "arrow":
      if (!drawState.active) {
        drawState = { active: true, phase: 1, x1: wx, y1: wy };
      } else {
        if (activeTool === "arrow") {
          appState.addElement({ ...defaultBase("arrow"), type: "arrow" as const, x1: drawState.x1!, y1: drawState.y1!, x2: wx, y2: wy, arrowEnd: true, arrowStart: false, strokeColor: propStrokeColor, strokeWidth: propStrokeWidth, opacity: 1 });
        } else {
          appState.addElement({ ...defaultBase("line"), type: "line" as const, x1: drawState.x1!, y1: drawState.y1!, x2: wx, y2: wy, strokeColor: propStrokeColor, strokeWidth: propStrokeWidth, opacity: 1 });
        }
        drawState = { active: false, phase: 0 };
        markDirty();
        render();
      }
      break;
    case "circle":
      if (!drawState.active) {
        drawState = { active: true, phase: 1, cx: wx, cy: wy };
      } else {
        const r = Math.sqrt((wx - drawState.cx!) ** 2 + (wy - drawState.cy!) ** 2);
        if (r > 1) {
          appState.addElement({ ...defaultBase("circle"), type: "circle" as const, cx: drawState.cx!, cy: drawState.cy!, r, strokeColor: propStrokeColor, strokeWidth: propStrokeWidth, fillColor: "none", opacity: 1 });
          markDirty();
        }
        drawState = { active: false, phase: 0 };
        render();
      }
      break;
    case "arc":
      if (!drawState.active) {
        drawState = { active: true, phase: 1, cx: wx, cy: wy };
      } else if (drawState.phase === 1) {
        const r = Math.sqrt((wx - drawState.cx!) ** 2 + (wy - drawState.cy!) ** 2);
        drawState = { ...drawState, phase: 2, r, x1: wx, y1: wy };
      } else {
        const startAngle = Math.atan2(drawState.y1! - drawState.cy!, drawState.x1! - drawState.cx!);
        const endAngle = Math.atan2(wy - drawState.cy!, wx - drawState.cx!);
        appState.addElement({ ...defaultBase("arc"), type: "arc" as const, cx: drawState.cx!, cy: drawState.cy!, r: drawState.r!, startAngle, endAngle, strokeColor: propStrokeColor, strokeWidth: propStrokeWidth, opacity: 1 });
        drawState = { active: false, phase: 0 };
        markDirty();
        render();
      }
      break;
    case "rect":
      if (!drawState.active) {
        drawState = { active: true, phase: 1, x1: wx, y1: wy };
      } else {
        const w = wx - drawState.x1!;
        const h = wy - drawState.y1!;
        if (Math.abs(w) > 1 && Math.abs(h) > 1) {
          appState.addElement({ ...defaultBase("rect"), type: "rect" as const, x: Math.min(drawState.x1!, wx), y: Math.min(drawState.y1!, wy), width: Math.abs(w), height: Math.abs(h), strokeColor: propStrokeColor, strokeWidth: propStrokeWidth, fillColor: "none", opacity: 1 });
          markDirty();
        }
        drawState = { active: false, phase: 0 };
        render();
      }
      break;
    case "measurement":
      if (!drawState.active) {
        drawState = { active: true, phase: 1, x1: wx, y1: wy };
      } else if (drawState.phase === 1) {
        drawState = { ...drawState, phase: 2, x2: wx, y2: wy };
      } else {
        // Determine offset from click
        const nx = -(drawState.y2! - drawState.y1!);
        const ny = drawState.x2! - drawState.x1!;
        const len = Math.sqrt(nx * nx + ny * ny) || 1;
        const ux = nx / len, uy = ny / len;
        const mx = (drawState.x1! + drawState.x2!) / 2;
        const my = (drawState.y1! + drawState.y2!) / 2;
        const offset = (wx - mx) * ux + (wy - my) * uy;
        const pendingEl: MeasurementElement = {
          ...defaultBase("measurement") as any,
          x1: drawState.x1!, y1: drawState.y1!, x2: drawState.x2!, y2: drawState.y2!,
          offset, text: "0", unit: "mm", strokeColor: propStrokeColor, strokeWidth: propStrokeWidth, opacity: 1,
        };
        drawState = { active: false, phase: 0 };
        showMeasurementDialog(pendingEl);
      }
      break;
    case "anglemeasurement":
      if (!drawState.active) {
        // Phase 1: set vertex
        drawState = { active: true, phase: 1, cx: wx, cy: wy };
      } else if (drawState.phase === 1) {
        // Phase 2: set first arm point; initial radius = half distance to arm1
        const initRadius = Math.max(10, Math.sqrt((wx - drawState.cx!) ** 2 + (wy - drawState.cy!) ** 2) * 0.5);
        drawState = { ...drawState, phase: 2, x1: wx, y1: wy, r: initRadius };
      } else {
        // Phase 3: set second arm point → open text dialog
        const pendingEl: AngleMeasurementElement = {
          ...defaultBase("anglemeasurement") as any,
          cx: drawState.cx!, cy: drawState.cy!,
          x1: drawState.x1!, y1: drawState.y1!,
          x2: wx, y2: wy,
          radius: drawState.r!,
          text: "0", unit: "°",
          strokeColor: propStrokeColor, strokeWidth: propStrokeWidth, opacity: 1,
        };
        drawState = { active: false, phase: 0 };
        showAngleMeasurementDialog(pendingEl);
      }
      break;
    case "point":
      appState.addElement({ ...defaultBase("point"), type: "point" as const, x: wx, y: wy, size: 6, style: "cross", strokeColor: propStrokeColor, strokeWidth: propStrokeWidth, opacity: 1 });
      markDirty();
      render();
      break;
    case "annotation":
      startAnnotationCreate(e.offsetX, e.offsetY, snap.x, snap.y);
      break;
    case "viewsymbol":
      appState.addElement({ ...defaultBase("viewsymbol"), type: "viewsymbol" as const, x: wx, y: wy, label: "A", direction: 0, strokeColor: propStrokeColor, strokeWidth: propStrokeWidth, opacity: 1 });
      markDirty();
      render();
      break;
    case "image":
      pickImageFile(snap.x, snap.y);
      break;
    case "spline":
      if (!drawState.active) {
        drawState = { active: true, phase: 1, pts: [{ x: wx, y: wy }] };
      } else {
        drawState = { ...drawState, phase: drawState.phase + 1, pts: [...(drawState.pts ?? []), { x: wx, y: wy }] };
      }
      break;
  }
}

function updateDrawPreview(snap: SnapResult) {
  if (!drawState.active) return;
  const wx = snap.x;
  const wy = snap.y;

  switch (activeTool) {
    case "line":
      drawState.previewEl = { ...defaultBase("line"), x1: drawState.x1!, y1: drawState.y1!, x2: wx, y2: wy, strokeColor: propStrokeColor, strokeWidth: propStrokeWidth, opacity: 0.6 } as AnyElement;
      break;
    case "arrow":
      drawState.previewEl = { ...defaultBase("arrow"), x1: drawState.x1!, y1: drawState.y1!, x2: wx, y2: wy, arrowEnd: true, arrowStart: false, strokeColor: propStrokeColor, strokeWidth: propStrokeWidth, opacity: 0.6 } as AnyElement;
      break;
    case "circle":
      if (drawState.phase === 1) {
        const r = Math.max(1, Math.sqrt((wx - drawState.cx!) ** 2 + (wy - drawState.cy!) ** 2));
        drawState.previewEl = { ...defaultBase("circle"), cx: drawState.cx!, cy: drawState.cy!, r, strokeColor: propStrokeColor, strokeWidth: propStrokeWidth, fillColor: "none", opacity: 0.6 } as AnyElement;
      }
      break;
    case "arc":
      if (drawState.phase === 1) {
        const r = Math.max(1, Math.sqrt((wx - drawState.cx!) ** 2 + (wy - drawState.cy!) ** 2));
        drawState.previewEl = { ...defaultBase("circle"), cx: drawState.cx!, cy: drawState.cy!, r, strokeColor: propStrokeColor, strokeWidth: propStrokeWidth, strokeDash: [4, 3], fillColor: "none", opacity: 0.5 } as AnyElement;
      } else if (drawState.phase === 2) {
        const startAngle = Math.atan2(drawState.y1! - drawState.cy!, drawState.x1! - drawState.cx!);
        const endAngle = Math.atan2(wy - drawState.cy!, wx - drawState.cx!);
        drawState.previewEl = { ...defaultBase("arc"), cx: drawState.cx!, cy: drawState.cy!, r: drawState.r!, startAngle, endAngle, strokeColor: propStrokeColor, strokeWidth: propStrokeWidth, opacity: 0.6 } as AnyElement;
      }
      break;
    case "rect":
      if (drawState.phase === 1) {
        const w = wx - drawState.x1!;
        const h = wy - drawState.y1!;
        drawState.previewEl = { ...defaultBase("rect"), x: Math.min(drawState.x1!, wx), y: Math.min(drawState.y1!, wy), width: Math.abs(w), height: Math.abs(h), strokeColor: propStrokeColor, strokeWidth: propStrokeWidth, fillColor: "none", opacity: 0.6 } as AnyElement;
      }
      break;
    case "measurement":
      if (drawState.phase === 1) {
        drawState.previewEl = { ...defaultBase("line"), x1: drawState.x1!, y1: drawState.y1!, x2: wx, y2: wy, strokeColor: propStrokeColor, strokeWidth: propStrokeWidth, strokeDash: [4, 2], opacity: 0.6 } as AnyElement;
      } else if (drawState.phase === 2) {
        const nx = -(drawState.y2! - drawState.y1!);
        const ny = drawState.x2! - drawState.x1!;
        const len = Math.sqrt(nx * nx + ny * ny) || 1;
        const ux = nx / len, uy = ny / len;
        const mx = (drawState.x1! + drawState.x2!) / 2;
        const my = (drawState.y1! + drawState.y2!) / 2;
        const offset = (wx - mx) * ux + (wy - my) * uy;
        drawState.previewEl = { ...defaultBase("measurement"), x1: drawState.x1!, y1: drawState.y1!, x2: drawState.x2!, y2: drawState.y2!, offset, text: "?", unit: "", strokeColor: propStrokeColor, strokeWidth: propStrokeWidth, opacity: 0.7 } as AnyElement;
      }
      break;
    case "anglemeasurement":
      if (drawState.phase === 1) {
        // Show dashed line from vertex to mouse (first arm preview)
        drawState.previewEl = { ...defaultBase("line"), x1: drawState.cx!, y1: drawState.cy!, x2: wx, y2: wy, strokeColor: propStrokeColor, strokeWidth: propStrokeWidth, strokeDash: [4, 2], opacity: 0.6 } as AnyElement;
      } else if (drawState.phase === 2) {
        // Show full angle measurement preview
        drawState.previewEl = {
          ...defaultBase("anglemeasurement"),
          cx: drawState.cx!, cy: drawState.cy!,
          x1: drawState.x1!, y1: drawState.y1!,
          x2: wx, y2: wy,
          radius: drawState.r!,
          text: "?", unit: "°",
          strokeColor: propStrokeColor, strokeWidth: propStrokeWidth, opacity: 0.7,
        } as AnyElement;
      }
      break;
    case "spline":
      if (drawState.pts && drawState.pts.length >= 1) {
        drawState.previewEl = {
          ...defaultBase("spline"),
          points: [...drawState.pts, { x: wx, y: wy }],
          strokeColor: propStrokeColor, strokeWidth: propStrokeWidth, opacity: 0.6,
        } as AnyElement;
      }
      break;
  }
}

// ────────────────────────────────────────────────────
// Annotation input
// ────────────────────────────────────────────────────
function startAnnotationCreate(_sx: number, _sy: number, wx: number, wy: number) {
  const sx = worldToScreen(wx, wy, appState.panX, appState.panY, appState.zoom).x;
  const sy = worldToScreen(wx, wy, appState.panX, appState.panY, appState.zoom).y;
  const rect = canvas.getBoundingClientRect();
  const input = document.getElementById("annotation-input") as HTMLInputElement;
  input.style.display = "block";
  input.style.left = (rect.left + sx) + "px";
  input.style.top = (rect.top + sy - 20) + "px";
  input.value = "";
  input.focus();

  const onConfirm = () => {
    const text = input.value.trim();
    if (text) {
      appState.addElement({
        ...defaultBase("annotation"),
        x: wx, y: wy, text,
        fontSize: propFontSize,
        fontFamily: propFontFamily,
        align: "left",
        bold: false,
        italic: false,
        strokeColor: propStrokeColor,
        strokeWidth: propStrokeWidth,
        opacity: 1,
      } as AnnotationElement);
      markDirty();
      render();
    }
    input.style.display = "none";
    input.removeEventListener("keydown", onKey);
    input.removeEventListener("blur", onConfirm);
  };

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === "Enter") onConfirm();
    if (ev.key === "Escape") {
      input.style.display = "none";
      input.removeEventListener("keydown", onKey);
      input.removeEventListener("blur", onConfirm);
    }
  };

  input.addEventListener("keydown", onKey);
  // Delay blur listener: the mouseup that follows this mousedown would
  // otherwise immediately blur the input and close it with empty text.
  setTimeout(() => input.addEventListener("blur", onConfirm), 300);
}

function startAnnotationEdit(el: AnnotationElement) {
  const sp = worldToScreen(el.x, el.y, appState.panX, appState.panY, appState.zoom);
  const rect = canvas.getBoundingClientRect();
  const input = document.getElementById("annotation-input") as HTMLInputElement;
  input.style.display = "block";
  input.style.left = (rect.left + sp.x) + "px";
  input.style.top = (rect.top + sp.y - 24) + "px";
  input.value = el.text;
  input.focus();

  const onConfirm = () => {
    const text = input.value.trim();
    if (text) {
      appState.snapshot();
      appState.updateElement(el.id, { text });
      markDirty();
      render();
    }
    input.style.display = "none";
    input.removeEventListener("keydown", onKey);
    input.removeEventListener("blur", onConfirm);
  };

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === "Enter") onConfirm();
    if (ev.key === "Escape") {
      input.style.display = "none";
      input.removeEventListener("keydown", onKey);
      input.removeEventListener("blur", onConfirm);
    }
  };

  input.addEventListener("keydown", onKey);
  setTimeout(() => input.addEventListener("blur", onConfirm), 300);
}

// ────────────────────────────────────────────────────
// Measurement dialog
// ────────────────────────────────────────────────────
function showMeasurementDialog(pending: MeasurementElement) {
  const overlay = document.getElementById("measurement-dialog")!;
  const valInput = document.getElementById("meas-value-input") as HTMLInputElement;
  const unitInput = document.getElementById("meas-unit-input") as HTMLInputElement;
  valInput.value = "";
  unitInput.value = "mm";
  overlay.style.display = "flex";
  valInput.focus();

  const ok = () => {
    pending.text = valInput.value || "?";
    pending.unit = unitInput.value;
    appState.addElement(pending);
    markDirty();
    render();
    overlay.style.display = "none";
    ok_btn.removeEventListener("click", ok);
    cancel_btn.removeEventListener("click", cancel);
  };
  const cancel = () => {
    overlay.style.display = "none";
    ok_btn.removeEventListener("click", ok);
    cancel_btn.removeEventListener("click", cancel);
  };
  const ok_btn = document.getElementById("meas-ok")!;
  const cancel_btn = document.getElementById("meas-cancel")!;
  ok_btn.addEventListener("click", ok);
  cancel_btn.addEventListener("click", cancel);
  valInput.addEventListener("keydown", (ev) => { if (ev.key === "Enter") ok(); if (ev.key === "Escape") cancel(); });
}

function startMeasurementEdit(el: MeasurementElement) {
  const overlay = document.getElementById("measurement-dialog")!;
  const valInput = document.getElementById("meas-value-input") as HTMLInputElement;
  const unitInput = document.getElementById("meas-unit-input") as HTMLInputElement;
  valInput.value = el.text;
  unitInput.value = el.unit;
  overlay.style.display = "flex";
  valInput.focus();

  const ok = () => {
    appState.snapshot();
    appState.updateElement(el.id, { text: valInput.value || "?", unit: unitInput.value });
    markDirty();
    render();
    overlay.style.display = "none";
  };
  const cancel = () => { overlay.style.display = "none"; };
  document.getElementById("meas-ok")!.onclick = ok;
  document.getElementById("meas-cancel")!.onclick = cancel;
}

// ────────────────────────────────────────────────────
// Angle measurement dialog
// ────────────────────────────────────────────────────
function showAngleMeasurementDialog(pending: AngleMeasurementElement) {
  const overlay = document.getElementById("measurement-dialog")!;
  const valInput = document.getElementById("meas-value-input") as HTMLInputElement;
  const unitInput = document.getElementById("meas-unit-input") as HTMLInputElement;
  valInput.value = "";
  unitInput.value = "°";
  overlay.style.display = "flex";
  valInput.focus();

  const ok = () => {
    pending.text = valInput.value || "?";
    pending.unit = unitInput.value;
    appState.addElement(pending);
    markDirty();
    render();
    overlay.style.display = "none";
    ok_btn.removeEventListener("click", ok);
    cancel_btn.removeEventListener("click", cancel);
  };
  const cancel = () => {
    overlay.style.display = "none";
    ok_btn.removeEventListener("click", ok);
    cancel_btn.removeEventListener("click", cancel);
  };
  const ok_btn = document.getElementById("meas-ok")!;
  const cancel_btn = document.getElementById("meas-cancel")!;
  ok_btn.addEventListener("click", ok);
  cancel_btn.addEventListener("click", cancel);
  valInput.addEventListener("keydown", (ev) => { if (ev.key === "Enter") ok(); if (ev.key === "Escape") cancel(); });
}

function startAngleMeasurementEdit(el: AngleMeasurementElement) {
  const overlay = document.getElementById("measurement-dialog")!;
  const valInput = document.getElementById("meas-value-input") as HTMLInputElement;
  const unitInput = document.getElementById("meas-unit-input") as HTMLInputElement;
  valInput.value = el.text;
  unitInput.value = el.unit;
  overlay.style.display = "flex";
  valInput.focus();

  const ok = () => {
    appState.snapshot();
    appState.updateElement(el.id, { text: valInput.value || "?", unit: unitInput.value });
    markDirty();
    render();
    overlay.style.display = "none";
  };
  const cancel = () => { overlay.style.display = "none"; };
  document.getElementById("meas-ok")!.onclick = ok;
  document.getElementById("meas-cancel")!.onclick = cancel;
}

// ────────────────────────────────────────────────────
// Image insert
// ────────────────────────────────────────────────────
function pickImageFile(wx: number, wy: number) {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.onchange = () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      insertImageFromDataUrl(src, wx, wy);
    };
    reader.readAsDataURL(file);
  };
  fileInput.click();
}

function insertImageFromDataUrl(src: string, wx: number, wy: number) {
  const img = new Image();
  img.onload = () => {
    const el = { ...defaultBase("image"), x: wx, y: wy, width: img.naturalWidth, height: img.naturalHeight, src, strokeColor: "#000", strokeWidth: 0, opacity: 1 };
    imageCache.set(el.id, img);
    appState.addElement(el as AnyElement);
    markDirty();
    render();
  };
  img.src = src;
}

// ────────────────────────────────────────────────────
// Clipboard paste (images)
// ────────────────────────────────────────────────────
document.addEventListener("paste", (e: ClipboardEvent) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;

  const items = e.clipboardData?.items;
  if (!items) return;

  // Check for image data first
  for (const item of Array.from(items)) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (!file) continue;
      e.preventDefault();
      const reader = new FileReader();
      reader.onload = (ev) => {
        const src = ev.target?.result as string;
        const { w, h } = canvasCssSize();
        const cx = (w / 2 - appState.panX) / appState.zoom;
        const cy = (h / 2 - appState.panY) / appState.zoom;
        insertImageFromDataUrl(src, cx, cy);
      };
      reader.readAsDataURL(file);
      return;
    }
  }

  // Check for SketchCAD shape data in plain text
  const text = e.clipboardData?.getData("text/plain");
  if (text) {
    try {
      const parsed = JSON.parse(text);
      if (parsed._marker === CLIPBOARD_MARKER && Array.isArray(parsed.elements)) {
        e.preventDefault();
        pasteElements(parsed.elements as AnyElement[]);
        render();
        return;
      }
    } catch { /* not our JSON, ignore */ }
  }
});

// ────────────────────────────────────────────────────
// Tool buttons
// ────────────────────────────────────────────────────
document.querySelectorAll(".tool-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tool = (btn as HTMLElement).dataset.tool as Tool;
    setActiveTool(tool);
  });
});

function setActiveTool(tool: Tool) {
  activeTool = tool;
  drawState = { active: false, phase: 0 };
  document.querySelectorAll(".tool-btn").forEach((b) => b.classList.remove("active"));
  document.querySelector(`[data-tool="${tool}"]`)?.classList.add("active");
  canvas.style.cursor = getCursorForTool();
  render();
}

function getCursorForTool(): string {
  if (activeTool === "select") return "default";
  return "crosshair";
}

// ────────────────────────────────────────────────────
// Keyboard shortcuts
// ────────────────────────────────────────────────────
document.addEventListener("keydown", (e) => {
  // Prevent Alt from activating the window menu bar (which would steal mouse focus
  // from the canvas and stop mousemove events from arriving after Alt is released).
  if (e.key === "Alt") { e.preventDefault(); return; }

  const tag = (e.target as HTMLElement).tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;

  // Cancel draw
  if (e.key === "Escape") {
    setActiveTool("select");
    appState.deselectAll();
    render();
    return;
  }

  // Delete
  if (e.key === "Delete" || e.key === "Backspace") {
    appState.deleteSelected();
    markDirty();
    render();
    return;
  }

  if (e.ctrlKey || e.metaKey) {
    switch (e.key.toLowerCase()) {
      case "z": appState.undo(); render(); e.preventDefault(); break;
      case "y": appState.redo(); render(); e.preventDefault(); break;
      case "a": appState.selectAll(); render(); e.preventDefault(); break;
      case "d": duplicateSelected(); render(); e.preventDefault(); break;
      case "c": copySelected(); e.preventDefault(); break;
      case "v": /* handled entirely by the paste event listener */ break;
      case "s": e.preventDefault(); saveFile(); break;
      case "o": e.preventDefault(); openFile(); break;
      case "n": e.preventDefault(); newFile(); break;
    }
    return;
  }

  // Tool shortcuts
  const toolKeys: Record<string, Tool> = {
    "s": "select", "v": "select",
    "h": "hline",
    "l": "line",
    "c": "circle",
    "a": "arc",
    "m": "measurement",
    "n": "anglemeasurement",
    "t": "annotation",
    "w": "arrow",
    ".": "point",
    "k": "viewsymbol",
    "r": "rect",
    "i": "image",
    "b": "spline",
  };
  if (toolKeys[e.key]) {
    setActiveTool(toolKeys[e.key]);
  }

  // Zoom
  if (e.key === "=") { zoomBy(1.2); }
  if (e.key === "-") { zoomBy(0.8); }
  if (e.key === "0") { zoomFit(); }
  if (e.key === "1") { appState.zoom = 1; render(); }

  // Arrow keys nudge
  const NUDGE = e.shiftKey ? 10 : 1;
  if (e.key === "ArrowLeft") { appState.snapshot(); appState.moveSelected(-NUDGE, 0); markDirty(); render(); e.preventDefault(); }
  if (e.key === "ArrowRight") { appState.snapshot(); appState.moveSelected(NUDGE, 0); markDirty(); render(); e.preventDefault(); }
  if (e.key === "ArrowUp") { appState.snapshot(); appState.moveSelected(0, -NUDGE); markDirty(); render(); e.preventDefault(); }
  if (e.key === "ArrowDown") { appState.snapshot(); appState.moveSelected(0, NUDGE); markDirty(); render(); e.preventDefault(); }
});

document.addEventListener("keyup", (e) => {
  // When Alt is released, force a re-render so the snap indicator and preview
  // update immediately (the canvas may not receive a mousemove right away).
  if (e.key === "Alt") {
    render();
  }
});

// ────────────────────────────────────────────────────
// Properties panel
// ────────────────────────────────────────────────────
function updatePropertiesPanel() {
  const selected = appState.getSelected();
  const el = selected.length === 1 ? selected[0] : null;
  if (!el) {
    // Reset to defaults shown in panel
    return;
  }

  (document.getElementById("prop-stroke-color") as HTMLInputElement).value = el.strokeColor;
  (document.getElementById("prop-stroke-width") as HTMLInputElement).value = String(el.strokeWidth);
  (document.getElementById("prop-opacity") as HTMLInputElement).value = String(el.opacity);
  const dash = el.strokeDash ? el.strokeDash.join(",") : "";
  (document.getElementById("prop-dash") as HTMLSelectElement).value = dash;

  const hasFill = el.fillColor && el.fillColor !== "none";
  (document.getElementById("prop-fill-none") as HTMLInputElement).checked = !hasFill;
  (document.getElementById("prop-fill-color") as HTMLInputElement).value = hasFill ? el.fillColor! : "#ffffff";

  // Show text section
  const textSection = document.getElementById("props-text-section")!;
  textSection.style.display = el.type === "annotation" ? "block" : "none";
  if (el.type === "annotation") {
    (document.getElementById("prop-font-size") as HTMLInputElement).value = String(el.fontSize);
    (document.getElementById("prop-font-family") as HTMLSelectElement).value = el.fontFamily;
    (document.getElementById("prop-bold") as HTMLInputElement).checked = el.bold;
    (document.getElementById("prop-italic") as HTMLInputElement).checked = el.italic;
  }

  const measSection = document.getElementById("props-measurement-section")!;
  measSection.style.display = (el.type === "measurement" || el.type === "anglemeasurement") ? "block" : "none";
  if (el.type === "measurement" || el.type === "anglemeasurement") {
    (document.getElementById("prop-measurement-text") as HTMLInputElement).value = el.text;
    (document.getElementById("prop-measurement-unit") as HTMLInputElement).value = el.unit;
  }

  const viewSection = document.getElementById("props-viewsymbol-section")!;
  viewSection.style.display = el.type === "viewsymbol" ? "block" : "none";
  if (el.type === "viewsymbol") {
    (document.getElementById("prop-view-label") as HTMLInputElement).value = el.label;
  }

  const ptSection = document.getElementById("props-point-section")!;
  ptSection.style.display = el.type === "point" ? "block" : "none";
  if (el.type === "point") {
    (document.getElementById("prop-point-style") as HTMLSelectElement).value = el.style;
    (document.getElementById("prop-point-size") as HTMLInputElement).value = String(el.size);
  }
}

function setPageColor(color: string) {
  if (appState.pageColor === color) return;
  appState.pageColor = color;
  markDirty();
  render();
}

function syncPageColorControls() {
  const select = document.getElementById("page-prop-color") as HTMLSelectElement;
  const custom = document.getElementById("page-prop-color-custom") as HTMLInputElement;
  const normalized = appState.pageColor.toLowerCase();
  const preset = PAGE_COLOR_PRESETS.find((c) => c.toLowerCase() === normalized);
  select.value = preset ?? "custom";
  custom.value = appState.pageColor;
}

// Wire up property inputs
function wirePropertyInput(id: string, onChange: (v: string) => void) {
  document.getElementById(id)?.addEventListener("input", (e) => {
    onChange((e.target as HTMLInputElement).value);
  });
  document.getElementById(id)?.addEventListener("change", (e) => {
    onChange((e.target as HTMLInputElement).value);
  });
}

wirePropertyInput("prop-stroke-color", (v) => {
  propStrokeColor = v;
  applyToSelected({ strokeColor: v });
});
wirePropertyInput("prop-stroke-width", (v) => {
  propStrokeWidth = parseFloat(v) || 1.5;
  applyToSelected({ strokeWidth: propStrokeWidth });
});
wirePropertyInput("prop-opacity", (v) => {
  applyToSelected({ opacity: parseFloat(v) });
});
wirePropertyInput("prop-dash", (v) => {
  const dash = v ? v.split(",").map(Number) : undefined;
  applyToSelected({ strokeDash: dash });
});
wirePropertyInput("prop-fill-color", (v) => {
  const none = (document.getElementById("prop-fill-none") as HTMLInputElement).checked;
  applyToSelected({ fillColor: none ? "none" : v });
});
document.getElementById("prop-fill-none")?.addEventListener("change", (e) => {
  const none = (e.target as HTMLInputElement).checked;
  const fill = (document.getElementById("prop-fill-color") as HTMLInputElement).value;
  applyToSelected({ fillColor: none ? "none" : fill });
});
wirePropertyInput("prop-font-size", (v) => {
  applyToSelected({ fontSize: parseInt(v) || 14 });
});
wirePropertyInput("prop-font-family", (v) => {
  applyToSelected({ fontFamily: v });
});
document.getElementById("prop-bold")?.addEventListener("change", (e) => {
  applyToSelected({ bold: (e.target as HTMLInputElement).checked });
});
document.getElementById("prop-italic")?.addEventListener("change", (e) => {
  applyToSelected({ italic: (e.target as HTMLInputElement).checked });
});
wirePropertyInput("prop-measurement-text", (v) => {
  applyToSelected({ text: v });
});
wirePropertyInput("prop-measurement-unit", (v) => {
  applyToSelected({ unit: v });
});
wirePropertyInput("prop-view-label", (v) => {
  applyToSelected({ label: v });
});
wirePropertyInput("prop-point-style", (v) => {
  applyToSelected({ style: v as "cross" | "dot" | "x" });
});
wirePropertyInput("prop-point-size", (v) => {
  applyToSelected({ size: parseFloat(v) || 6 });
});

document.getElementById("page-prop-color")?.addEventListener("change", (e) => {
  const value = (e.target as HTMLSelectElement).value;
  if (value === "custom") {
    const custom = document.getElementById("page-prop-color-custom") as HTMLInputElement;
    setPageColor(custom.value);
    return;
  }
  setPageColor(value);
});

document.getElementById("page-prop-color-custom")?.addEventListener("input", (e) => {
  const value = (e.target as HTMLInputElement).value;
  const select = document.getElementById("page-prop-color") as HTMLSelectElement;
  const preset = PAGE_COLOR_PRESETS.find((c) => c.toLowerCase() === value.toLowerCase());
  select.value = preset ?? "custom";
  setPageColor(value);
});

document.getElementById("page-prop-close")?.addEventListener("click", () => {
  const dialog = document.getElementById("page-properties-dialog")!;
  dialog.style.display = "none";
});

function openPagePropertiesDialog() {
  syncPageColorControls();
  const dialog = document.getElementById("page-properties-dialog")!;
  dialog.style.display = "flex";
}

function applyToSelected(patch: Partial<AnyElement>) {
  const selected = appState.getSelected();
  if (selected.length === 0) return;
  appState.snapshot();
  for (const el of selected) {
    appState.updateElement(el.id, patch);
  }
  markDirty();
  render();
}

document.getElementById("btn-delete-selected")?.addEventListener("click", () => {
  appState.deleteSelected();
  markDirty();
  render();
});

document.getElementById("btn-bring-front")?.addEventListener("click", () => {
  bringToFront();
});
document.getElementById("btn-send-back")?.addEventListener("click", () => {
  sendToBack();
});

function bringToFront() {
  appState.snapshot();
  const sel = appState.elements.filter((e) => e.selected);
  const rest = appState.elements.filter((e) => !e.selected);
  appState.elements = [...rest, ...sel];
  markDirty();
  render();
}
function sendToBack() {
  appState.snapshot();
  const sel = appState.elements.filter((e) => e.selected);
  const rest = appState.elements.filter((e) => !e.selected);
  appState.elements = [...sel, ...rest];
  markDirty();
  render();
}

// ────────────────────────────────────────────────────
// Context menu
// ────────────────────────────────────────────────────
document.getElementById("context-menu")?.querySelectorAll(".ctx-item").forEach((item) => {
  item.addEventListener("click", () => {
    const action = (item as HTMLElement).dataset.action;
    document.getElementById("context-menu")!.style.display = "none";
    handleMenuAction(action!);
  });
});
document.addEventListener("click", () => {
  document.getElementById("context-menu")!.style.display = "none";
});

// ────────────────────────────────────────────────────
// File menu
// ────────────────────────────────────────────────────
setupDropdown("menu-file", "dropdown-file");
setupDropdown("menu-edit", "dropdown-edit");
setupDropdown("menu-view", "dropdown-view");

function setupDropdown(triggerId: string, dropdownId: string) {
  const trigger = document.getElementById(triggerId)!;
  const dropdown = document.getElementById(dropdownId)!;
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    // Close others
    document.querySelectorAll(".menu-dropdown").forEach((d) => {
      if (d.id !== dropdownId) (d as HTMLElement).style.display = "none";
    });
    dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
  });
  dropdown.querySelectorAll(".menu-action").forEach((action) => {
    action.addEventListener("click", () => {
      dropdown.style.display = "none";
      handleMenuAction((action as HTMLElement).dataset.action!);
    });
  });
}

document.addEventListener("click", (e) => {
  if (!(e.target as HTMLElement).closest(".menu-item")) {
    document.querySelectorAll(".menu-dropdown").forEach((d) => {
      (d as HTMLElement).style.display = "none";
    });
  }
});

function handleMenuAction(action: string) {
  switch (action) {
    case "new": newFile(); break;
    case "open": openFile(); break;
    case "save": saveFile(); break;
    case "save-as": saveFileAs(); break;
    case "export-svg": doExportSVG(); break;
    case "export-pdf": doExportPDF(); break;
    case "undo": appState.undo(); render(); break;
    case "redo": appState.redo(); render(); break;
    case "delete": appState.deleteSelected(); markDirty(); render(); break;
    case "select-all": appState.selectAll(); render(); break;
    case "duplicate": duplicateSelected(); render(); break;
    case "zoom-in": zoomBy(1.25); break;
    case "zoom-out": zoomBy(0.8); break;
    case "zoom-fit": zoomFit(); break;
    case "zoom-100": appState.zoom = 1; render(); break;
    case "toggle-grid": showGrid = !showGrid; render(); break;
    case "toggle-snap": snapEnabled = !snapEnabled; break;
    case "page-properties": openPagePropertiesDialog(); break;
    case "bring-front": bringToFront(); break;
    case "send-back": sendToBack(); break;
  }
}

// ────────────────────────────────────────────────────
// File operations
// ────────────────────────────────────────────────────
function markDirty() {
  isDirty = true;
  updateTitle();
}

function updateTitle() {
  const name = currentFilePath ? currentFilePath.split(/[\\/]/).pop() : "Untitled";
  document.title = `${isDirty ? "* " : ""}${name} — SketchCAD`;
  const status = document.getElementById("status-bar")!;
  status.textContent = `${appState.elements.length} element(s)  |  Zoom: ${Math.round(appState.zoom * 100)}%`;
}

function newFile() {
  if (isDirty && !confirm("Discard unsaved changes?")) return;
  appState.elements = [];
  appState.panX = 0;
  appState.panY = 0;
  appState.zoom = 1;
  appState.pageColor = "#f8fafc";
  currentFilePath = null;
  isDirty = false;
  imageCache.clear();
  appState.snapshot();
  render();
  updateTitle();
}

async function openFile() {
  const selected = await tauriOpen({
    multiple: false,
    filters: [{ name: "SketchCAD", extensions: ["skcad"] }],
  });
  if (!selected) return;
  const path = typeof selected === "string" ? selected : selected[0];
  try {
    const text = await readTextFile(path);
    const doc = deserializeDocument(text);
    appState.loadDocument(doc);
    currentFilePath = path;
    isDirty = false;
    for (const el of appState.elements) {
      if (el.type === "image") {
        const img = new Image();
        img.src = el.src;
        imageCache.set(el.id, img);
      }
    }
    render();
    updateTitle();
  } catch (err) {
    alert("Failed to open file: " + (err as Error).message);
  }
}

async function saveFile() {
  if (!currentFilePath) {
    await saveFileAs();
    return;
  }
  await doSave(currentFilePath);
}

async function saveFileAs() {
  const defaultName = (currentFilePath?.replace(/\.skcad$/, "").split(/[\\/]/).pop() ?? "drawing") + ".skcad";
  const path = await tauriSave({
    defaultPath: defaultName,
    filters: [{ name: "SketchCAD", extensions: ["skcad"] }],
  });
  if (!path) return;
  await doSave(path);
}

async function doSave(path: string) {
  const json = serializeDocument(appState.toDocument());
  await writeTextFile(path, json);
  currentFilePath = path;
  isDirty = false;
  updateTitle();
}

async function doExportSVG() {
  const { w, h } = canvasCssSize();
  const svg = exportSVG(appState.toDocument(), w, h);
  const defaultName = (currentFilePath?.replace(/\.skcad$/, "").split(/[\\/]/).pop() ?? "drawing") + ".svg";
  const path = await tauriSave({
    defaultPath: defaultName,
    filters: [{ name: "SVG Image", extensions: ["svg"] }],
  });
  if (!path) return;
  await writeTextFile(path, svg);
}

function doExportPDF() {
  // Export via print dialog as PDF
  window.print();
}

// ────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────
function duplicateSelected() {
  const selected = appState.getSelected();
  if (selected.length === 0) return;
  appState.snapshot();
  const copies = selected.map((el) => ({
    ...el,
    id: Math.random().toString(36).slice(2, 10),
    selected: true,
    ...(el.type === "hline" || el.type === "vline" ? {} : { x: (el as any).x !== undefined ? (el as any).x + 20 : undefined, y: (el as any).y !== undefined ? (el as any).y + 20 : undefined }),
  })) as AnyElement[];
  appState.deselectAll();
  for (const c of copies) appState.elements.push(c);
  markDirty();
}

function copySelected() {
  const selected = appState.getSelected();
  if (selected.length === 0) return;
  const payload = JSON.stringify({ _marker: CLIPBOARD_MARKER, elements: selected });
  navigator.clipboard.writeText(payload).catch(() => {});
}

function pasteElements(source: AnyElement[]) {
  if (source.length === 0) return;
  appState.snapshot();
  appState.deselectAll();
  const copies = source.map((el) => {
    const copy: any = { ...el, id: Math.random().toString(36).slice(2, 10), selected: true };
    // Offset pasted copies by 20 world units so they're visibly separate
    if (copy.type === "hline") { copy.y += 20; }
    else if (copy.type === "vline") { copy.x += 20; }
    else if (copy.x1 !== undefined) { copy.x1 += 20; copy.y1 += 20; copy.x2 += 20; copy.y2 += 20; }
    else if (copy.cx !== undefined) { copy.cx += 20; copy.cy += 20; }
    else { if (copy.x !== undefined) copy.x += 20; if (copy.y !== undefined) copy.y += 20; }
    // For anglemeasurement all three points need shifting
    if (copy.type === "anglemeasurement") {
      copy.cx += 20; copy.cy += 20;
      copy.x1 += 20; copy.y1 += 20;
      copy.x2 += 20; copy.y2 += 20;
    }
    return copy as AnyElement;
  });
  for (const c of copies) appState.elements.push(c);
  // Write back the offset copies so repeated Ctrl+V keeps stepping forward
  const payload = JSON.stringify({ _marker: CLIPBOARD_MARKER, elements: copies });
  navigator.clipboard.writeText(payload).catch(() => {});
  markDirty();
}

function zoomBy(factor: number) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const wx = (cx - appState.panX) / appState.zoom;
  const wy = (cy - appState.panY) / appState.zoom;
  appState.zoom = Math.max(0.05, Math.min(50, appState.zoom * factor));
  appState.panX = cx - wx * appState.zoom;
  appState.panY = cy - wy * appState.zoom;
  render();
  updateTitle();
}

function zoomFit() {
  appState.panX = 0;
  appState.panY = 0;
  appState.zoom = 1;
  render();
  updateTitle();
}

// ────────────────────────────────────────────────────
// Init
// ────────────────────────────────────────────────────
appState.snapshot(); // initial empty state in history
updateTitle();
render();
