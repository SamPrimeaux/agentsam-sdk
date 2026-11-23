import type { DesignProject, ParametricObject } from '@inneranimalmedia/agentsam-cad-shared';

/** Render a registered OpenSCAD source payload with validated parameter values. */
export function renderOpenScadTemplate(
  source: string,
  params: Record<string, number | string | boolean>,
): string {
  const rendered = source.replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g, (_match, key: string) => {
    if (!(key in params)) throw new Error(`Missing OpenSCAD template parameter: ${key}`);
    const value = params[key];
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error(`Invalid OpenSCAD numeric parameter: ${key}`);
      return String(value);
    }
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return JSON.stringify(value);
  });
  if (/\{\{\s*[A-Za-z][A-Za-z0-9_]*\s*\}\}/.test(rendered)) {
    throw new Error('The registered OpenSCAD source contains unresolved parameters.');
  }
  return rendered;
}

/** Parametric objects retain their generated source; no code-bundled fallback template is used. */
export function generateOpenScadFromParametric(obj: ParametricObject): string {
  return typeof obj.source === 'string' ? obj.source : '';
}

export function generateFullBimOpenScad(project: DesignProject): string {
  const SCALE = 1; // All dimensions in inches
  let scad = `// AgentSam Design Studio - Full BIM Floor Plan
// Model: ${project.name}
// Generated: ${new Date().toISOString()}
// Units: Inches
$fn = 32;

ceiling_height = ${project.ceilingHeight || 96};

`;

  // Walls with Doors and Windows Cutouts
  project.walls.forEach((wall, idx) => {
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const thick = wall.thickness || 6;
    const h = wall.height3D || project.ceilingHeight || 96;

    const wallDoors = project.doors.filter((d) => d.wallId === wall.id);
    const wallWindows = project.windows.filter((w) => w.wallId === wall.id);

    scad += `// Wall #${idx + 1} (${wall.id})\n`;
    scad += `module wall_${idx}() {\n`;
    scad += `    translate([${wall.x1}, ${wall.y1}, 0])\n`;
    scad += `    rotate([0, 0, ${angle}]) {\n`;

    if (wallDoors.length === 0 && wallWindows.length === 0) {
      scad += `        translate([0, -${thick / 2}, 0]) cube([${len}, ${thick}, ${h}]);\n`;
    } else {
      scad += `        difference() {\n`;
      scad += `            translate([0, -${thick / 2}, 0]) cube([${len}, ${thick}, ${h}]);\n`;

      // Door cutouts
      wallDoors.forEach((d) => {
        const doorPos = d.distanceAlongWall * len;
        const doorW = d.width || 36;
        const doorH = d.height || 84;
        scad += `            // Door cutout (${d.id})\n`;
        scad += `            translate([${doorPos - doorW / 2}, -${thick + 1}, -0.1]) cube([${doorW}, ${thick * 2 + 2}, ${doorH + 0.1}]);\n`;
      });

      // Window cutouts
      wallWindows.forEach((w) => {
        const winPos = w.distanceAlongWall * len;
        const winW = w.width || 48;
        const winH = w.height || 48;
        const winElev = w.elevation || 36;
        scad += `            // Window cutout (${w.id})\n`;
        scad += `            translate([${winPos - winW / 2}, -${thick + 1}, ${winElev}]) cube([${winW}, ${thick * 2 + 2}, ${winH}]);\n`;
      });

      scad += `        }\n`;
    }
    scad += `    }\n`;
    scad += `}\n`;
    scad += `wall_${idx}();\n\n`;
  });

  // Parametric Furniture & Objects
  if (project.parametricObjects && project.parametricObjects.length > 0) {
    scad += `// Parametric Embedded Objects\n`;
    project.parametricObjects.forEach((pObj, i) => {
      scad += `module parametric_obj_${i}() {\n`;
      scad += `    translate([${pObj.transform.x}, ${pObj.transform.y}, ${pObj.transform.z || 0}])\n`;
      scad += `    rotate([0, 0, ${pObj.transform.rotationY || 0}]) {\n`;
      const innerScad = generateOpenScadFromParametric(pObj);
      scad += `        // Embedded object: ${pObj.name}\n`;
      scad += innerScad.split('\n').map((l) => '        ' + l).join('\n') + '\n';
      scad += `    }\n`;
      scad += `}\n`;
      scad += `parametric_obj_${i}();\n\n`;
    });
  }

  return scad;
}
