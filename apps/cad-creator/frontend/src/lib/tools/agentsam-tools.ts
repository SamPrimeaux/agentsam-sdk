import { DesignProject, DesignOperation, ExportFormat, PublisherDestinationId } from '@inneranimalmedia/agentsam-cad-shared';
import { applyDesignOperation } from '@inneranimalmedia/agentsam-cad-shared';
import { validateDesignProject } from '@inneranimalmedia/agentsam-cad-shared';
import { exportProjectToArtifact } from '../exporters';
import { getPublisher } from '../publishers';

export interface ToolExecutionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  logs?: string[];
}

export const AgentSamToolDeclarations = [
  {
    name: 'design_project_get',
    description: 'Retrieve current canonical spatial design state, walls, rooms, and parametric objects.',
    parameters: {},
  },
  {
    name: 'design_project_validate',
    description: 'Validate geometry integrity, watertightness, wall junctions, and room closures.',
    parameters: {},
  },
  {
    name: 'design_apply_operation',
    description: 'Execute a verified DesignOperation (create_wall, create_room, create_parametric_object, move_element).',
    parameters: {
      operation: { type: 'object', description: 'Canonical DesignOperation object' },
    },
  },
  {
    name: 'design_export_artifact',
    description: 'Compile and export spatial project into CAD artifact (STL, DXF, OBJ, SCAD, SVG, JSON).',
    parameters: {
      format: { type: 'string', enum: ['stl', 'dxf', 'obj', 'scad', 'svg', 'json'] },
    },
  },
  {
    name: 'design_publish_project',
    description: 'Publish spatial design project to remote destination (GitHub, Cloudflare R2, Local).',
    parameters: {
      destination: { type: 'string', enum: ['local', 'github', 'cloudflare', 'docker'] },
      commitMessage: { type: 'string' },
    },
  },
];

export async function executeAgentSamTool(
  toolName: string,
  args: Record<string, any>,
  currentProject: DesignProject
): Promise<ToolExecutionResponse> {
  try {
    switch (toolName) {
      case 'design_project_get':
        return { success: true, data: currentProject };

      case 'design_project_validate': {
        const res = validateDesignProject(currentProject);
        return {
          success: res.valid,
          data: { valid: res.valid, errors: res.errors },
        };
      }

      case 'design_apply_operation': {
        const op = args.operation as DesignOperation;
        const res = applyDesignOperation(currentProject, op);
        if (!res.success) {
          return { success: false, error: res.error };
        }
        return { success: true, data: res.project };
      }

      case 'design_export_artifact': {
        const format = (args.format || 'stl') as ExportFormat;
        const artifact = await exportProjectToArtifact(currentProject, format);
        return { success: true, data: artifact };
      }

      case 'design_publish_project': {
        const dest = (args.destination || 'local') as PublisherDestinationId;
        const publisher = getPublisher(dest);
        const artifact = await exportProjectToArtifact(currentProject, 'json');
        const scadArt = await exportProjectToArtifact(currentProject, 'scad');
        const pubResult = await publisher.publishProject(currentProject, [artifact, scadArt], {
          destination: dest,
          commitMessage: args.commitMessage || 'AgentSam tool publish',
        });
        return { success: pubResult.success, data: pubResult };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Tool execution failure' };
  }
}
