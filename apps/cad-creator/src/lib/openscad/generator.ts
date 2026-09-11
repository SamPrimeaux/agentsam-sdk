import { DesignProject, ParametricObject, WallElement, RoomZone } from '../../types';

export const OPENSCAD_PARAMETRIC_TEMPLATES: Record<
  string,
  {
    name: string;
    description: string;
    defaultParams: Record<string, number | string | boolean>;
    parameterDefs: ParametricObject['parameterDefs'];
    generateScad: (params: Record<string, any>) => string;
  }
> = {
  workstation: {
    name: 'Parametric Studio Workstation',
    description: 'Customizable timber and steel desk with cable grommets, chamfered edge, and modesty panel.',
    defaultParams: {
      deskWidth: 60,
      deskDepth: 30,
      deskHeight: 29.5,
      topThickness: 1.25,
      legThickness: 1.75,
      chamferRadius: 0.5,
      hasModestyPanel: true,
      hasCableGrommet: true,
    },
    parameterDefs: [
      { name: 'deskWidth', label: 'Width', type: 'number', value: 60, min: 36, max: 96, step: 1, unit: 'in' },
      { name: 'deskDepth', label: 'Depth', type: 'number', value: 30, min: 20, max: 48, step: 1, unit: 'in' },
      { name: 'deskHeight', label: 'Height', type: 'number', value: 29.5, min: 24, max: 42, step: 0.5, unit: 'in' },
      { name: 'topThickness', label: 'Top Thickness', type: 'number', value: 1.25, min: 0.75, max: 2.5, step: 0.25, unit: 'in' },
      { name: 'legThickness', label: 'Leg Profile', type: 'number', value: 1.75, min: 1, max: 3, step: 0.25, unit: 'in' },
      { name: 'hasModestyPanel', label: 'Modesty Panel', type: 'boolean', value: true },
      { name: 'hasCableGrommet', label: 'Cable Grommet', type: 'boolean', value: true },
    ],
    generateScad: (params) => {
      const w = Number(params.deskWidth || 60);
      const d = Number(params.deskDepth || 30);
      const h = Number(params.deskHeight || 29.5);
      const topT = Number(params.topThickness || 1.25);
      const legT = Number(params.legThickness || 1.75);
      const modesty = params.hasModestyPanel;
      const grommet = params.hasCableGrommet;

      return `// AgentSam Design Studio - Parametric Studio Workstation
// Units: Inches | Output: Fabrication Ready Assembly
$fn = 40;

desk_w = ${w};
desk_d = ${d};
desk_h = ${h};
top_t = ${topT};
leg_t = ${legT};

module desktop() {
    difference() {
        // Main Desktop Slab
        translate([-desk_w/2, -desk_d/2, desk_h - top_t])
            cube([desk_w, desk_d, top_t]);
        
        ${grommet ? `// CNC Cable Pass-Through Grommet
        translate([desk_w/2 - 6, 0, desk_h - top_t - 0.1])
            cylinder(h = top_t + 0.2, r = 1.25);` : ''}
    }
}

module steel_leg(x_pos, y_pos) {
    translate([x_pos, y_pos, 0])
        cube([leg_t, leg_t, desk_h - top_t]);
}

module desk_assembly() {
    desktop();
    
    // 4 Corner Legs
    offset_x = desk_w/2 - leg_t - 1;
    offset_y = desk_d/2 - leg_t - 1;
    
    steel_leg(-offset_x, -offset_y);
    steel_leg(offset_x - leg_t, -offset_y);
    steel_leg(-offset_x, offset_y - leg_t);
    steel_leg(offset_x - leg_t, offset_y - leg_t);
    
    ${modesty ? `// Structural Modesty / Cable Stiffener Panel
    translate([-desk_w/2 + 3, -offset_y + leg_t, desk_h/2])
        cube([desk_w - 6, 0.75, (desk_h - top_t)/2]);` : ''}
}

desk_assembly();
`;
    },
  },

  bookshelf: {
    name: 'Modular Parametric Bookshelf',
    description: 'Grid-based storage unit with adjustable columns, shelf tiers, and backing.',
    defaultParams: {
      unitWidth: 48,
      unitDepth: 14,
      unitHeight: 72,
      numShelves: 4,
      numColumns: 2,
      wallThickness: 0.75,
      hasBacking: true,
    },
    parameterDefs: [
      { name: 'unitWidth', label: 'Width', type: 'number', value: 48, min: 24, max: 96, step: 2, unit: 'in' },
      { name: 'unitDepth', label: 'Depth', type: 'number', value: 14, min: 10, max: 24, step: 1, unit: 'in' },
      { name: 'unitHeight', label: 'Height', type: 'number', value: 72, min: 30, max: 96, step: 2, unit: 'in' },
      { name: 'numShelves', label: 'Shelf Tiers', type: 'number', value: 4, min: 1, max: 8, step: 1 },
      { name: 'numColumns', label: 'Columns', type: 'number', value: 2, min: 1, max: 4, step: 1 },
      { name: 'wallThickness', label: 'Panel Thickness', type: 'number', value: 0.75, min: 0.5, max: 1.5, step: 0.25, unit: 'in' },
      { name: 'hasBacking', label: 'Backing Panel', type: 'boolean', value: true },
    ],
    generateScad: (params) => {
      const w = Number(params.unitWidth || 48);
      const d = Number(params.unitDepth || 14);
      const h = Number(params.unitHeight || 72);
      const shelves = Number(params.numShelves || 4);
      const cols = Number(params.numColumns || 2);
      const t = Number(params.wallThickness || 0.75);
      const back = params.hasBacking;

      return `// AgentSam Design Studio - Modular Parametric Bookshelf
// Units: Inches
$fn = 32;

w = ${w};
d = ${d};
h = ${h};
t = ${t};
num_shelves = ${shelves};
num_cols = ${cols};

module bookshelf() {
    // Outer Frame Left & Right
    translate([-w/2, -d/2, 0]) cube([t, d, h]);
    translate([w/2 - t, -d/2, 0]) cube([t, d, h]);
    
    // Top & Bottom Panels
    translate([-w/2, -d/2, 0]) cube([w, d, t]);
    translate([-w/2, -d/2, h - t]) cube([w, d, t]);
    
    // Internal Vertical Dividers
    if (num_cols > 1) {
        col_span = (w - (num_cols + 1) * t) / num_cols;
        for (i = [1 : num_cols - 1]) {
            translate([-w/2 + i * (col_span + t), -d/2, t])
                cube([t, d, h - 2*t]);
        }
    }
    
    // Horizontal Shelves
    shelf_spacing = (h - 2*t) / (num_shelves + 1);
    for (s = [1 : num_shelves]) {
        translate([-w/2 + t, -d/2, s * shelf_spacing])
            cube([w - 2*t, d, t]);
    }
    
    ${back ? `// Backing Panel
    translate([-w/2, -d/2, 0])
        cube([w, 0.25, h]);` : ''}
}

bookshelf();
`;
    },
  },

  pergola: {
    name: 'Architectural Pergola & Trellis',
    description: 'Parametric outdoor timber shade structure with posts, beams, and louvers.',
    defaultParams: {
      postSpanX: 144,
      postSpanY: 120,
      totalHeight: 108,
      postSize: 5.5,
      beamHeight: 9.25,
      numLouvers: 12,
    },
    parameterDefs: [
      { name: 'postSpanX', label: 'Width (X)', type: 'number', value: 144, min: 96, max: 288, step: 6, unit: 'in' },
      { name: 'postSpanY', label: 'Depth (Y)', type: 'number', value: 120, min: 96, max: 240, step: 6, unit: 'in' },
      { name: 'totalHeight', label: 'Clearance Height', type: 'number', value: 108, min: 84, max: 144, step: 6, unit: 'in' },
      { name: 'postSize', label: 'Post Profile', type: 'number', value: 5.5, min: 3.5, max: 7.5, step: 0.5, unit: 'in' },
      { name: 'numLouvers', label: 'Louver Rafters', type: 'number', value: 12, min: 6, max: 24, step: 1 },
    ],
    generateScad: (params) => {
      const sx = Number(params.postSpanX || 144);
      const sy = Number(params.postSpanY || 120);
      const h = Number(params.totalHeight || 108);
      const p = Number(params.postSize || 5.5);
      const louvers = Number(params.numLouvers || 12);

      return `// AgentSam Design Studio - Architectural Pergola
// Units: Inches
$fn = 32;

span_x = ${sx};
span_y = ${sy};
height = ${h};
post = ${p};
num_louvers = ${louvers};

module post_column(x, y) {
    translate([x - post/2, y - post/2, 0])
        cube([post, post, height]);
}

module pergola() {
    // 4 Corner Posts
    post_column(-span_x/2, -span_y/2);
    post_column(span_x/2, -span_y/2);
    post_column(-span_x/2, span_y/2);
    post_column(span_x/2, span_y/2);
    
    // Main Support Beams (X direction)
    translate([-span_x/2 - 12, -span_y/2 - post/2, height])
        cube([span_x + 24, 3.5, 9.25]);
    translate([-span_x/2 - 12, span_y/2 - post/2, height])
        cube([span_x + 24, 3.5, 9.25]);
        
    // Cross Louver Rafters (Y direction)
    louver_step = span_x / (num_louvers + 1);
    for (i = [0 : num_louvers + 1]) {
        translate([-span_x/2 - 6 + i * louver_step, -span_y/2 - 16, height + 9.25])
            cube([1.5, span_y + 32, 5.5]);
    }
}

pergola();
`;
    },
  },
};

export function generateOpenScadFromParametric(obj: ParametricObject): string {
  if (obj.source && obj.source.trim().length > 0) {
    return obj.source;
  }
  const tplKey = obj.generatorTemplate || 'workstation';
  const tpl = OPENSCAD_PARAMETRIC_TEMPLATES[tplKey] || OPENSCAD_PARAMETRIC_TEMPLATES.workstation;
  return tpl.generateScad(obj.parameters || tpl.defaultParams);
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
