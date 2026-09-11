import { ProjectState } from '@inneranimalmedia/agentsam-cad-shared';

export function exportToSVG(project: ProjectState): string {
  // Find bounding box
  let minX = 0, minY = 0, maxX = 300, maxY = 300;
  for (const w of project.walls) {
    minX = Math.min(minX, w.x1, w.x2);
    minY = Math.min(minY, w.y1, w.y2);
    maxX = Math.max(maxX, w.x1, w.x2);
    maxY = Math.max(maxY, w.y1, w.y2);
  }
  const padding = 60;
  const viewBoxX = minX - padding;
  const viewBoxY = minY - padding;
  const viewBoxW = maxX - minX + padding * 2;
  const viewBoxH = maxY - minY + padding * 2;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxX} ${viewBoxY} ${viewBoxW} ${viewBoxH}" width="${viewBoxW * 2}" height="${viewBoxH * 2}" style="background-color: #ffffff; font-family: ui-sans-serif, system-ui, sans-serif;">\n`;

  // Grid background pattern
  svg += `  <defs>
    <pattern id="cad-grid" width="12" height="12" patternUnits="userSpaceOnUse">
      <path d="M 12 0 L 0 0 0 12" fill="none" stroke="#f1f5f9" stroke-width="0.5"/>
    </pattern>
    <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#0284c7"/>
    </marker>
  </defs>\n`;

  svg += `  <rect x="${viewBoxX}" y="${viewBoxY}" width="${viewBoxW}" height="${viewBoxH}" fill="url(#cad-grid)"/>\n`;

  // Title block
  svg += `  <g id="title-block">
    <text x="${viewBoxX + 20}" y="${viewBoxY + 30}" font-size="16" font-weight="bold" fill="#0f172a">${project.name}</text>
    <text x="${viewBoxX + 20}" y="${viewBoxY + 48}" font-size="10" fill="#64748b">Scale: 1/4" = 1'-0" | AgentSam BIM CAD Export</text>
  </g>\n`;

  // Render Rooms (Flooring polygons & Labels)
  svg += `  <g id="rooms">\n`;
  for (const rm of project.rooms) {
    if (rm.points.length >= 3) {
      const pts = rm.points.map((p) => `${p[0]},${p[1]}`).join(' ');
      svg += `    <polygon points="${pts}" fill="${rm.color || '#f8fafc'}" opacity="0.6" stroke="#94a3b8" stroke-width="0.5"/>\n`;
      // Center of polygon
      const cx = rm.points.reduce((acc, p) => acc + p[0], 0) / rm.points.length;
      const cy = rm.points.reduce((acc, p) => acc + p[1], 0) / rm.points.length;
      svg += `    <text x="${cx}" y="${cy}" font-size="12" font-weight="600" text-anchor="middle" fill="#334155">${rm.name}</text>\n`;
      svg += `    <text x="${cx}" y="${cy + 14}" font-size="9" text-anchor="middle" fill="#64748b">${Math.round(rm.areaSqFt)} sq ft</text>\n`;
    }
  }
  svg += `  </g>\n`;

  // Render Walls
  svg += `  <g id="walls" stroke-linecap="round">\n`;
  for (const w of project.walls) {
    const strokeColor = w.exterior ? '#0f172a' : '#334155';
    svg += `    <line x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" stroke="${strokeColor}" stroke-width="${w.thickness}"/>\n`;
  }
  svg += `  </g>\n`;

  // Render Doors (with swing arcs)
  svg += `  <g id="doors">\n`;
  for (const d of project.doors) {
    const wall = project.walls.find((w) => w.id === d.wallId);
    if (!wall) continue;
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    const ux = dx / len;
    const uy = dy / len;
    const hx = wall.x1 + ux * (len * d.distanceAlongWall);
    const hy = wall.y1 + uy * (len * d.distanceAlongWall);
    const doorW = d.width;

    // Cutout over wall
    svg += `    <line x1="${hx - (ux * doorW) / 2}" y1="${hy - (uy * doorW) / 2}" x2="${hx + (ux * doorW) / 2}" y2="${hy + (uy * doorW) / 2}" stroke="#ffffff" stroke-width="${wall.thickness + 2}"/>\n`;
    // Door panel and arc
    const nx = -uy;
    const ny = ux;
    svg += `    <line x1="${hx - (ux * doorW) / 2}" y1="${hy - (uy * doorW) / 2}" x2="${hx - (ux * doorW) / 2 + nx * doorW}" y2="${hy - (uy * doorW) / 2 + ny * doorW}" stroke="#0284c7" stroke-width="2"/>\n`;
    svg += `    <path d="M ${hx + (ux * doorW) / 2} ${hy + (uy * doorW) / 2} A ${doorW} ${doorW} 0 0 0 ${hx - (ux * doorW) / 2 + nx * doorW} ${hy - (uy * doorW) / 2 + ny * doorW}" fill="none" stroke="#0284c7" stroke-width="1" stroke-dasharray="3,3"/>\n`;
  }
  svg += `  </g>\n`;

  // Render Windows
  svg += `  <g id="windows">\n`;
  for (const win of project.windows) {
    const wall = project.walls.find((w) => w.id === win.wallId);
    if (!wall) continue;
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    const ux = dx / len;
    const uy = dy / len;
    const hx = wall.x1 + ux * (len * win.distanceAlongWall);
    const hy = wall.y1 + uy * (len * win.distanceAlongWall);
    const winW = win.width;

    svg += `    <line x1="${hx - (ux * winW) / 2}" y1="${hy - (uy * winW) / 2}" x2="${hx + (ux * winW) / 2}" y2="${hy + (uy * winW) / 2}" stroke="#38bdf8" stroke-width="${wall.thickness}"/>\n`;
    svg += `    <line x1="${hx - (ux * winW) / 2}" y1="${hy - (uy * winW) / 2}" x2="${hx + (ux * winW) / 2}" y2="${hy + (uy * winW) / 2}" stroke="#0284c7" stroke-width="2"/>\n`;
  }
  svg += `  </g>\n`;

  // Render Furniture
  svg += `  <g id="furniture">\n`;
  for (const f of project.furniture) {
    const rad = ((f.rotation || 0) * Math.PI) / 180;
    svg += `    <g transform="translate(${f.x}, ${f.y}) rotate(${f.rotation || 0})">
      <rect x="${-f.w / 2}" y="${-f.d / 2}" width="${f.w}" height="${f.d}" rx="4" fill="${f.color || '#e2e8f0'}" stroke="#475569" stroke-width="1.5"/>
      <text x="0" y="3" font-size="8" text-anchor="middle" fill="#1e293b" font-weight="500">${f.name}</text>
    </g>\n`;
  }
  svg += `  </g>\n`;

  // Render Dimensions
  svg += `  <g id="dimensions">\n`;
  for (const ann of project.annotations) {
    svg += `    <line x1="${ann.x1}" y1="${ann.y1}" x2="${ann.x2}" y2="${ann.y2}" stroke="#0284c7" stroke-width="1" marker-start="url(#arrow)" marker-end="url(#arrow)"/>\n`;
    const mx = (ann.x1 + ann.x2) / 2;
    const my = (ann.y1 + ann.y2) / 2 - 4;
    svg += `    <text x="${mx}" y="${my}" font-size="10" font-weight="bold" fill="#0284c7" text-anchor="middle">${ann.label}</text>\n`;
  }
  svg += `  </g>\n`;

  svg += `</svg>`;
  return svg;
}

export function exportToOBJ(project: ProjectState): string {
  // Generate 3D Wavefront OBJ text for all walls, floors, and furniture
  let obj = `# AgentSam Design Studio - 3D BIM OBJ Export\n# Model: ${project.name}\n# Units: Meters (converted from inches 0.0254)\n\no BIM_FloorPlan\n`;

  let vertexCount = 1;
  const SCALE = 0.0254; // 1 inch = 0.0254m

  // Floors from rooms
  for (const rm of project.rooms) {
    if (rm.points.length >= 3) {
      obj += `\ng Room_${rm.id}\nusemtl Floor_${rm.floorMaterial}\n`;
      const startV = vertexCount;
      for (const pt of rm.points) {
        obj += `v ${pt[0] * SCALE} 0 ${pt[1] * SCALE}\n`;
        vertexCount++;
      }
      obj += `f`;
      for (let i = startV; i < vertexCount; i++) {
        obj += ` ${i}`;
      }
      obj += `\n`;
    }
  }

  // Walls as 3D Extruded Box Meshes
  for (const w of project.walls) {
    obj += `\ng Wall_${w.id}\nusemtl Wall_${w.material}\n`;
    const dx = w.x2 - w.x1;
    const dy = w.y2 - w.y1;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy * (w.thickness / 2);
    const ny = ux * (w.thickness / 2);
    const h = (w.height3D || 96) * SCALE;

    // 4 Base Vertices, 4 Top Vertices
    const p1 = [w.x1 + nx, w.y1 + ny];
    const p2 = [w.x2 + nx, w.y2 + ny];
    const p3 = [w.x2 - nx, w.y2 - ny];
    const p4 = [w.x1 - nx, w.y1 - ny];

    const startV = vertexCount;
    // Bottom 4 (y=0)
    obj += `v ${p1[0] * SCALE} 0 ${p1[1] * SCALE}\n`;
    obj += `v ${p2[0] * SCALE} 0 ${p2[1] * SCALE}\n`;
    obj += `v ${p3[0] * SCALE} 0 ${p3[1] * SCALE}\n`;
    obj += `v ${p4[0] * SCALE} 0 ${p4[1] * SCALE}\n`;
    // Top 4 (y=h)
    obj += `v ${p1[0] * SCALE} ${h} ${p1[1] * SCALE}\n`;
    obj += `v ${p2[0] * SCALE} ${h} ${p2[1] * SCALE}\n`;
    obj += `v ${p3[0] * SCALE} ${h} ${p3[1] * SCALE}\n`;
    obj += `v ${p4[0] * SCALE} ${h} ${p4[1] * SCALE}\n`;
    vertexCount += 8;

    // 6 Faces (cuboid)
    // Bottom
    obj += `f ${startV} ${startV + 3} ${startV + 2} ${startV + 1}\n`;
    // Top
    obj += `f ${startV + 4} ${startV + 5} ${startV + 6} ${startV + 7}\n`;
    // Front
    obj += `f ${startV} ${startV + 1} ${startV + 5} ${startV + 4}\n`;
    // Right
    obj += `f ${startV + 1} ${startV + 2} ${startV + 6} ${startV + 5}\n`;
    // Back
    obj += `f ${startV + 2} ${startV + 3} ${startV + 7} ${startV + 6}\n`;
    // Left
    obj += `f ${startV + 3} ${startV} ${startV + 4} ${startV + 7}\n`;
  }

  return obj;
}

export function exportToDXF(project: ProjectState): string {
  // Standard AutoCAD DXF ASCII format
  let dxf = `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n1\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nENDSEC\n0\nSECTION\n2\nBLOCKS\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n`;

  // Walls as LINES on LAYER "WALLS"
  for (const w of project.walls) {
    dxf += `0\nLINE\n8\nWALLS\n10\n${w.x1}\n20\n${w.y1}\n30\n0.0\n11\n${w.x2}\n21\n${w.y2}\n31\n0.0\n`;
  }

  // Room annotations as TEXT on LAYER "ROOM_LABELS"
  for (const rm of project.rooms) {
    if (rm.points.length >= 3) {
      const cx = rm.points.reduce((acc, p) => acc + p[0], 0) / rm.points.length;
      const cy = rm.points.reduce((acc, p) => acc + p[1], 0) / rm.points.length;
      dxf += `0\nTEXT\n8\nROOM_LABELS\n10\n${cx}\n20\n${cy}\n30\n0.0\n40\n12.0\n1\n${rm.name} (${Math.round(rm.areaSqFt)} sqft)\n`;
    }
  }

  dxf += `0\nENDSEC\n0\nEOF\n`;
  return dxf;
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
