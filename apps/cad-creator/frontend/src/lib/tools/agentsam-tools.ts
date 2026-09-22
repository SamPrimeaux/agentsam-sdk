import { DesignProject, DesignOperation, ExportFormat, PublisherDestinationId } from '@inneranimalmedia/agentsam-cad-shared';
import {CAD_PROJECT_TOOLS} from '../../../../shared/cad/src/domain/project-tools.js';

import { exportProjectToArtifact } from '../exporters';
import { getPublisher } from '../publishers';

export interface ToolExecutionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  logs?: string[];
}

export const AgentSamToolDeclarations = [
  ...CAD_PROJECT_TOOLS.map(t=>({name:t.name,description:t.description,parameters:t.input_schema})),
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
    if(CAD_PROJECT_TOOLS.some(t=>t.name===toolName)){
      const input={...args};
      if(toolName==='design_project_validate'||toolName==='design_project_save')input.project??=currentProject;
      else input.project_id??=currentProject.id;
      const response=await fetch('/api/cad/project/tools/'+toolName,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
      const body=await response.json();
      if(!response.ok||!body.ok)return {success:false,error:body.error||'Project operation failed'};
      return {success:body.result.valid!==false,data:body.result.project??body.result};
    }
    switch (toolName) {
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
