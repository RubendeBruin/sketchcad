import { AnyElement, DrawingDocument } from "./types";

// ────────────────────────────────────────────────────
// SVG Export
// ────────────────────────────────────────────────────
export function exportSVG(doc: DrawingDocument, width: number = 1200, height: number = 900): string {
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  parts.push(`<rect width="${width}" height="${height}" fill="white"/>`);

  for (const el of doc.elements) {
    parts.push(elementToSVG(el));
  }

  parts.push("</svg>");
  return parts.join("\n");
}

function elementToSVG(el: AnyElement): string {
  const stroke = el.strokeColor;
  const sw = el.strokeWidth;
  const opacity = el.opacity;
  const fill = el.fillColor ?? "none";
  const dash = el.strokeDash ? `stroke-dasharray="${el.strokeDash.join(",")}"` : "";
  const baseAttrs = `stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}" ${dash}`;

  switch (el.type) {
    case "hline":
      return `<line x1="0" y1="${el.y}" x2="99999" y2="${el.y}" ${baseAttrs} fill="none"/>`;
    case "vline":
      return `<line x1="${el.x}" y1="0" x2="${el.x}" y2="99999" ${baseAttrs} fill="none"/>`;
    case "line":
      return `<line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" ${baseAttrs} fill="none"/>`;
    case "circle":
      return `<circle cx="${el.cx}" cy="${el.cy}" r="${el.r}" ${baseAttrs} fill="${fill}"/>`;
    case "arc": {
      const { d } = arcPath(el.cx, el.cy, el.r, el.startAngle, el.endAngle);
      return `<path d="${d}" ${baseAttrs} fill="none"/>`;
    }
    case "measurement": {
      return measurementToSVG(el);
    }
    case "anglemeasurement": {
      return angleMeasurementToSVG(el);
    }
    case "point": {
      const s = el.size;
      if (el.style === "dot") {
        return `<circle cx="${el.x}" cy="${el.y}" r="${s / 2}" fill="${stroke}" opacity="${opacity}"/>`;
      } else if (el.style === "cross") {
        return `<g ${baseAttrs} fill="none"><line x1="${el.x - s}" y1="${el.y}" x2="${el.x + s}" y2="${el.y}"/><line x1="${el.x}" y1="${el.y - s}" x2="${el.x}" y2="${el.y + s}"/></g>`;
      } else {
        return `<g ${baseAttrs} fill="none"><line x1="${el.x - s}" y1="${el.y - s}" x2="${el.x + s}" y2="${el.y + s}"/><line x1="${el.x + s}" y1="${el.y - s}" x2="${el.x - s}" y2="${el.y + s}"/></g>`;
      }
    }
    case "annotation": {
      let fontStyle = "";
      if (el.italic) fontStyle += " font-style='italic'";
      if (el.bold) fontStyle += " font-weight='bold'";
      return `<text x="${el.x}" y="${el.y}" font-size="${el.fontSize}" font-family="${el.fontFamily}" fill="${stroke}" text-anchor="${el.align === "center" ? "middle" : el.align === "right" ? "end" : "start"}" opacity="${opacity}"${fontStyle}>${escapeXML(el.text)}</text>`;
    }
    case "arrow": {
      const arrowId = `arr-${el.id}`;
      const marker = `<defs><marker id="${arrowId}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="${stroke}"/></marker></defs>`;
      let markerAttrs = "";
      if (el.arrowEnd) markerAttrs += ` marker-end="url(#${arrowId})"`;
      if (el.arrowStart) markerAttrs += ` marker-start="url(#${arrowId})"`;
      return `${marker}<line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" ${baseAttrs} fill="none"${markerAttrs}/>`;
    }
    case "viewsymbol": {
      return viewSymbolToSVG(el);
    }
    case "rect":
      return `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" ${baseAttrs} fill="${fill}"/>`;
    case "image":
      return `<image x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" href="${el.src}" opacity="${opacity}"/>`;
    default:
      return "";
  }
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): { d: string } {
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  let diff = endAngle - startAngle;
  while (diff < 0) diff += Math.PI * 2;
  const largeArc = diff > Math.PI ? 1 : 0;
  return { d: `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}` };
}

function angleMeasurementToSVG(el: {
  cx: number; cy: number;
  x1: number; y1: number;
  x2: number; y2: number;
  radius: number;
  text: string; unit: string;
  strokeColor: string; strokeWidth: number;
}): string {
  const s = el.strokeColor;
  const sw = el.strokeWidth;
  const a1 = Math.atan2(el.y1 - el.cy, el.x1 - el.cx);
  const a2 = Math.atan2(el.y2 - el.cy, el.x2 - el.cx);
  const r = el.radius;
  const diff = ((a2 - a1) + 2 * Math.PI) % (2 * Math.PI);
  const anticlockwise = diff > Math.PI;
  // SVG arc: sweep-flag=1 matches canvas CCW (anticlockwise=false)
  const sweepFlag = anticlockwise ? 0 : 1;
  const arc1x = el.cx + r * Math.cos(a1);
  const arc1y = el.cy + r * Math.sin(a1);
  const arc2x = el.cx + r * Math.cos(a2);
  const arc2y = el.cy + r * Math.sin(a2);
  const extEnd = r + 8;
  const extGap = 4;
  // Mid angle for label
  const midAngle = anticlockwise ? a1 - (2 * Math.PI - diff) / 2 : a1 + diff / 2;
  const textR = r + 14;
  const tx = el.cx + Math.cos(midAngle) * textR;
  const ty = el.cy + Math.sin(midAngle) * textR;
  const displayText = el.unit ? `${el.text}${el.unit}` : el.text;
  const arrowId = `amarr-${Math.random().toString(36).slice(2, 6)}`;
  return `
    <defs><marker id="${arrowId}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><polygon points="0 0, 6 3, 0 6" fill="${s}"/></marker></defs>
    <line x1="${el.cx + Math.cos(a1) * extGap}" y1="${el.cy + Math.sin(a1) * extGap}" x2="${el.cx + Math.cos(a1) * extEnd}" y2="${el.cy + Math.sin(a1) * extEnd}" stroke="${s}" stroke-width="${sw}" fill="none"/>
    <line x1="${el.cx + Math.cos(a2) * extGap}" y1="${el.cy + Math.sin(a2) * extGap}" x2="${el.cx + Math.cos(a2) * extEnd}" y2="${el.cy + Math.sin(a2) * extEnd}" stroke="${s}" stroke-width="${sw}" fill="none"/>
    <path d="M ${arc1x} ${arc1y} A ${r} ${r} 0 0 ${sweepFlag} ${arc2x} ${arc2y}" stroke="${s}" stroke-width="${sw}" fill="none" marker-start="url(#${arrowId})" marker-end="url(#${arrowId})"/>
    <text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-family="sans-serif" fill="${s}">${escapeXML(displayText)}</text>
  `.trim();
}

function measurementToSVG(el: {
  x1: number; y1: number; x2: number; y2: number;
  offset: number; text: string; unit: string;
  strokeColor: string; strokeWidth: number;
}): string {
  const nx = -(el.y2 - el.y1);
  const ny = el.x2 - el.x1;
  const len = Math.sqrt(nx * nx + ny * ny) || 1;
  const ux = nx / len;
  const uy = ny / len;
  const ox = ux * el.offset;
  const oy = uy * el.offset;
  const s = el.strokeColor;
  const sw = el.strokeWidth;

  const text = el.unit ? `${el.text} ${el.unit}` : el.text;
  const mx = (el.x1 + el.x2) / 2 + ox;
  const my = (el.y1 + el.y2) / 2 + oy;
  const angle = (Math.atan2(el.y2 - el.y1, el.x2 - el.x1) * 180) / Math.PI;
  const arrowId = `marr-${Math.random().toString(36).slice(2, 6)}`;

  return `
    <defs><marker id="${arrowId}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><polygon points="0 0, 6 3, 0 6" fill="${s}"/></marker></defs>
    <line x1="${el.x1}" y1="${el.y1}" x2="${el.x1 + ox}" y2="${el.y1 + oy}" stroke="${s}" stroke-width="${sw}" fill="none"/>
    <line x1="${el.x2}" y1="${el.y2}" x2="${el.x2 + ox}" y2="${el.y2 + oy}" stroke="${s}" stroke-width="${sw}" fill="none"/>
    <line x1="${el.x1 + ox}" y1="${el.y1 + oy}" x2="${el.x2 + ox}" y2="${el.y2 + oy}" stroke="${s}" stroke-width="${sw}" fill="none" marker-start="url(#${arrowId})" marker-end="url(#${arrowId})"/>
    <text x="${mx}" y="${my - 4}" text-anchor="middle" font-size="12" font-family="sans-serif" fill="${s}" transform="rotate(${angle},${mx},${my})">${escapeXML(text)}</text>
  `.trim();
}

function viewSymbolToSVG(el: { x: number; y: number; label: string; direction: number; strokeColor: string; strokeWidth: number }): string {
  const dir = el.direction;
  const size = 20;
  const tipX = el.x + Math.cos(dir) * size * 1.5;
  const tipY = el.y + Math.sin(dir) * size * 1.5;
  const perpX = -Math.sin(dir) * size * 0.7;
  const perpY = Math.cos(dir) * size * 0.7;
  const s = el.strokeColor;
  const sw = el.strokeWidth;
  return `
    <polygon points="${tipX},${tipY} ${el.x + perpX},${el.y + perpY} ${el.x - perpX},${el.y - perpY}" fill="${s}" stroke="${s}" stroke-width="${sw}"/>
    <circle cx="${el.x}" cy="${el.y}" r="${size * 0.6}" fill="none" stroke="${s}" stroke-width="${sw}"/>
    <text x="${el.x}" y="${el.y + size * 1.4 + 5}" text-anchor="middle" font-size="14" font-family="sans-serif" font-weight="bold" fill="${s}">${escapeXML(el.label)}</text>
  `.trim();
}

function escapeXML(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ────────────────────────────────────────────────────
// Native file format (.skcad JSON)
// ────────────────────────────────────────────────────
export function serializeDocument(doc: DrawingDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function deserializeDocument(json: string): DrawingDocument {
  const doc = JSON.parse(json) as DrawingDocument;
  if (doc.version !== "1.0") {
    throw new Error("Unsupported file version");
  }
  return doc;
}
