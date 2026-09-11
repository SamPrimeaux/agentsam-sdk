import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  ActiveTool, 
  DoorElement, 
  FurnitureElement, 
  MultiplayerUser, 
  ProjectState, 
  RoomZone, 
  WallElement, 
  WindowElement,
  MeasurementUnit,
  UserRole
} from '../types';
import { 
  MousePointer2, 
  Square, 
  Maximize, 
  DoorClosed, 
  AppWindow, 
  Armchair, 
  Ruler, 
  Eraser, 
  Hand, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Trash2,
  Copy,
  Layers,
  Magnet,
  Grid,
  Sparkles
} from 'lucide-react';
import { collaborationClient } from '../lib/socket';

interface Props {
  project: ProjectState;
  activeTool: ActiveTool;
  onToolChange: (tool: ActiveTool) => void;
  onProjectChange: (updater: (prev: ProjectState) => ProjectState) => void;
  selectedFurnitureType?: string | null;
  remoteUsers?: MultiplayerUser[];
  unit?: MeasurementUnit;
  onSelectElement?: (type: string, id: string) => void;
  userRole?: UserRole;
}

export const Canvas2D: React.FC<Props> = ({
  project,
  activeTool,
  onToolChange,
  onProjectChange,
  selectedFurnitureType,
  remoteUsers = [],
  unit = 'ft',
  onSelectElement,
  userRole = 'Editor',
}) => {
  const isViewer = userRole === 'Viewer';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Pan and Zoom
  const [pan, setPan] = useState({ x: 120, y: 120 });
  const [zoom, setZoom] = useState(1.4);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  // Selection state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'wall' | 'door' | 'window' | 'furniture' | 'room' | null>(null);

  // Drawing in progress
  const [wallStart, setWallStart] = useState<{ x: number; y: number } | null>(null);
  const [mouseWorld, setMouseWorld] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [roomPoints, setRoomPoints] = useState<[number, number][]>([]);
  const [measureStart, setMeasureStart] = useState<{ x: number; y: number } | null>(null);

  // Dragging selected object
  const isDraggingItemRef = useRef(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Snap to grid helper
  const snap = useCallback((val: number, step = project.gridSize || 12) => {
    if (!project.snapToGrid) return Math.round(val);
    return Math.round(val / step) * step;
  }, [project.snapToGrid, project.gridSize]);

  // Screen to world & World to screen conversions
  const toWorld = useCallback((screenX: number, screenY: number) => {
    return {
      x: (screenX - pan.x) / zoom,
      y: (screenY - pan.y) / zoom,
    };
  }, [pan, zoom]);

  const toScreen = useCallback((worldX: number, worldY: number) => {
    return {
      x: worldX * zoom + pan.x,
      y: worldY * zoom + pan.y,
    };
  }, [pan, zoom]);

  // Unit formatting helper
  const formatLength = useCallback((inches: number): string => {
    if (unit === 'in') return `${Math.round(inches)}"`;
    if (unit === 'm') return `${(inches * 0.0254).toFixed(2)}m`;
    // Feet and inches
    const ft = Math.floor(inches / 12);
    const inc = Math.round(inches % 12);
    return `${ft}' - ${inc}"`;
  }, [unit]);

  // Compute Floorplan Analytics (Gross Area, Perimeter, Cost)
  const stats = React.useMemo(() => {
    let totalRoomArea = 0;
    project.rooms.forEach((r) => (totalRoomArea += r.areaSqFt || 0));

    let totalWallLength = 0;
    project.walls.forEach((w) => {
      totalWallLength += Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    });

    const totalSqFt = Math.max(
      totalRoomArea,
      project.walls.length >= 4 ? (totalWallLength / 48) ** 2 : 0
    );
    const estCost = Math.round(totalSqFt * 185); // $185 per sq ft avg construction

    return {
      areaSqFt: Math.round(totalSqFt),
      perimeterFt: Math.round(totalWallLength / 12),
      estCost,
    };
  }, [project]);

  // Render 2D Canvas Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize buffer
    if (containerRef.current) {
      canvas.width = containerRef.current.clientWidth;
      canvas.height = containerRef.current.clientHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Grid (High Density CAD grid)
    const step = (project.gridSize || 12) * zoom;
    const offsetX = pan.x % step;
    const offsetY = pan.y % step;

    ctx.beginPath();
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 0.6;

    for (let x = offsetX; x < canvas.width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }
    for (let y = offsetY; y < canvas.height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();

    // Major 5-foot Grid Lines
    const majorStep = step * 5;
    const majorOffsetX = pan.x % majorStep;
    const majorOffsetY = pan.y % majorStep;
    ctx.beginPath();
    ctx.strokeStyle = '#2e2e2e';
    ctx.lineWidth = 1;
    for (let x = majorOffsetX; x < canvas.width; x += majorStep) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }
    for (let y = majorOffsetY; y < canvas.height; y += majorStep) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();

    // 2. Draw Rooms (Polygons + Color Tint + Labels)
    project.rooms.forEach((rm) => {
      if (rm.points.length >= 3) {
        ctx.beginPath();
        const p0 = toScreen(rm.points[0][0], rm.points[0][1]);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < rm.points.length; i++) {
          const pt = toScreen(rm.points[i][0], rm.points[i][1]);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.closePath();

        const isSelected = selectedId === rm.id;
        ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.2)' : 'rgba(30, 30, 30, 0.5)';
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#3b82f6' : '#444444';
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.stroke();

        // Room Label & Area text
        const cx = rm.points.reduce((acc, p) => acc + p[0], 0) / rm.points.length;
        const cy = rm.points.reduce((acc, p) => acc + p[1], 0) / rm.points.length;
        const sCenter = toScreen(cx, cy);

        ctx.fillStyle = '#e0e0e0';
        ctx.font = 'bold 11px ui-sans-serif, system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(rm.name, sCenter.x, sCenter.y - 4);

        ctx.fillStyle = '#888888';
        ctx.font = '10px ui-sans-serif, system-ui';
        ctx.fillText(`${Math.round(rm.areaSqFt)} sq ft`, sCenter.x, sCenter.y + 10);
      }
    });

    // 3. Draw In-Progress Room Polygon
    if (activeTool === 'room' && roomPoints.length > 0) {
      ctx.beginPath();
      const p0 = toScreen(roomPoints[0][0], roomPoints[0][1]);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < roomPoints.length; i++) {
        const pt = toScreen(roomPoints[i][0], roomPoints[i][1]);
        ctx.lineTo(pt.x, pt.y);
      }
      const cur = toScreen(mouseWorld.x, mouseWorld.y);
      ctx.lineTo(cur.x, cur.y);
      ctx.strokeStyle = '#a855f7';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 4. Draw Walls
    project.walls.forEach((w) => {
      const p1 = toScreen(w.x1, w.y1);
      const p2 = toScreen(w.x2, w.y2);
      const isSelected = selectedId === w.id;

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(3, (w.thickness || 6) * zoom);
      ctx.strokeStyle = isSelected ? '#38bdf8' : w.exterior ? '#020617' : '#1e293b';
      ctx.stroke();

      // Wall core stroke outline
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineWidth = Math.max(1, ((w.thickness || 6) * zoom) - 3);
      ctx.strokeStyle = isSelected ? '#60a5fa' : '#334155';
      ctx.stroke();

      // Dimension badge above wall
      const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      if (len > 24) {
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

        ctx.save();
        ctx.translate(midX, midY);
        ctx.rotate(angle > Math.PI / 2 || angle < -Math.PI / 2 ? angle + Math.PI : angle);

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-22, -18, 44, 14);
        ctx.strokeStyle = '#334155';
        ctx.strokeRect(-22, -18, 44, 14);

        ctx.fillStyle = '#38bdf8';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(formatLength(len), 0, -8);
        ctx.restore();
      }
    });

    // 5. Draw Active In-Progress Wall
    if (activeTool === 'wall' && wallStart) {
      const p1 = toScreen(wallStart.x, wallStart.y);
      const p2 = toScreen(mouseWorld.x, mouseWorld.y);
      const len = Math.hypot(mouseWorld.x - wallStart.x, mouseWorld.y - wallStart.y);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineWidth = 6 * zoom;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineCap = 'round';
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Live length badge
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(midX - 30, midY - 20, 60, 18);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(formatLength(len), midX, midY - 7);
    }

    // 6. Draw Doors (Openings & Swing Arcs)
    project.doors.forEach((d) => {
      const wall = project.walls.find((w) => w.id === d.wallId);
      if (!wall) return;
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const wallLen = Math.hypot(dx, dy);
      if (wallLen === 0) return;

      const ux = dx / wallLen;
      const uy = dy / wallLen;
      const hx = wall.x1 + ux * (wallLen * d.distanceAlongWall);
      const hy = wall.y1 + uy * (wallLen * d.distanceAlongWall);
      const doorW = d.width || 36;
      const isSelected = selectedId === d.id;

      const sPos = toScreen(hx, hy);
      const halfW = (doorW / 2) * zoom;

      // Cutout in wall
      ctx.save();
      ctx.beginPath();
      ctx.arc(sPos.x, sPos.y, halfW, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();

      // Swing Arc
      const swingRad = ((d.openAngle || 30) * Math.PI) / 180;
      const normalX = -uy;
      const normalY = ux;

      const pStart = toScreen(hx - (ux * doorW) / 2, hy - (uy * doorW) / 2);
      const pLeafEnd = toScreen(
        hx - (ux * doorW) / 2 + normalX * doorW * Math.cos(swingRad) + ux * doorW * Math.sin(swingRad),
        hy - (uy * doorW) / 2 + normalY * doorW * Math.cos(swingRad) + uy * doorW * Math.sin(swingRad)
      );

      ctx.beginPath();
      ctx.moveTo(pStart.x, pStart.y);
      ctx.lineTo(pLeafEnd.x, pLeafEnd.y);
      ctx.strokeStyle = isSelected ? '#a855f7' : '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Arc dash
      ctx.beginPath();
      ctx.arc(pStart.x, pStart.y, doorW * zoom, 0, Math.PI / 2);
      ctx.strokeStyle = isSelected ? '#c084fc' : '#0284c7';
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    });

    // 7. Draw Windows (Double Glass lines & Frame)
    project.windows.forEach((win) => {
      const wall = project.walls.find((w) => w.id === win.wallId);
      if (!wall) return;
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const wallLen = Math.hypot(dx, dy);
      if (wallLen === 0) return;

      const ux = dx / wallLen;
      const uy = dy / wallLen;
      const hx = wall.x1 + ux * (wallLen * win.distanceAlongWall);
      const hy = wall.y1 + uy * (wallLen * win.distanceAlongWall);
      const winW = win.width || 48;
      const isSelected = selectedId === win.id;

      const p1 = toScreen(hx - (ux * winW) / 2, hy - (uy * winW) / 2);
      const p2 = toScreen(hx + (ux * winW) / 2, hy + (uy * winW) / 2);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineWidth = Math.max(3, (wall.thickness || 6) * zoom);
      ctx.strokeStyle = isSelected ? '#38bdf8' : '#0ea5e9';
      ctx.stroke();

      // Glass center line
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    });

    // 8. Draw Furniture / Fixtures
    project.furniture.forEach((f) => {
      const sCenter = toScreen(f.x, f.y);
      const sW = (f.w || 36) * zoom;
      const sD = (f.d || 36) * zoom;
      const isSelected = selectedId === f.id;

      ctx.save();
      ctx.translate(sCenter.x, sCenter.y);
      ctx.rotate(((f.rotation || 0) * Math.PI) / 180);

      ctx.beginPath();
      ctx.roundRect(-sW / 2, -sD / 2, sW, sD, 4);
      ctx.fillStyle = isSelected ? 'rgba(99, 102, 241, 0.4)' : f.color || '#334155';
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#818cf8' : '#475569';
      ctx.lineWidth = isSelected ? 2.5 : 1;
      ctx.stroke();

      // Furniture Name text
      if (sW > 25 && sD > 15) {
        ctx.fillStyle = '#f8fafc';
        ctx.font = '9px ui-sans-serif, system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(f.name, 0, 3);
      }

      ctx.restore();
    });

    // 9. Draw Dimension Annotations
    project.annotations.forEach((ann) => {
      const p1 = toScreen(ann.x1, ann.y1);
      const p2 = toScreen(ann.x2, ann.y2);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Dimension Tick Caps
      const tick = 6;
      ctx.beginPath();
      ctx.moveTo(p1.x - tick, p1.y - tick);
      ctx.lineTo(p1.x + tick, p1.y + tick);
      ctx.moveTo(p2.x - tick, p2.y - tick);
      ctx.lineTo(p2.x + tick, p2.y + tick);
      ctx.strokeStyle = '#0284c7';
      ctx.stroke();

      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(midX - 25, midY - 8, 50, 16);
      ctx.strokeStyle = '#0284c7';
      ctx.strokeRect(midX - 25, midY - 8, 50, 16);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(ann.label, midX, midY + 4);
    });

    // 10. Measure Tool in Progress
    if (activeTool === 'measure' && measureStart) {
      const p1 = toScreen(measureStart.x, measureStart.y);
      const p2 = toScreen(mouseWorld.x, mouseWorld.y);
      const dist = Math.hypot(mouseWorld.x - measureStart.x, mouseWorld.y - measureStart.y);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(midX - 35, midY - 12, 70, 20);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(formatLength(dist), midX, midY + 2);
    }

    // 11. Draw Remote Multiplayer Collaborator Cursors
    remoteUsers.forEach((u) => {
      if (u.cursor && u.cursor.view === '2d') {
        const sCur = toScreen(u.cursor.x, u.cursor.y);

        ctx.save();
        ctx.fillStyle = u.color;
        ctx.beginPath();
        ctx.arc(sCur.x, sCur.y, 5, 0, Math.PI * 2);
        ctx.fill();

        // Cursor arrow pointer
        ctx.beginPath();
        ctx.moveTo(sCur.x, sCur.y);
        ctx.lineTo(sCur.x + 12, sCur.y + 4);
        ctx.lineTo(sCur.x + 6, sCur.y + 12);
        ctx.closePath();
        ctx.fillStyle = u.color;
        ctx.fill();

        // User name tag
        ctx.fillStyle = u.color;
        ctx.fillRect(sCur.x + 12, sCur.y + 4, ctx.measureText(u.name).width + 12, 16);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px ui-sans-serif, system-ui';
        ctx.textAlign = 'left';
        ctx.fillText(u.name, sCur.x + 18, sCur.y + 15);
        ctx.restore();
      }
    });
  }, [project, pan, zoom, activeTool, wallStart, mouseWorld, roomPoints, measureStart, selectedId, remoteUsers, unit, formatLength, toScreen]);

  // Handle Mouse Events
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const world = toWorld(clientX, clientY);
    const snappedWorld = { x: snap(world.x), y: snap(world.y) };

    // Pan canvas if middle click or pan tool
    if (e.button === 1 || activeTool === 'pan') {
      isPanningRef.current = true;
      panStartRef.current = { x: clientX - pan.x, y: clientY - pan.y };
      return;
    }

    // 1. Tool: Select / Transform / Move
    if (activeTool === 'select') {
      // Check click on furniture first
      const clickedFurniture = project.furniture.find((f) => {
        return Math.abs(f.x - world.x) < f.w / 2 && Math.abs(f.y - world.y) < f.d / 2;
      });

      if (clickedFurniture) {
        setSelectedId(clickedFurniture.id);
        setSelectedType('furniture');
        if (!isViewer) {
          isDraggingItemRef.current = true;
          dragOffsetRef.current = { x: world.x - clickedFurniture.x, y: world.y - clickedFurniture.y };
        }
        if (onSelectElement) onSelectElement('furniture', clickedFurniture.id);
        return;
      }

      // Check click on wall
      const clickedWall = project.walls.find((w) => {
        // Distance from point to line segment
        const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
        if (len === 0) return false;
        const u = Math.max(0, Math.min(1, ((world.x - w.x1) * (w.x2 - w.x1) + (world.y - w.y1) * (w.y2 - w.y1)) / (len * len)));
        const projX = w.x1 + u * (w.x2 - w.x1);
        const projY = w.y1 + u * (w.y2 - w.y1);
        return Math.hypot(world.x - projX, world.y - projY) < (w.thickness || 6) + 4;
      });

      if (clickedWall) {
        setSelectedId(clickedWall.id);
        setSelectedType('wall');
        if (onSelectElement) onSelectElement('wall', clickedWall.id);
        return;
      }

      // Check click on room
      const clickedRoom = project.rooms.find((rm) => {
        // Ray casting algorithm for point in polygon
        let inside = false;
        for (let i = 0, j = rm.points.length - 1; i < rm.points.length; j = i++) {
          const xi = rm.points[i][0], yi = rm.points[i][1];
          const xj = rm.points[j][0], yj = rm.points[j][1];
          const intersect = yi > world.y !== yj > world.y && world.x < ((xj - xi) * (world.y - yi)) / (yj - yi) + xi;
          if (intersect) inside = !inside;
        }
        return inside;
      });

      if (clickedRoom) {
        setSelectedId(clickedRoom.id);
        setSelectedType('room');
        if (onSelectElement) onSelectElement('room', clickedRoom.id);
        return;
      }

      setSelectedId(null);
      setSelectedType(null);
    }

    if (isViewer) return;

    // 2. Tool: Wall creation
    if (activeTool === 'wall') {
      if (!wallStart) {
        setWallStart(snappedWorld);
      } else {
        // Finish wall
        const newWall: WallElement = {
          id: `wall_${Date.now()}`,
          x1: wallStart.x,
          y1: wallStart.y,
          x2: snappedWorld.x,
          y2: snappedWorld.y,
          thickness: 6,
          height3D: project.ceilingHeight || 96,
          material: 'drywall',
          exterior: false,
        };
        onProjectChange((prev) => ({
          ...prev,
          walls: [...prev.walls, newWall],
          updatedAt: Date.now(),
        }));
        setWallStart(null);
      }
    }

    // 3. Tool: Door placement on nearest wall
    if (activeTool === 'door') {
      const nearest = findNearestWall(world.x, world.y, project.walls);
      if (nearest) {
        const newDoor: DoorElement = {
          id: `door_${Date.now()}`,
          wallId: nearest.wall.id,
          distanceAlongWall: nearest.ratio,
          width: 36,
          height: 84,
          swing: 'left',
          openAngle: 30,
          label: 'Door',
        };
        onProjectChange((prev) => ({
          ...prev,
          doors: [...prev.doors, newDoor],
          updatedAt: Date.now(),
        }));
      }
    }

    // 4. Tool: Window placement on nearest wall
    if (activeTool === 'window') {
      const nearest = findNearestWall(world.x, world.y, project.walls);
      if (nearest) {
        const newWin: WindowElement = {
          id: `win_${Date.now()}`,
          wallId: nearest.wall.id,
          distanceAlongWall: nearest.ratio,
          width: 48,
          height: 48,
          elevation: 36,
          style: 'picture',
          label: 'Window',
        };
        onProjectChange((prev) => ({
          ...prev,
          windows: [...prev.windows, newWin],
          updatedAt: Date.now(),
        }));
      }
    }

    // 5. Tool: Room polygon drawing
    if (activeTool === 'room') {
      const pt: [number, number] = [snappedWorld.x, snappedWorld.y];
      if (roomPoints.length >= 2) {
        const startPt = roomPoints[0];
        // Close polygon if clicked near start
        if (Math.hypot(pt[0] - startPt[0], pt[1] - startPt[1]) < 18) {
          // Calculate polygon area
          let area = 0;
          for (let i = 0; i < roomPoints.length; i++) {
            const j = (i + 1) % roomPoints.length;
            area += roomPoints[i][0] * roomPoints[j][1];
            area -= roomPoints[j][0] * roomPoints[i][1];
          }
          const areaSqFt = Math.abs(area) / 2 / 144;

          const newRoom: RoomZone = {
            id: `room_${Date.now()}`,
            name: `Zone ${project.rooms.length + 1}`,
            points: roomPoints,
            areaSqFt: Math.round(areaSqFt),
            floorMaterial: 'hardwood',
            color: '#f8fafc',
          };
          onProjectChange((prev) => ({
            ...prev,
            rooms: [...prev.rooms, newRoom],
            updatedAt: Date.now(),
          }));
          setRoomPoints([]);
          return;
        }
      }
      setRoomPoints((prev) => [...prev, pt]);
    }

    // 6. Tool: Place Furniture
    if (activeTool === 'furniture') {
      const type = selectedFurnitureType || 'sofa_3seater';
      const newFurniture: FurnitureElement = {
        id: `furn_${Date.now()}`,
        type,
        category: 'seating',
        name: type.replace('_', ' ').toUpperCase(),
        x: snappedWorld.x,
        y: snappedWorld.y,
        w: 60,
        d: 36,
        h: 32,
        rotation: 0,
        color: '#334155',
      };
      onProjectChange((prev) => ({
        ...prev,
        furniture: [...prev.furniture, newFurniture],
        updatedAt: Date.now(),
      }));
    }

    // 7. Tool: Measure
    if (activeTool === 'measure') {
      if (!measureStart) {
        setMeasureStart(snappedWorld);
      } else {
        setMeasureStart(null);
      }
    }

    // 8. Tool: Eraser
    if (activeTool === 'eraser') {
      // Delete whatever is clicked
      const wall = project.walls.find((w) => {
        const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
        if (len === 0) return false;
        const u = Math.max(0, Math.min(1, ((world.x - w.x1) * (w.x2 - w.x1) + (world.y - w.y1) * (w.y2 - w.y1)) / (len * len)));
        const px = w.x1 + u * (w.x2 - w.x1);
        const py = w.y1 + u * (w.y2 - w.y1);
        return Math.hypot(world.x - px, world.y - py) < 10;
      });
      if (wall) {
        onProjectChange((prev) => ({
          ...prev,
          walls: prev.walls.filter((w) => w.id !== wall.id),
          doors: prev.doors.filter((d) => d.wallId !== wall.id),
          windows: prev.windows.filter((win) => win.wallId !== wall.id),
        }));
        return;
      }

      const furn = project.furniture.find((f) => Math.abs(f.x - world.x) < f.w / 2 && Math.abs(f.y - world.y) < f.d / 2);
      if (furn) {
        onProjectChange((prev) => ({
          ...prev,
          furniture: prev.furniture.filter((f) => f.id !== furn.id),
        }));
        return;
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    if (isPanningRef.current) {
      setPan({
        x: clientX - panStartRef.current.x,
        y: clientY - panStartRef.current.y,
      });
      return;
    }

    const world = toWorld(clientX, clientY);
    const snapped = { x: snap(world.x), y: snap(world.y) };
    setMouseWorld(snapped);

    // Broadcast cursor to real-time multiplayer collaborators
    collaborationClient.sendCursor(snapped.x, snapped.y, '2d');

    // Dragging furniture
    if (isDraggingItemRef.current && selectedId && selectedType === 'furniture') {
      const newX = snap(world.x - dragOffsetRef.current.x);
      const newY = snap(world.y - dragOffsetRef.current.y);
      onProjectChange((prev) => ({
        ...prev,
        furniture: prev.furniture.map((f) => (f.id === selectedId ? { ...f, x: newX, y: newY } : f)),
      }));
    }
  };

  const handleMouseUp = () => {
    isPanningRef.current = false;
    isDraggingItemRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((prev) => Math.max(0.2, Math.min(4.0, prev * zoomFactor)));
  };

  // Helper: Find nearest wall & placement ratio
  function findNearestWall(x: number, y: number, walls: WallElement[]) {
    let nearest: { wall: WallElement; ratio: number; dist: number } | null = null;
    walls.forEach((w) => {
      const dx = w.x2 - w.x1;
      const dy = w.y2 - w.y1;
      const len = Math.hypot(dx, dy);
      if (len === 0) return;
      const u = Math.max(0.1, Math.min(0.9, ((x - w.x1) * dx + (y - w.y1) * dy) / (len * len)));
      const px = w.x1 + u * dx;
      const py = w.y1 + u * dy;
      const dist = Math.hypot(x - px, y - py);
      if (!nearest || dist < nearest.dist) {
        nearest = { wall: w, ratio: u, dist };
      }
    });
    return nearest && nearest.dist < 36 ? nearest : null;
  }

  // Delete selected element
  const handleDeleteSelected = () => {
    if (!selectedId) return;
    onProjectChange((prev) => ({
      ...prev,
      walls: prev.walls.filter((w) => w.id !== selectedId),
      doors: prev.doors.filter((d) => d.id !== selectedId),
      windows: prev.windows.filter((w) => w.id !== selectedId),
      furniture: prev.furniture.filter((f) => f.id !== selectedId),
      rooms: prev.rooms.filter((r) => r.id !== selectedId),
    }));
    setSelectedId(null);
  };

  // Rotate selected furniture
  const handleRotateSelected = () => {
    if (!selectedId || selectedType !== 'furniture') return;
    onProjectChange((prev) => ({
      ...prev,
      furniture: prev.furniture.map((f) =>
        f.id === selectedId ? { ...f, rotation: ((f.rotation || 0) + 45) % 360 } : f
      ),
    }));
  };

  return (
    <div ref={containerRef} className="w-full h-full relative bg-[#121212] overflow-hidden flex flex-col select-none">
      {/* 2D Canvas High Density Floating Toolbar */}
      <div className="absolute top-2.5 left-2.5 z-10 flex items-center space-x-0.5 bg-[#252525] border border-[#333] p-1 rounded shadow-lg">
        {isViewer && (
          <div className="px-2 py-1 bg-purple-950/60 border border-purple-800/60 rounded text-[10px] font-mono text-purple-300 flex items-center space-x-1 mr-1">
            <span>👁️ Viewer Mode</span>
          </div>
        )}

        <button
          onClick={() => onToolChange('select')}
          title="Select & Inspect (V)"
          className={`p-1.5 rounded text-xs flex items-center space-x-1 transition ${
            activeTool === 'select' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-[#333]'
          }`}
        >
          <MousePointer2 className="w-3.5 h-3.5" />
        </button>

        {!isViewer && (
          <>
            <button
              onClick={() => onToolChange('wall')}
              title="Draw Wall (W)"
              className={`p-1.5 rounded text-xs flex items-center space-x-1 transition ${
                activeTool === 'wall' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-[#333]'
              }`}
            >
              <Square className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium hidden sm:inline">Wall</span>
            </button>

            <button
              onClick={() => onToolChange('door')}
              title="Insert Door"
              className={`p-1.5 rounded text-xs flex items-center space-x-1 transition ${
                activeTool === 'door' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-[#333]'
              }`}
            >
              <DoorClosed className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium hidden sm:inline">Door</span>
            </button>

            <button
              onClick={() => onToolChange('window')}
              title="Insert Window"
              className={`p-1.5 rounded text-xs flex items-center space-x-1 transition ${
                activeTool === 'window' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-[#333]'
              }`}
            >
              <AppWindow className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium hidden sm:inline">Window</span>
            </button>

            <button
              onClick={() => onToolChange('room')}
              title="Create Room Zone"
              className={`p-1.5 rounded text-xs flex items-center space-x-1 transition ${
                activeTool === 'room' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-[#333]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium hidden sm:inline">Room</span>
            </button>

            <button
              onClick={() => onToolChange('furniture')}
              title="Place Furniture / Fixture"
              className={`p-1.5 rounded text-xs flex items-center space-x-1 transition ${
                activeTool === 'furniture' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-[#333]'
              }`}
            >
              <Armchair className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium hidden sm:inline">Fixture</span>
            </button>
          </>
        )}

        <button
          onClick={() => onToolChange('measure')}
          title="Measure Tape"
          className={`p-1.5 rounded text-xs flex items-center space-x-1 transition ${
            activeTool === 'measure' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-[#333]'
          }`}
        >
          <Ruler className="w-3.5 h-3.5" />
        </button>

        {!isViewer && (
          <button
            onClick={() => onToolChange('eraser')}
            title="Delete / Erase"
            className={`p-1.5 rounded text-xs flex items-center space-x-1 transition ${
              activeTool === 'eraser' ? 'bg-rose-600 text-white shadow-sm' : 'text-gray-400 hover:text-rose-400 hover:bg-[#333]'
            }`}
          >
            <Eraser className="w-3.5 h-3.5" />
          </button>
        )}

        <div className="w-[1px] h-4 bg-[#444] mx-0.5"></div>

        <button
          onClick={() => onToolChange('pan')}
          title="Pan Hand"
          className={`p-1.5 rounded text-xs flex items-center space-x-1 transition ${
            activeTool === 'pan' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-[#333]'
          }`}
        >
          <Hand className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Selected Element Context Actions */}
      {selectedId && !isViewer && (
        <div className="absolute top-2.5 right-2.5 z-10 flex items-center space-x-1 bg-[#252525] border border-blue-500/40 p-1 rounded shadow-lg">
          {selectedType === 'furniture' && (
            <button
              onClick={handleRotateSelected}
              className="px-2 py-1 bg-[#1E1E1E] hover:bg-[#333] text-gray-200 text-xs font-medium rounded flex items-center space-x-1 transition"
            >
              <RotateCw className="w-3 h-3" />
              <span>Rotate 45°</span>
            </button>
          )}
          <button
            onClick={handleDeleteSelected}
            className="px-2 py-1 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 text-xs font-medium rounded flex items-center space-x-1 transition"
          >
            <Trash2 className="w-3 h-3" />
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* Main Canvas HTML5 element */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className="w-full h-full cursor-crosshair"
      />

      {/* Bottom Area & Construction Stats HUD */}
      <div className="absolute bottom-2.5 left-2.5 z-10 flex items-center space-x-2 pointer-events-none">
        <div className="bg-[#252525] border border-[#333] px-3 py-1.5 rounded shadow-lg flex items-center space-x-3 text-xs">
          <div>
            <span className="text-gray-500 block text-[9px] uppercase font-bold tracking-wider">Total Area</span>
            <span className="font-bold text-white text-xs">{stats.areaSqFt} sq ft</span>
          </div>
          <div className="w-[1px] h-5 bg-[#444]"></div>
          <div>
            <span className="text-gray-500 block text-[9px] uppercase font-bold tracking-wider">Perimeter</span>
            <span className="font-semibold text-gray-300 text-xs">{stats.perimeterFt} ft</span>
          </div>
          <div className="w-[1px] h-5 bg-[#444]"></div>
          <div>
            <span className="text-gray-500 block text-[9px] uppercase font-bold tracking-wider">Est. Budget</span>
            <span className="font-semibold text-emerald-400 text-xs">${stats.estCost.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Zoom / Grid Controls Bottom Right */}
      <div className="absolute bottom-2.5 right-2.5 z-10 flex items-center space-x-0.5 bg-[#252525] border border-[#333] p-0.5 rounded shadow-lg">
        <button
          onClick={() => setZoom((z) => Math.min(4, z + 0.2))}
          className="p-1 text-gray-400 hover:text-white rounded hover:bg-[#333] transition"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] text-gray-400 font-mono px-1">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom((z) => Math.max(0.2, z - 0.2))}
          className="p-1 text-gray-400 hover:text-white rounded hover:bg-[#333] transition"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => {
            setPan({ x: 120, y: 120 });
            setZoom(1.4);
          }}
          className="px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-white rounded hover:bg-[#333] transition font-mono"
        >
          Reset
        </button>
      </div>
    </div>
  );
};
