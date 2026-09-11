import {
  ProjectState,
  CadRecipe,
  CadRecipeOperation,
} from '../../../shared/cad';

/**
 * Deterministic Geometry Compiler
 *
 * Converts a normalized 2D/3D architectural ProjectState into an immutable AgentSam CAD Recipe.
 * STRICT DIRECTIVE: DO NOT invoke an LLM here. This is pure, deterministic geometry compilation.
 */
export function compileProjectToCadRecipe(project: ProjectState): CadRecipe {
  const operations: CadRecipeOperation[] = [];

  // 1. Structure Collections
  operations.push(
    { op: 'create_collection', id: 'col_arch', params: { name: 'Architecture', color: '#64748b' } },
    { op: 'create_collection', id: 'col_openings', params: { name: 'Openings', color: '#38bdf8' } },
    { op: 'create_collection', id: 'col_slabs', params: { name: 'FloorSlabs', color: '#94a3b8' } },
    { op: 'create_collection', id: 'col_fixtures', params: { name: 'Fixtures', color: '#f59e0b' } },
    { op: 'create_collection', id: 'col_lighting', params: { name: 'Lighting', color: '#fbbf24' } }
  );

  // 2. Extrude Walls
  if (Array.isArray(project.walls)) {
    for (const wall of project.walls) {
      operations.push({
        op: 'extrude_wall',
        id: `wall_${wall.id}`,
        collection: 'Architecture',
        params: {
          x1: wall.x1,
          y1: wall.y1,
          x2: wall.x2,
          y2: wall.y2,
          thickness: wall.thickness || 6,
          height: wall.height3D || project.ceilingHeight || 108,
          material: wall.material || 'drywall',
          exterior: Boolean(wall.exterior),
        },
      });
    }
  }

  // 3. Boolean Openings (Doors & Windows)
  if (Array.isArray(project.doors)) {
    for (const door of project.doors) {
      operations.push({
        op: 'boolean_opening',
        id: `door_${door.id}`,
        collection: 'Openings',
        params: {
          type: 'door',
          wallId: door.wallId,
          distanceAlongWall: door.distanceAlongWall,
          width: door.width || 36,
          height: door.height || 84,
          elevation: 0,
          swing: door.swing || 'right',
          openAngle: door.openAngle || 30,
        },
      });
    }
  }

  if (Array.isArray(project.windows)) {
    for (const win of project.windows) {
      operations.push({
        op: 'boolean_opening',
        id: `win_${win.id}`,
        collection: 'Openings',
        params: {
          type: 'window',
          wallId: win.wallId,
          distanceAlongWall: win.distanceAlongWall,
          width: win.width || 48,
          height: win.height || 48,
          elevation: win.elevation || 36,
          style: win.style || 'casement',
        },
      });
    }
  }

  // 4. Create Room Floor Slabs
  if (Array.isArray(project.rooms)) {
    for (const room of project.rooms) {
      if (room.points && room.points.length >= 3) {
        operations.push({
          op: 'create_floor_slab',
          id: `room_${room.id}`,
          collection: 'FloorSlabs',
          params: {
            name: room.name,
            points: room.points,
            areaSqFt: room.areaSqFt,
            material: room.floorMaterial || 'hardwood',
            thickness: 4, // 4-inch standard subfloor slab
          },
        });
      }
    }
  }

  // 5. Place Fixtures & Furniture
  if (Array.isArray(project.furniture)) {
    for (const item of project.furniture) {
      operations.push({
        op: 'place_fixture',
        id: `fixture_${item.id}`,
        collection: 'Fixtures',
        params: {
          type: item.type,
          category: item.category,
          name: item.name,
          x: item.x,
          y: item.y,
          z: 0,
          w: item.w,
          d: item.d,
          h: item.h,
          rotation: item.rotation || 0,
          color: item.color,
          material: item.material,
        },
      });
    }
  }

  // 6. Lighting & Environment
  const lighting = project.lighting || {
    sunAltitude: 45,
    sunAzimuth: 135,
    intensity: 1.2,
    timeOfDay: 'afternoon',
    shadows: true,
    ambientColor: '#f8fafc',
  };

  operations.push({
    op: 'setup_sunlight',
    id: 'sun_primary',
    collection: 'Lighting',
    params: {
      altitude: lighting.sunAltitude,
      azimuth: lighting.sunAzimuth,
      intensity: lighting.intensity,
      shadows: lighting.shadows,
      color: lighting.ambientColor,
    },
  });

  return {
    schema_version: 1,
    recipe_id: `recipe_${project.id || 'studio'}_${Date.now()}`,
    title: project.name ? `${project.name} CAD Recipe` : 'AgentSam CAD Studio Recipe',
    units: project.units || 'in',
    metadata: {
      author: project.metadata?.author || 'AgentSam Architect',
      generator: 'AgentSam Deterministic CAD Compiler v1.0',
      createdAt: Date.now(),
    },
    environment: {
      sunAltitude: lighting.sunAltitude,
      sunAzimuth: lighting.sunAzimuth,
      ambientColor: lighting.ambientColor,
      shadows: lighting.shadows,
    },
    operations,
  };
}
