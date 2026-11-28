// Only trusted host code can bind a workspace grant. A manifest or tool input cannot.
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { workspaceRead, workspaceList, workspaceStat } from '../../capabilities/workspace-files.js';
import { registerAuthorizedTool } from './tools/index.js';

const operations = {
  'workspace.read': [workspaceRead, { path: z.string().min(1) }],
  'workspace.stat': [workspaceStat, { path: z.string().min(1) }],
  'workspace.list': [workspaceList, { path: z.string().optional(), depth: z.number().int().min(1).max(5).optional(), max_entries: z.number().int().min(1).max(300).optional() }],
};

/**
 * The host must resolve account policy, tool allowlist and the current device
 * grant on every call. No root is taken from a model, environment or manifest.
 * This local Node adapter deliberately exposes no mutations or terminal access.
 */
export function registerWorkspaceReadTools(server, { manifest, principal, authorize }) {
  if (typeof authorize !== 'function') throw new Error('mcp_workspace_authority_required');
  for (const [name, [run, schema]] of Object.entries(operations)) {
    if (!manifest.tools.some(tool => tool.name === name)) continue;
    registerAuthorizedTool(server, manifest, principal, name, schema, async input => {
      try {
        if (!principal || principal.kind === 'public') throw new Error('mcp_workspace_access_denied');
        const grant = await authorize({ principal, operation: name, input });
        if (grant?.allowed !== true || typeof grant.root !== 'string' || !grant.root) throw new Error('mcp_workspace_access_denied');
        // Reject intermediate symlinks as well as final symlinks. In particular,
        // an in-root alias cannot expose an ignored credential directory.
        const requested=input.path||'.';
        const relative=path.relative(grant.root,path.resolve(grant.root,requested));
        if(path.isAbsolute(requested)||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('workspace_path_outside_root');
        let cursor=grant.root;
        for(const part of relative.split(path.sep).filter(Boolean)){
          cursor=path.join(cursor,part);
          if(fs.lstatSync(cursor).isSymbolicLink())throw new Error('workspace_symlink_not_allowed');
        }
        const result = run(input, grant.root);
        return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
      } catch {
        return { isError: true, content: [{ type: 'text', text: 'mcp_workspace_access_denied_or_unavailable' }] };
      }
    });
  }
}
