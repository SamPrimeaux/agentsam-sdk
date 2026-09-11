import { DesignProject, DesignOperation } from '../types';
import { validateDesignOperation } from './validation';

export interface ApplyOperationResult {
  project: DesignProject;
  success: boolean;
  error?: string;
}

export function applyDesignOperation(
  project: DesignProject,
  operation: DesignOperation
): ApplyOperationResult {
  const validation = validateDesignOperation(operation);
  if (!validation.valid) {
    return {
      project,
      success: false,
      error: `Invalid operation: ${validation.errors.join(', ')}`,
    };
  }

  const now = Date.now();
  const nextVersion = (project.version || 1) + 1;

  try {
    switch (operation.type) {
      case 'create_wall': {
        const wall = operation.wall;
        return {
          project: {
            ...project,
            walls: [...project.walls, wall],
            updatedAt: now,
            version: nextVersion,
          },
          success: true,
        };
      }

      case 'update_wall': {
        const walls = project.walls.map((w) =>
          w.id === operation.wallId ? { ...w, ...operation.updates } : w
        );
        return {
          project: {
            ...project,
            walls,
            updatedAt: now,
            version: nextVersion,
          },
          success: true,
        };
      }

      case 'delete_wall': {
        const walls = project.walls.filter((w) => w.id !== operation.wallId);
        // Also cascade delete doors and windows hosted on this wall
        const doors = project.doors.filter((d) => d.wallId !== operation.wallId);
        const windows = project.windows.filter((w) => w.wallId !== operation.wallId);
        return {
          project: {
            ...project,
            walls,
            doors,
            windows,
            updatedAt: now,
            version: nextVersion,
          },
          success: true,
        };
      }

      case 'create_room': {
        return {
          project: {
            ...project,
            rooms: [...project.rooms, operation.room],
            updatedAt: now,
            version: nextVersion,
          },
          success: true,
        };
      }

      case 'update_room': {
        const rooms = project.rooms.map((r) =>
          r.id === operation.roomId ? { ...r, ...operation.updates } : r
        );
        return {
          project: {
            ...project,
            rooms,
            updatedAt: now,
            version: nextVersion,
          },
          success: true,
        };
      }

      case 'delete_room': {
        return {
          project: {
            ...project,
            rooms: project.rooms.filter((r) => r.id !== operation.roomId),
            updatedAt: now,
            version: nextVersion,
          },
          success: true,
        };
      }

      case 'add_door': {
        return {
          project: {
            ...project,
            doors: [...project.doors, operation.door],
            updatedAt: now,
            version: nextVersion,
          },
          success: true,
        };
      }

      case 'update_door': {
        const doors = project.doors.map((d) =>
          d.id === operation.doorId ? { ...d, ...operation.updates } : d
        );
        return {
          project: {
            ...project,
            doors,
            updatedAt: now,
            version: nextVersion,
          },
          success: true,
        };
      }

      case 'delete_door': {
        return {
          project: {
            ...project,
            doors: project.doors.filter((d) => d.id !== operation.doorId),
            updatedAt: now,
            version: nextVersion,
          },
          success: true,
        };
      }

      case 'add_window': {
        return {
          project: {
            ...project,
            windows: [...project.windows, operation.window],
            updatedAt: now,
            version: nextVersion,
          },
          success: true,
        };
      }

      case 'update_window': {
        const windows = project.windows.map((w) =>
          w.id === operation.windowId ? { ...w, ...operation.updates } : w
        );
        return {
          project: {
            ...project,
            windows,
            updatedAt: now,
            version: nextVersion,
          },
          success: true,
        };
      }

      case 'delete_window': {
        return {
          project: {
            ...project,
            windows: project.windows.filter((w) => w.id !== operation.windowId),
            updatedAt: now,
            version: nextVersion,
          },
          success: true,
        };
      }

      case 'add_fixture': {
        return {
          project: {
            ...project,
            furniture: [...project.furniture, operation.fixture],
            updatedAt: now,
            version: nextVersion,
          },
          success: true,
        };
      }

      case 'update_fixture': {
        const furniture = project.furniture.map((f) =>
          f.id === operation.fixtureId ? { ...f, ...operation.updates } : f
        );
        return {
          project: {
            ...project,
            furniture,
            updatedAt: now,
            version: nextVersion,
          },
          success: true,
        };
      }

      case 'delete_fixture': {
        return {
          project: {
            ...project,
            furniture: project.furniture.filter((f) => f.id !== operation.fixtureId),
            updatedAt: now,
            version: nextVersion,
          },
          success: true,
        };
      }

      case 'move_element': {
        const { elementType, elementId, dx, dy, dz } = operation;
        if (elementType === 'wall') {
          const walls = project.walls.map((w) =>
            w.id === elementId ? { ...w, x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy } : w
          );
          return { project: { ...project, walls, updatedAt: now, version: nextVersion }, success: true };
        } else if (elementType === 'furniture') {
          const furniture = project.furniture.map((f) =>
            f.id === elementId ? { ...f, x: f.x + dx, y: f.y + dy } : f
          );
          return { project: { ...project, furniture, updatedAt: now, version: nextVersion }, success: true };
        } else if (elementType === 'room') {
          const rooms = project.rooms.map((r) =>
            r.id === elementId
              ? {
                  ...r,
                  points: r.points.map((p) => [p[0] + dx, p[1] + dy] as [number, number]),
                }
              : r
          );
          return { project: { ...project, rooms, updatedAt: now, version: nextVersion }, success: true };
        } else if (elementType === 'parametric') {
          const parametricObjects = (project.parametricObjects || []).map((p) =>
            p.id === elementId
              ? {
                  ...p,
                  transform: {
                    ...p.transform,
                    x: p.transform.x + dx,
                    y: p.transform.y + dy,
                    z: p.transform.z + (dz || 0),
                  },
                }
              : p
          );
          return { project: { ...project, parametricObjects, updatedAt: now, version: nextVersion }, success: true };
        }
        return { project, success: true };
      }

      case 'create_parametric_object': {
        const existing = project.parametricObjects || [];
        return {
          project: {
            ...project,
            parametricObjects: [...existing, operation.parametricObject],
            updatedAt: now,
            version: nextVersion,
          },
          success: true,
        };
      }

      case 'update_parametric_parameter': {
        const existing = project.parametricObjects || [];
        const parametricObjects = existing.map((p) => {
          if (p.id === operation.parametricObjectId) {
            return {
              ...p,
              parameters: {
                ...p.parameters,
                [operation.parameterName]: operation.value,
              },
              updatedAt: now,
            };
          }
          return p;
        });
        return {
          project: {
            ...project,
            parametricObjects,
            updatedAt: now,
            version: nextVersion,
          },
          success: true,
        };
      }

      case 'update_parametric_source': {
        const existing = project.parametricObjects || [];
        const parametricObjects = existing.map((p) =>
          p.id === operation.parametricObjectId
            ? { ...p, source: operation.source, updatedAt: now }
            : p
        );
        return {
          project: {
            ...project,
            parametricObjects,
            updatedAt: now,
            version: nextVersion,
          },
          success: true,
        };
      }

      case 'delete_parametric_object': {
        const existing = project.parametricObjects || [];
        return {
          project: {
            ...project,
            parametricObjects: existing.filter((p) => p.id !== operation.parametricObjectId),
            updatedAt: now,
            version: nextVersion,
          },
          success: true,
        };
      }

      case 'attach_sketch': {
        return {
          project: {
            ...project,
            sketchDocument: operation.sketchDocument,
            updatedAt: now,
            version: nextVersion,
          },
          success: true,
        };
      }

      case 'convert_sketch_selection': {
        // Execute the proposed sub-operations atomically
        let currentProj = { ...project };
        for (const subOp of operation.proposedOperations) {
          const res = applyDesignOperation(currentProj, subOp);
          if (res.success) {
            currentProj = res.project;
          }
        }
        return {
          project: {
            ...currentProj,
            updatedAt: now,
            version: nextVersion,
          },
          success: true,
        };
      }

      case 'set_lighting': {
        return {
          project: {
            ...project,
            lighting: {
              ...project.lighting,
              ...operation.lighting,
            },
            updatedAt: now,
            version: nextVersion,
          },
          success: true,
        };
      }

      case 'batch_operations': {
        let currentProj = { ...project };
        for (const subOp of operation.operations) {
          const res = applyDesignOperation(currentProj, subOp);
          if (res.success) {
            currentProj = res.project;
          } else {
            return res;
          }
        }
        return {
          project: {
            ...currentProj,
            updatedAt: now,
            version: nextVersion,
          },
          success: true,
        };
      }

      default:
        return { project, success: false, error: `Unhandled operation type` };
    }
  } catch (err: any) {
    return { project, success: false, error: err.message || 'Operation failed' };
  }
}
