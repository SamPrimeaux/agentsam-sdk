import React from 'react';
import type {ActiveTool} from '@inneranimalmedia/agentsam-cad-shared';
import {MousePointer2, Hand, ZoomIn, Scan, BrickWall, RectangleHorizontal, DoorOpen, AppWindow, Square, Circle, Waypoints, Spline, Footprints,
  Columns3, House, Fence, Mountain, Layers2, Ruler, RulerDimensionLine, Type, Grid3x3, Move, Rotate3d, Scale, FlipHorizontal2, Copy, Scissors,
  Eraser, Armchair, Flower2, Lightbulb, PenTool, Cuboid, Cylinder, Globe, Cone, ArrowUpFromLine, RotateCcw, Merge, SquareMinus, Expand, Route, Bath, Slash}
  from 'lucide-react';
import {selectKitTool, type KitValue} from '../lib/sketch-kit-store';

export type Field = {id: string; label: string; type: 'number' | 'select' | 'toggle' | 'seg'; value: KitValue; unit?: string; min?: number; max?: number; step?: number; options?: string[]};
export type Group = 'Navigate' | 'Draw' | 'Annotate' | 'Modify' | 'Place' | 'Paths' | 'Solids';
export type MenuId = 'create' | '2d' | '3d' | 'path';
export interface KitTool {
  id: string; label: string; icon: React.ComponentType<{size?: number}>; group: Group; key?: string;
  /** Real drawing tool behind this entry, when one exists. */
  live?: ActiveTool; /** Opens the furniture picker instead of arming a tool. */ place?: boolean;
  hint: string; fields: Field[]; menus: MenuId[];
}

const n = (id: string, label: string, value: number, unit = 'in', min = 0, max = 100000, step = 1): Field => ({id, label, type: 'number', value, unit, min, max, step});
const sel = (id: string, label: string, options: string[], value = options[0]): Field => ({id, label, type: 'select', value, options});
const seg = (id: string, label: string, options: string[], value = options[0]): Field => ({id, label, type: 'seg', value, options});
const tog = (id: string, label: string, value = true): Field => ({id, label, type: 'toggle', value});

export const KIT: KitTool[] = [
  // Navigate
  {id: 'select', label: 'Select', icon: MousePointer2, group: 'Navigate', key: 'V', live: 'select', menus: [], hint: 'Click an object, or drag a marquee. Shift adds to the selection.', fields: [seg('marquee', 'Marquee', ['Window', 'Crossing'], 'Crossing'), sel('filter', 'Filter', ['All', 'Walls', 'Openings', 'Spaces', 'Fixtures'])]},
  {id: 'pan', label: 'Pan', icon: Hand, group: 'Navigate', key: 'H', live: 'pan', menus: [], hint: 'Drag to move the canvas. Scroll to zoom.', fields: []},
  {id: 'zoom', label: 'Zoom region', icon: ZoomIn, group: 'Navigate', key: 'Z', menus: [], hint: 'Drag a rectangle to zoom to it.', fields: [n('factor', 'Step', 2, '×', 1.1, 8, .1)]},
  {id: 'frame', label: 'Frame all', icon: Scan, group: 'Navigate', key: 'F', menus: [], hint: 'Fit every object in the view.', fields: [tog('animate', 'Animate')]},
  // Draw
  {id: 'wall', label: 'Wall', icon: BrickWall, group: 'Draw', key: 'W', live: 'wall', menus: ['2d', 'create'], hint: 'Click to start, click to chain, double-click or Esc to finish.', fields: [n('thickness', 'Thickness', 6), n('height', 'Height', 108), seg('align', 'Align', ['Center', 'Inside', 'Outside']), tog('chain', 'Chain')]},
  {id: 'room', label: 'Space', icon: RectangleHorizontal, group: 'Draw', key: 'S', live: 'room', menus: ['2d'], hint: 'Drag a rectangle or click corners to define a space.', fields: [sel('use', 'Use', ['Living', 'Bedroom', 'Bath', 'Kitchen', 'Office', 'Garage']), sel('floor', 'Floor', ['Concrete', 'Hardwood', 'Tile', 'Carpet']), tog('walls', 'Auto walls')]},
  {id: 'door', label: 'Door', icon: DoorOpen, group: 'Draw', key: 'D', live: 'door', menus: ['2d'], hint: 'Hover a wall and click to place. Tab flips the swing.', fields: [n('width', 'Width', 36), n('height', 'Height', 80), seg('swing', 'Swing', ['Left', 'Right']), sel('kind', 'Type', ['Single', 'Double', 'Sliding', 'Pocket'])]},
  {id: 'window', label: 'Window', icon: AppWindow, group: 'Draw', key: 'N', live: 'window', menus: ['2d'], hint: 'Hover a wall and click to place.', fields: [n('width', 'Width', 36), n('height', 'Height', 48), n('sill', 'Sill', 36), sel('kind', 'Type', ['Fixed', 'Casement', 'Double-hung', 'Slider'])]},
  {id: 'rect', label: 'Rectangle', icon: Square, group: 'Draw', menus: ['2d'], hint: 'Drag corner to corner. Hold Shift for a square.', fields: [n('stroke', 'Stroke', 1, 'pt'), tog('fill', 'Fill', false), tog('closed', 'Closed')]},
  {id: 'circle', label: 'Circle', icon: Circle, group: 'Draw', menus: ['2d'], hint: 'Click the centre, drag the radius.', fields: [n('radius', 'Radius', 24), tog('fill', 'Fill', false)]},
  {id: 'polyline', label: 'Polyline', icon: Waypoints, group: 'Draw', menus: ['2d'], hint: 'Click points; Enter closes the path.', fields: [n('stroke', 'Stroke', 1, 'pt'), tog('closed', 'Closed', false), tog('ortho', 'Ortho')]},
  {id: 'arc', label: 'Arc', icon: Slash, group: 'Draw', menus: ['2d', 'path'], hint: 'Click start, end, then the bulge.', fields: [seg('mode', 'Mode', ['3-point', 'Centre', 'Tangent']), n('stroke', 'Stroke', 1, 'pt')]},
  {id: 'slab', label: 'Slab', icon: Layers2, group: 'Draw', menus: ['create'], hint: 'Outline a floor or foundation slab.', fields: [n('thickness', 'Thickness', 4), sel('finish', 'Finish', ['Concrete', 'Hardwood', 'Tile']), n('edge', 'Edge offset', 0)]},
  {id: 'stairs', label: 'Stairs', icon: Footprints, group: 'Draw', menus: ['create'], hint: 'Click the bottom step, then the direction.', fields: [n('width', 'Width', 42), n('rise', 'Rise', 7.5, 'in', 4, 9, .25), n('run', 'Run', 10, 'in', 8, 14, .25), seg('shape', 'Shape', ['Straight', 'L', 'U'])]},
  {id: 'column', label: 'Column', icon: Columns3, group: 'Draw', menus: ['create'], hint: 'Click to place a column.', fields: [seg('shape', 'Shape', ['Round', 'Square']), n('size', 'Size', 12), n('height', 'Height', 108)]},
  {id: 'roof', label: 'Roof', icon: House, group: 'Draw', menus: ['create'], hint: 'Pick a closed outline of walls to roof.', fields: [sel('kind', 'Type', ['Gable', 'Hip', 'Shed', 'Flat']), n('pitch', 'Pitch (x:12)', 6, '', 0, 24, .5), n('overhang', 'Overhang', 12)]},
  {id: 'fence', label: 'Fence', icon: Fence, group: 'Draw', menus: ['create'], hint: 'Click points along the property line.', fields: [n('height', 'Height', 72), sel('style', 'Style', ['Picket', 'Privacy', 'Rail', 'Wire'])]},
  {id: 'terrain', label: 'Terrain', icon: Mountain, group: 'Draw', menus: ['create'], hint: 'Brush over the site to shape ground.', fields: [seg('brush', 'Brush', ['Raise', 'Lower', 'Smooth']), n('radius', 'Radius', 12, 'ft'), n('strength', 'Strength', 3, '', 1, 10)]},
  // Annotate
  {id: 'measure', label: 'Measure', icon: Ruler, group: 'Annotate', key: 'M', live: 'measure', menus: ['2d'], hint: 'Click two points to read the distance.', fields: [seg('units', 'Units', ['ft-in', 'in', 'mm']), tog('geo', 'Snap to geometry')]},
  {id: 'dimension', label: 'Dimension', icon: RulerDimensionLine, group: 'Annotate', live: 'dimension', menus: ['2d'], hint: 'Click two points, then drag to place the dimension line.', fields: [sel('style', 'Style', ['Architectural', 'Engineering', 'Aligned']), n('offset', 'Offset', 12)]},
  {id: 'text', label: 'Text note', icon: Type, group: 'Annotate', key: 'T', menus: ['2d'], hint: 'Click to place a note.', fields: [n('size', 'Size', 12, 'pt'), sel('font', 'Font', ['Sans', 'Mono', 'Serif'])]},
  {id: 'grid', label: 'Grid & snap', icon: Grid3x3, group: 'Annotate', menus: [], hint: 'Grid spacing and snapping rules.', fields: [n('spacing', 'Spacing', 12), tog('snap', 'Snap to grid'), tog('ortho', 'Ortho lock', false)]},
  // Modify
  {id: 'move', label: 'Move', icon: Move, group: 'Modify', menus: [], hint: 'Pick a base point, then a destination.', fields: [tog('copy', 'Copy', false), n('dist', 'Distance', 0)]},
  {id: 'rotate', label: 'Rotate', icon: Rotate3d, group: 'Modify', menus: [], hint: 'Pick a pivot, then drag the angle.', fields: [n('angle', 'Angle', 90, '°', -360, 360), sel('about', 'About', ['Centre', 'Origin', 'Pick'])]},
  {id: 'scale', label: 'Scale', icon: Scale, group: 'Modify', menus: [], hint: 'Pick a base point, then drag.', fields: [n('factor', 'Factor', 1, '×', .1, 10, .05), tog('uniform', 'Uniform')]},
  {id: 'mirror', label: 'Mirror', icon: FlipHorizontal2, group: 'Modify', menus: [], hint: 'Pick two points for the mirror axis.', fields: [seg('axis', 'Axis', ['X', 'Y', 'Pick']), tog('keep', 'Keep original')]},
  {id: 'array', label: 'Array', icon: Copy, group: 'Modify', menus: [], hint: 'Repeat the selection.', fields: [seg('mode', 'Mode', ['Linear', 'Grid', 'Polar']), n('count', 'Count', 3, '', 2, 200), n('spacing', 'Spacing', 48)]},
  {id: 'trim', label: 'Trim', icon: Scissors, group: 'Modify', menus: [], hint: 'Click the part of a line to cut away.', fields: [seg('mode', 'Mode', ['Trim', 'Extend'])]},
  {id: 'eraser', label: 'Erase', icon: Eraser, group: 'Modify', key: 'E', live: 'eraser', menus: [], hint: 'Click an object to delete it.', fields: [tog('confirm', 'Confirm', false)]},
  // Place
  {id: 'furniture', label: 'Furniture & fixtures', icon: Armchair, group: 'Place', place: true, menus: ['create'], hint: 'Opens the furniture and fixture picker.', fields: []},
  {id: 'plants', label: 'Plants', icon: Flower2, group: 'Place', menus: ['create'], hint: 'Click to place a plant.', fields: [sel('kind', 'Kind', ['Fiddle leaf', 'Palm', 'Shrub', 'Tree']), n('height', 'Height', 48)]},
  {id: 'lights', label: 'Lighting', icon: Lightbulb, group: 'Place', menus: ['create'], hint: 'Click to place a light.', fields: [sel('kind', 'Type', ['Recessed', 'Pendant', 'Sconce', 'Track']), n('lumens', 'Lumens', 800, 'lm')]},
  {id: 'fixtures', label: 'Plumbing fixture', icon: Bath, group: 'Place', menus: ['create'], hint: 'Click to place a fixture.', fields: [sel('kind', 'Type', ['Toilet', 'Sink', 'Tub', 'Shower'])]},
  // Paths (SamSketch freehand family)
  {id: 'pen', label: 'Pen', icon: PenTool, group: 'Paths', key: 'P', menus: ['path'], hint: 'Click for corners, drag for curves.', fields: [n('stroke', 'Stroke', 1, 'pt'), tog('closed', 'Closed', false), tog('smooth', 'Smooth')]},
  {id: 'spline', label: 'Spline', icon: Spline, group: 'Paths', menus: ['path'], hint: 'Click control points; the curve passes through them.', fields: [n('tension', 'Tension', .5, '', 0, 1, .05), tog('closed', 'Closed', false)]},
  {id: 'route', label: 'Route / path', icon: Route, group: 'Paths', menus: ['path'], hint: 'Draw a route for a walkway or sweep.', fields: [n('width', 'Width', 36), sel('surface', 'Surface', ['Gravel', 'Concrete', 'Pavers'])]},
  // Solids
  {id: 'box', label: 'Box', icon: Cuboid, group: 'Solids', menus: ['3d'], hint: 'Drag the footprint, then the height.', fields: [n('w', 'Width', 48), n('d', 'Depth', 48), n('h', 'Height', 48)]},
  {id: 'cylinder', label: 'Cylinder', icon: Cylinder, group: 'Solids', menus: ['3d'], hint: 'Drag the radius, then the height.', fields: [n('r', 'Radius', 24), n('h', 'Height', 48), n('seg', 'Segments', 48, '', 8, 128)]},
  {id: 'sphere', label: 'Sphere', icon: Globe, group: 'Solids', menus: ['3d'], hint: 'Click the centre, drag the radius.', fields: [n('r', 'Radius', 24), n('seg', 'Segments', 48, '', 8, 128)]},
  {id: 'cone', label: 'Cone', icon: Cone, group: 'Solids', menus: ['3d'], hint: 'Drag the base radius, then the height.', fields: [n('r', 'Radius', 24), n('h', 'Height', 48)]},
  {id: 'extrude', label: 'Extrude', icon: ArrowUpFromLine, group: 'Solids', menus: ['3d'], hint: 'Pick a closed profile and pull.', fields: [n('dist', 'Distance', 48), n('taper', 'Taper', 0, '°', -45, 45)]},
  {id: 'revolve', label: 'Revolve', icon: RotateCcw, group: 'Solids', menus: ['3d'], hint: 'Pick a profile and an axis.', fields: [n('angle', 'Angle', 360, '°', 1, 360)]},
  {id: 'union', label: 'Union', icon: Merge, group: 'Solids', menus: ['3d'], hint: 'Pick two solids to join.', fields: [tog('keep', 'Keep tools', false)]},
  {id: 'subtract', label: 'Subtract', icon: SquareMinus, group: 'Solids', menus: ['3d'], hint: 'Pick the base, then the cutter.', fields: [tog('keep', 'Keep tools', false)]},
  {id: 'shell', label: 'Shell', icon: Expand, group: 'Solids', menus: ['3d'], hint: 'Hollow a solid and pick faces to open.', fields: [n('thickness', 'Thickness', 2)]},
];

export const GROUP_ORDER: Group[] = ['Navigate', 'Draw', 'Annotate', 'Modify', 'Place', 'Paths', 'Solids'];
export const kitById = (id: string) => KIT.find(t => t.id === id);
export const kitForLive = (tool: ActiveTool) => KIT.find(t => t.live === tool);
/** Tools a Viewer may arm. */
export const viewerSafe = (t: KitTool) => t.group === 'Navigate' || t.id === 'measure';

export function isKitActive(t: KitTool, tool: ActiveTool, kitTool: string | null) {
  return t.live ? !kitTool && tool === t.live : kitTool === t.id;
}
/** Arms a catalog tool. Live tools drive the real canvas; the rest arm the kit so options and hints respond. */
export function chooseKitTool(t: KitTool, onTool: (tool: ActiveTool) => void, onPlace?: () => void) {
  if (t.place) { onPlace?.(); return; }
  if (t.live) { selectKitTool(null); onTool(t.live); return; }
  selectKitTool(t.id); onTool('select');
}
