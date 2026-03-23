# SketchCAD — Developer Guide

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | [Tauri 2](https://tauri.app/) (Rust) |
| Frontend | TypeScript, HTML Canvas, Vite |
| Build | `vite build` + `tauri build` |

The app is a single-page canvas application. All drawing logic lives in TypeScript and runs inside Tauri's WebView. The Rust backend is thin — it only wires up the Tauri plugins (file system, dialog, shell).

---

## Prerequisites

- **Node.js** ≥ 18
- **Rust** (stable, via [rustup](https://rustup.rs/))
- **Tauri CLI** prerequisites for your platform — see the [Tauri v2 setup guide](https://tauri.app/start/prerequisites/)

On Windows you also need:
- Microsoft C++ Build Tools (via Visual Studio installer or `winget install Microsoft.VisualStudio.2022.BuildTools`)
- WebView2 (ships with Windows 11; installer available for Windows 10)

---

## Getting Started

```bash
# Install JS dependencies
npm install

# Run in development mode (Vite dev server + Tauri window)
npm run tauri dev

# Build a release binary
npm run tauri build
```

The Vite dev server listens on `http://localhost:1420` (hardcoded in `vite.config.ts` so Tauri can find it).

To iterate on the frontend alone without launching a Tauri window:
```bash
npm run dev
# Open http://localhost:1420 in a browser
```
Note: file-system features (open/save) require the Tauri window and will not work in a plain browser.

---

## Project Structure

```
sketchcad/
├── index.html            # Single HTML entry point
├── vite.config.ts        # Vite config (port 1420, Tauri build targets)
├── tsconfig.json
├── src/                  # All frontend TypeScript
│   ├── main.ts           # Entry point — UI bootstrap, event loop, tool dispatch
│   ├── types.ts          # All element types and the DrawingDocument interface
│   ├── state.ts          # AppState class (element list, pan/zoom, undo/redo)
│   ├── renderer.ts       # Canvas rendering for every element type
│   ├── hitTest.ts        # Hit-testing, handle definitions, handle drag logic
│   ├── snapping.ts       # Grid/point/angle snapping
│   ├── fileOps.ts        # SVG export, document serialise/deserialise
│   └── utils.ts          # Pure math helpers (coord transforms, geometry)
└── src-tauri/            # Rust / Tauri backend
    ├── Cargo.toml
    ├── tauri.conf.json   # App metadata, window config, plugin permissions
    ├── src/
    │   ├── main.rs       # Tauri app entry point
    │   └── lib.rs        # Plugin registration (fs, dialog, shell)
    └── capabilities/
        └── default.json  # Permission scopes for Tauri plugins
```

---

## Source Module Responsibilities

### `types.ts`
Defines every drawable element as a TypeScript interface extending `BaseElement`. All geometry is stored in **world coordinates**. The `DrawingDocument` type is what gets serialised to disk.

### `state.ts`
`AppState` owns the mutable element list, the viewport (`panX`, `panY`, `zoom`), and a linear undo/redo history stack (max 100 entries). Call `state.snapshot()` **before** any mutation to make the action undoable.

### `main.ts`
Bootstraps the DOM, registers all mouse/keyboard listeners, and drives the tool state machine. Each drawing tool is implemented as a `DrawState` phase machine (e.g. arc uses 3 click phases). After every interaction, it calls `render()` which redraws the full canvas.

### `renderer.ts`
Stateless rendering functions — each takes a canvas `CanvasRenderingContext2D` and an element and draws it. Also renders the grid, selection box overlay, snap indicators, and drag handles.

### `hitTest.ts`
- `hitTestElement` — returns the element under a screen point.
- `getHandles` — returns the set of drag handles for a selected element (endpoints, centre, midpoints, etc.).
- `applyHandleDrag` — given a handle and a new world position, returns an updated element patch.
- `moveElement` — translates all geometry of an element by `(dx, dy)`.

### `snapping.ts`
- `snapPoint` — snaps a candidate world point to nearby element endpoints, midpoints, and grid intersections.
- `snapToAngle` — constrains a point to 15° angle increments from an origin.

### `fileOps.ts`
- `exportSVG` — serialises the current document to an SVG string.
- `serializeDocument` / `deserializeDocument` — JSON round-trip for the native file format.

### `utils.ts`
Pure helpers: `worldToScreen`, `screenToWorld`, `generateId`, `dist`, `midpoint`, `clamp`, `angleDeg`, `getBoundingBox`.

---

## Coordinate System

All element geometry is stored in **world space** (unitless floating-point). The viewport transform is:

```
screenX = worldX * zoom + panX
screenY = worldY * zoom + panY
```

`worldToScreen` / `screenToWorld` in `utils.ts` apply or invert this transform. Always convert to world coords before storing geometry, and to screen coords before rendering.

---

## Adding a New Element Type

1. **`types.ts`** — add a new interface extending `BaseElement` and add it to `ElementType` and `AnyElement`.
2. **`renderer.ts`** — add a `case` in `renderElement` to draw it on the canvas.
3. **`hitTest.ts`** — add a `case` in `hitTestElement`, `getHandles`, `applyHandleDrag`, and `moveElement`.
4. **`main.ts`** — add the tool name to the `Tool` union type, handle mouse events in the tool phase machine, and add a toolbar button in the HTML template string.
5. **`fileOps.ts`** — add SVG serialisation in `exportSVG` and JSON round-trip support in `deserializeDocument`.
6. **`snapping.ts`** — add any relevant snap points to `snapPoint` if the element has characteristic geometry points.

---

## Tauri Plugins in Use

| Plugin | Purpose |
|---|---|
| `tauri-plugin-fs` | Read and write native files |
| `tauri-plugin-dialog` | Open/save file picker dialogs |
| `tauri-plugin-shell` | Reserved for future use |

Plugin permissions are declared in `src-tauri/capabilities/default.json`.

---

## Useful Commands

```bash
npm run dev           # Vite dev server only (no Tauri)
npm run build         # TypeScript check + Vite production build
npm run tauri dev     # Full app in dev mode with hot reload
npm run tauri build   # Production binary (output: src-tauri/target/release/)
```
