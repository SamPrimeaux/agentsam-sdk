import { DesignProject, DesignOperation } from '../types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateDesignProject(data: any): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Project state must be an object'] };
  }

  if (typeof data.id !== 'string' || !data.id.trim()) {
    errors.push('Project must have a valid non-empty id');
  }

  if (typeof data.name !== 'string') {
    errors.push('Project name must be a string');
  }

  if (!Array.isArray(data.walls)) {
    errors.push('Project walls must be an array');
  } else {
    data.walls.forEach((w: any, i: number) => {
      if (typeof w.x1 !== 'number' || typeof w.y1 !== 'number' || typeof w.x2 !== 'number' || typeof w.y2 !== 'number') {
        errors.push(`Wall at index ${i} has invalid coordinates (x1, y1, x2, y2 must be numbers)`);
      }
      if (w.x1 === w.x2 && w.y1 === w.y2) {
        errors.push(`Wall at index ${i} has zero length`);
      }
    });
  }

  if (!Array.isArray(data.rooms)) {
    errors.push('Project rooms must be an array');
  } else {
    data.rooms.forEach((r: any, i: number) => {
      if (!Array.isArray(r.points) || r.points.length < 3) {
        errors.push(`Room at index ${i} must have at least 3 vertices`);
      }
    });
  }

  if (!Array.isArray(data.doors)) {
    errors.push('Project doors must be an array');
  }

  if (!Array.isArray(data.windows)) {
    errors.push('Project windows must be an array');
  }

  if (!Array.isArray(data.furniture)) {
    errors.push('Project furniture must be an array');
  }

  if (data.parametricObjects && !Array.isArray(data.parametricObjects)) {
    errors.push('Project parametricObjects must be an array if provided');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateDesignOperation(op: any): ValidationResult {
  const errors: string[] = [];

  if (!op || typeof op !== 'object') {
    return { valid: false, errors: ['Operation must be an object'] };
  }

  if (!op.type || typeof op.type !== 'string') {
    errors.push('Operation must have a valid type');
    return { valid: false, errors };
  }

  switch (op.type) {
    case 'create_wall':
      if (!op.wall || typeof op.wall !== 'object') {
        errors.push('create_wall must include wall object');
      } else if (op.wall.x1 === op.wall.x2 && op.wall.y1 === op.wall.y2) {
        errors.push('create_wall cannot create zero-length wall');
      }
      break;

    case 'update_wall':
      if (!op.wallId || typeof op.wallId !== 'string') {
        errors.push('update_wall requires wallId');
      }
      if (!op.updates || typeof op.updates !== 'object') {
        errors.push('update_wall requires updates object');
      }
      break;

    case 'delete_wall':
      if (!op.wallId || typeof op.wallId !== 'string') {
        errors.push('delete_wall requires wallId');
      }
      break;

    case 'create_room':
      if (!op.room || !Array.isArray(op.room.points) || op.room.points.length < 3) {
        errors.push('create_room requires room with at least 3 polygon points');
      }
      break;

    case 'add_door':
      if (!op.door || !op.door.wallId) {
        errors.push('add_door requires door with valid wallId');
      }
      break;

    case 'add_window':
      if (!op.window || !op.window.wallId) {
        errors.push('add_window requires window with valid wallId');
      }
      break;

    case 'create_parametric_object':
      if (!op.parametricObject || !op.parametricObject.id || !op.parametricObject.generator) {
        errors.push('create_parametric_object requires id and generator');
      }
      break;

    case 'update_parametric_parameter':
      if (!op.parametricObjectId || !op.parameterName) {
        errors.push('update_parametric_parameter requires parametricObjectId and parameterName');
      }
      break;

    case 'batch_operations':
      if (!Array.isArray(op.operations)) {
        errors.push('batch_operations requires operations array');
      }
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function sanitizeDesignProject(raw: Partial<DesignProject> | any): DesignProject {
  const now = Date.now();
  return {
    id: typeof raw?.id === 'string' && raw.id ? raw.id : `proj_${now}`,
    name: typeof raw?.name === 'string' && raw.name ? raw.name : 'Untitled Spatial Design',
    units: raw?.units === 'mm' || raw?.units === 'm' || raw?.units === 'ft' ? raw.units : 'in',
    scale: typeof raw?.scale === 'number' ? raw.scale : 1,
    gridSize: typeof raw?.gridSize === 'number' ? raw.gridSize : 12,
    snapToGrid: typeof raw?.snapToGrid === 'boolean' ? raw.snapToGrid : true,
    layers: Array.isArray(raw?.layers) ? raw.layers : [
      { id: 'walls', name: 'Walls & Structure', visible: true, locked: false, color: '#3b82f6' },
      { id: 'doors', name: 'Doors & Windows', visible: true, locked: false, color: '#06b6d4' },
      { id: 'rooms', name: 'Room Flooring', visible: true, locked: false, color: '#10b981' },
      { id: 'furniture', name: 'Furniture & Fixtures', visible: true, locked: false, color: '#f59e0b' },
      { id: 'parametric', name: 'Parametric Objects', visible: true, locked: false, color: '#8b5cf6' },
      { id: 'sketches', name: 'Sketches & Annotations', visible: true, locked: false, color: '#ec4899' },
    ],
    walls: Array.isArray(raw?.walls) ? raw.walls : [],
    doors: Array.isArray(raw?.doors) ? raw.doors : [],
    windows: Array.isArray(raw?.windows) ? raw.windows : [],
    furniture: Array.isArray(raw?.furniture) ? raw.furniture : [],
    rooms: Array.isArray(raw?.rooms) ? raw.rooms : [],
    annotations: Array.isArray(raw?.annotations) ? raw.annotations : [],
    parametricObjects: Array.isArray(raw?.parametricObjects) ? raw.parametricObjects : [],
    sketchDocument: raw?.sketchDocument || undefined,
    lighting: raw?.lighting || {
      sunAltitude: 45,
      sunAzimuth: 135,
      intensity: 1.1,
      timeOfDay: 'noon',
      shadows: true,
      ambientColor: '#334155',
    },
    roofType: raw?.roofType || 'none',
    ceilingHeight: typeof raw?.ceilingHeight === 'number' ? raw.ceilingHeight : 96,
    metadata: raw?.metadata || {
      createdAt: now,
      updatedAt: now,
      revision: 1,
      author: 'AgentSam Architect',
    },
    updatedAt: typeof raw?.updatedAt === 'number' ? raw.updatedAt : now,
    version: typeof raw?.version === 'number' ? raw.version : 1,
  };
}
