import type {DesignProject, DesignOperation, RoomZone, WallElement} from '@inneranimalmedia/agentsam-cad-shared';

export type NativeSketchKind = 'ink' | 'line' | 'rect';
export type NativeSketchPoint = [number, number];
export interface NativeSketchStroke {
  id: string;
  kind: NativeSketchKind;
  points: NativeSketchPoint[];
  purpose?:'layout'|'markup';
  targetId?:string;
}

export interface SketchConversionPlan {
  operations: DesignOperation[];
  preview: {walls: WallElement[]; rooms: RoomZone[]};
  warnings: string[];
  skipped: number;
}

const valid = (p: NativeSketchPoint) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1]);
const distance = (a: NativeSketchPoint, b: NativeSketchPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function simplify(points: NativeSketchPoint[], tolerance: number): NativeSketchPoint[] {
  if (points.length <= 2) return points;
  const a = points[0], b = points[points.length - 1];
  const vx = b[0] - a[0], vy = b[1] - a[1], len = Math.max(1e-9, Math.hypot(vx, vy));
  let index = 0, max = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const dx = points[i][0] - a[0], dy = points[i][1] - a[1];
    const value = Math.abs(dx * vy - dy * vx) / len;
    if (value > max) { max = value; index = i; }
  }
  if (max <= tolerance) return [a, b];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}

function segmentKey(a: NativeSketchPoint, b: NativeSketchPoint) {
  const p = a.join(','), q = b.join(',');
  return p < q ? p + '|' + q : q + '|' + p;
}

/** Convert sketched intent into actual validated CAD commands; never fake document geometry. */
export function buildNativeSketchOperations(strokes: NativeSketchStroke[], project: DesignProject): SketchConversionPlan {
  const operations: DesignOperation[] = [];
  const walls: WallElement[] = [], rooms: RoomZone[] = [], warnings: string[] = [];
  const used = new Set(project.walls.map(w => segmentKey([w.x1,w.y1], [w.x2,w.y2])));
  const converted = new Set([
    ...project.walls.flatMap(w => w.sourceSketchShapeIds || []),
    ...project.rooms.flatMap(r => r.sourceSketchShapeIds || [])
  ]);
  const step = project.snapToGrid ? Math.max(1, project.gridSize || 12) : 1;
  const snap = (p: NativeSketchPoint): NativeSketchPoint => [Math.round(p[0] / step) * step, Math.round(p[1] / step) * step];
  let skipped = 0;
  const stamp = Date.now();

  const addWall = (stroke: NativeSketchStroke, a: NativeSketchPoint, b: NativeSketchPoint, exterior: boolean) => {
    const p = snap(a), q = snap(b);
    if (distance(p,q) < Math.max(6, step)) { skipped++; return; }
    const key = segmentKey(p,q);
    if (used.has(key)) { skipped++; return; }
    used.add(key);
    const wall: WallElement = {
      id: 'sketch-wall-' + stroke.id + '-' + walls.length,
      x1:p[0],y1:p[1],x2:q[0],y2:q[1],
      thickness:6,height3D:project.ceilingHeight || 108,material:'drywall',exterior,
      sourceSketchShapeIds:[stroke.id]
    };
    walls.push(wall);
    operations.push({id:'sketch-op-' + wall.id,type:'create_wall',wall,timestamp:stamp});
  };

  for (const stroke of strokes) {
    if(stroke.purpose==='markup')continue;
    if (converted.has(stroke.id)) continue;
    if (stroke.points.length < 2 || !stroke.points.every(valid)) {
      warnings.push('Sketch ' + stroke.id + ' has invalid or missing coordinates.');
      continue;
    }
    if (stroke.kind === 'rect') {
      const p = snap(stroke.points[0]), q = snap(stroke.points[stroke.points.length-1]);
      const left = Math.min(p[0],q[0]), right = Math.max(p[0],q[0]);
      const top = Math.min(p[1],q[1]), bottom = Math.max(p[1],q[1]);
      if (right-left < 36 || bottom-top < 36) {
        warnings.push('Sketch ' + stroke.id + ': space must be at least 3 ft by 3 ft.'); continue;
      }
      const vertices: NativeSketchPoint[] = [[left,top],[right,top],[right,bottom],[left,bottom]];
      const room: RoomZone = {
        id:'sketch-room-' + stroke.id,name:'Space ' + (project.rooms.length + rooms.length + 1),
        points:vertices,areaSqFt:Math.round(((right-left)*(bottom-top)/144)*100)/100,
        floorMaterial:'hardwood',color:'#e2e8f0',sourceSketchShapeIds:[stroke.id]
      };
      rooms.push(room);
      operations.push({id:'sketch-op-' + room.id,type:'create_room',room,timestamp:stamp});
      for (let i=0;i<4;i++) addWall(stroke,vertices[i],vertices[(i+1)%4],true);
      continue;
    }
    const path = stroke.kind === 'line'
      ? [stroke.points[0],stroke.points[stroke.points.length-1]]
      : simplify(stroke.points,Math.max(3,step*0.35)).slice(0,64);
    if (path.length > 32) warnings.push('Complex ink ' + stroke.id + ' simplified to ' + path.length + ' vertices.');
    if (path.length === 2 && distance(path[0],path[1]) < 12) {
      warnings.push('Sketch ' + stroke.id + ': line is shorter than one foot.'); continue;
    }
    for (let i=0;i<path.length-1;i++) addWall(stroke,path[i],path[i+1],false);
  }
  return {operations,preview:{walls,rooms},warnings,skipped};
}

/** Read legacy tldraw v5 shapes without loading its editor or modifying the archived snapshot. */
export function importLegacySketch(snapshot: unknown): {strokes: NativeSketchStroke[]; unsupported: number} {
  const src = snapshot as Record<string, any> | null;
  const data = src?.document?.store ?? src?.store ?? src?.records ?? {};
  const records = Array.isArray(data) ? data : Object.values(data);
  const strokes: NativeSketchStroke[] = [];
  let unsupported = 0;
  for (const value of records) {
    const record = value as Record<string, any>;
    if (record?.typeName !== 'shape') continue;
    const id = String(record.id || '');
    if (!id || !Number.isFinite(record.x) || !Number.isFinite(record.y)) {unsupported++;continue;}
    const x = record.x, y = record.y;
    if (record.type === 'geo' && record.props?.geo === 'rectangle' &&
        Number.isFinite(record.props?.w) && Number.isFinite(record.props?.h)) {
      strokes.push({id,kind:'rect',points:[[x,y],[x+record.props.w,y+record.props.h]]});
    } else if (record.type === 'line' || record.type === 'arrow') {
      const handles = record.props?.handles || {};
      const start = handles.start ?? {x:0,y:0}, end = handles.end ?? null;
      if (end && [start.x,start.y,end.x,end.y].every(Number.isFinite)) {
        strokes.push({id,kind:'line',points:[[x+start.x,y+start.y],[x+end.x,y+end.y]]});
      } else unsupported++;
    } else {unsupported++;}
  }
  return {strokes,unsupported};
}
