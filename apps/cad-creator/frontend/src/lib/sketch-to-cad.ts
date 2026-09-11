import { DesignProject, DesignOperation, WallElement, RoomZone, DoorElement, WindowElement, FurnitureElement } from '@inneranimalmedia/agentsam-cad-shared';

export interface ProposedCadConversion {
  summary: {
    wallsCount: number;
    roomsCount: number;
    doorsCount: number;
    windowsCount: number;
    furnitureCount: number;
  };
  operations: DesignOperation[];
  previewElements: {
    walls: WallElement[];
    rooms: RoomZone[];
    doors: DoorElement[];
    windows: WindowElement[];
    furniture: FurnitureElement[];
  };
}

export function convertTldrawShapesToCadOperations(
  shapes: any[],
  currentProject: DesignProject
): ProposedCadConversion {
  const operations: DesignOperation[] = [];
  const proposedWalls: WallElement[] = [];
  const proposedRooms: RoomZone[] = [];
  const proposedDoors: DoorElement[] = [];
  const proposedWindows: WindowElement[] = [];
  const proposedFurniture: FurnitureElement[] = [];

  const now = Date.now();
  let counter = 1;

  // 1. First pass: extract text notes or labels for room detection
  const textShapes = shapes.filter((s) => s.type === 'text' || s.props?.text);
  const geoShapes = shapes.filter((s) => s.type === 'geo' || s.type === 'rectangle');
  const lineShapes = shapes.filter((s) => s.type === 'line' || s.type === 'arrow' || s.type === 'draw');

  // Helper to find nearest label for coordinates
  const findNearbyLabel = (cx: number, cy: number, defaultName: string) => {
    for (const ts of textShapes) {
      const tx = ts.x || 0;
      const ty = ts.y || 0;
      const dist = Math.hypot(tx - cx, ty - cy);
      if (dist < 150) {
        return ts.props?.text || defaultName;
      }
    }
    return defaultName;
  };

  // Convert Geo Rectangles to Room Zones and Perimeter Walls
  geoShapes.forEach((shape) => {
    const x = Math.round((shape.x || 0) / 12) * 12; // Snap to 1-ft grid
    const y = Math.round((shape.y || 0) / 12) * 12;
    const w = Math.max(36, Math.round(((shape.props?.w || 120) / 12)) * 12);
    const h = Math.max(36, Math.round(((shape.props?.h || 120) / 12)) * 12);

    const cx = x + w / 2;
    const cy = y + h / 2;
    const roomName = findNearbyLabel(cx, cy, `Room ${counter++}`);
    const areaSqFt = Math.round((w * h) / 144);

    const roomId = `room_sketch_${shape.id || Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const room: RoomZone = {
      id: roomId,
      name: roomName,
      points: [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ],
      areaSqFt,
      floorMaterial: 'hardwood',
      color: '#f8fafc',
      sourceSketchShapeIds: [shape.id],
    };

    proposedRooms.push(room);
    operations.push({
      id: `op_rm_${roomId}`,
      type: 'create_room',
      room,
      timestamp: now,
    });

    // Generate 4 bounding walls for this room
    const wallSegments = [
      { x1: x, y1: y, x2: x + w, y2: y },
      { x1: x + w, y1: y, x2: x + w, y2: y + h },
      { x1: x + w, y1: y + h, x2: x, y2: y + h },
      { x1: x, y1: y + h, x2: x, y2: y },
    ];

    wallSegments.forEach((seg, sIdx) => {
      const wallId = `wall_sketch_${shape.id}_${sIdx}`;
      const wall: WallElement = {
        id: wallId,
        x1: seg.x1,
        y1: seg.y1,
        x2: seg.x2,
        y2: seg.y2,
        thickness: 6,
        height3D: 96,
        material: 'drywall',
        color: '#334155',
        exterior: true,
        sourceSketchShapeIds: [shape.id],
      };
      proposedWalls.push(wall);
      operations.push({
        id: `op_w_${wallId}`,
        type: 'create_wall',
        wall,
        timestamp: now,
      });
    });
  });

  // Convert standalone Lines or Arrows to Individual Walls
  lineShapes.forEach((line) => {
    const x1 = Math.round((line.x || 0) / 12) * 12;
    const y1 = Math.round((line.y || 0) / 12) * 12;
    const handles = line.props?.handles || {};
    const endPoint = handles.end || handles.point || { x: 96, y: 0 };
    const x2 = Math.round((x1 + (endPoint.x || 96)) / 12) * 12;
    const y2 = Math.round((y1 + (endPoint.y || 0)) / 12) * 12;

    if (x1 === x2 && y1 === y2) return;

    const wallId = `wall_line_${line.id || Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const wall: WallElement = {
      id: wallId,
      x1,
      y1,
      x2,
      y2,
      thickness: 6,
      height3D: 96,
      material: 'drywall',
      color: '#334155',
      exterior: false,
      sourceSketchShapeIds: [line.id],
    };

    proposedWalls.push(wall);
    operations.push({
      id: `op_w_${wallId}`,
      type: 'create_wall',
      wall,
      timestamp: now,
    });
  });

  return {
    summary: {
      wallsCount: proposedWalls.length,
      roomsCount: proposedRooms.length,
      doorsCount: proposedDoors.length,
      windowsCount: proposedWindows.length,
      furnitureCount: proposedFurniture.length,
    },
    operations,
    previewElements: {
      walls: proposedWalls,
      rooms: proposedRooms,
      doors: proposedDoors,
      windows: proposedWindows,
      furniture: proposedFurniture,
    },
  };
}
