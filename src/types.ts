// Element types
export type ElementType =
  | "hline"             // infinite horizontal line
  | "vline"             // infinite vertical line
  | "line"              // line segment
  | "circle"
  | "arc"
  | "spline"            // Catmull-Rom spline through control points
  | "measurement"
  | "anglemeasurement"  // angle between two lines at a vertex
  | "point"
  | "annotation"        // text
  | "arrow"
  | "viewsymbol"        // A-A view symbol
  | "rect"
  | "image";

export interface Point {
  x: number;
  y: number;
}

export interface BaseElement {
  id: string;
  type: ElementType;
  selected: boolean;
  locked?: boolean;
  layer?: number;
  // Style
  strokeColor: string;
  strokeWidth: number;
  strokeDash?: number[];
  fillColor?: string;
  opacity: number;
}

export interface HLineElement extends BaseElement {
  type: "hline";
  y: number; // in world coords
}

export interface VLineElement extends BaseElement {
  type: "vline";
  x: number; // in world coords
}

export interface LineElement extends BaseElement {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CircleElement extends BaseElement {
  type: "circle";
  cx: number;
  cy: number;
  r: number;
}

export interface ArcElement extends BaseElement {
  type: "arc";
  cx: number;
  cy: number;
  r: number;
  startAngle: number; // radians
  endAngle: number;   // radians
}

export interface MeasurementElement extends BaseElement {
  type: "measurement";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  offset: number;     // perpendicular offset for dimension line
  text: string;       // manually entered measurement
  unit: string;       // e.g. "mm", "in", ""
}

export interface PointElement extends BaseElement {
  type: "point";
  x: number;
  y: number;
  size: number;
  style: "cross" | "dot" | "x";
}

export interface AnnotationElement extends BaseElement {
  type: "annotation";
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  align: "left" | "center" | "right";
  bold: boolean;
  italic: boolean;
}

export interface ArrowElement extends BaseElement {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  arrowStart: boolean;
  arrowEnd: boolean;
}

export interface ViewSymbolElement extends BaseElement {
  type: "viewsymbol";
  x: number;
  y: number;
  label: string;       // e.g. "A"
  direction: number;   // angle in radians of arrow
}

export interface RectElement extends BaseElement {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageElement extends BaseElement {
  type: "image";
  x: number;
  y: number;
  width: number;
  height: number;
  src: string; // data URL
}

export interface SplineElement extends BaseElement {
  type: "spline";
  points: Point[]; // Catmull-Rom control points in world coords
}

export interface AngleMeasurementElement extends BaseElement {
  type: "anglemeasurement";
  cx: number;     // vertex world coords (intersection point)
  cy: number;
  x1: number;     // point on first arm
  y1: number;
  x2: number;     // point on second arm
  y2: number;
  radius: number; // arc radius in world units
  text: string;   // manually entered label (e.g. "45")
  unit: string;   // e.g. "°" or ""
}

export type AnyElement =
  | HLineElement
  | VLineElement
  | LineElement
  | CircleElement
  | ArcElement
  | SplineElement
  | MeasurementElement
  | AngleMeasurementElement
  | PointElement
  | AnnotationElement
  | ArrowElement
  | ViewSymbolElement
  | RectElement
  | ImageElement;

export interface DrawingDocument {
  version: "1.0";
  elements: AnyElement[];
  pageColor?: string;
  viewport: {
    panX: number;
    panY: number;
    zoom: number;
  };
}
