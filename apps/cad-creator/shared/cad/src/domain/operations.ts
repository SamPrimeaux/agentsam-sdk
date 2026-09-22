import { DesignProject, DesignOperation } from '../types';
import { applyProjectOperation } from './project-contract.js';
export interface ApplyOperationResult { project: DesignProject; success: boolean; error?: string; }
export function applyDesignOperation(project: DesignProject, operation: DesignOperation): ApplyOperationResult {
 try { return {success:true,project:applyProjectOperation(project,operation)}; }
 catch(e:any) { return {success:false,project,error:e.message}; }
}
