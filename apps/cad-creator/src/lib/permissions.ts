import { UserRole, RolePermissions } from '../types';

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  Owner: {
    canEditGeometry: true,
    canUseAIAssistant: true,
    canUploadSketches: true,
    canChangeSettings: true,
    canManageRoles: true,
    canLoadTemplates: true,
    canSaveRevisions: true,
    canExport: true,
    canGenerateMedia: true,
    canEditParametric: true,
  },
  Editor: {
    canEditGeometry: true,
    canUseAIAssistant: true,
    canUploadSketches: true,
    canChangeSettings: true,
    canManageRoles: false,
    canLoadTemplates: true,
    canSaveRevisions: true,
    canExport: true,
    canGenerateMedia: true,
    canEditParametric: true,
  },
  Viewer: {
    canEditGeometry: false,
    canUseAIAssistant: false,
    canUploadSketches: false,
    canChangeSettings: false,
    canManageRoles: false,
    canLoadTemplates: false,
    canSaveRevisions: false,
    canExport: true,
    canGenerateMedia: false,
    canEditParametric: false,
  },
};

export const ROLE_DESCRIPTIONS: Record<UserRole, { label: string; badgeColor: string; description: string }> = {
  Owner: {
    label: 'Owner',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    description: 'Full workspace administration. Can edit all geometry, manage user roles/permissions, load templates, and save cloud revisions.',
  },
  Editor: {
    label: 'Editor',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    description: 'Collaborative author. Can modify CAD/BIM elements, apply AI prompts, add fixtures, and export designs.',
  },
  Viewer: {
    label: 'Viewer',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    description: 'Read-only observer. Can navigate 2D plans and 3D BIM, inspect dimensions, and export files without modifying project data.',
  },
};

export function getPermissions(role: UserRole | string = 'Editor'): RolePermissions {
  if (role === 'Owner') return ROLE_PERMISSIONS.Owner;
  if (role === 'Editor') return ROLE_PERMISSIONS.Editor;
  if (role === 'Viewer') return ROLE_PERMISSIONS.Viewer;
  return ROLE_PERMISSIONS.Viewer;
}
