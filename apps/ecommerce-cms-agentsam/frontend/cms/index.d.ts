export {
  CmsEditor,
  CmsHubPage,
  CmsDashboard,
  CmsSiteSwitcher,
  createHttpCmsAdapter,
  HttpCmsAdapter,
  useCmsEditor,
  useCmsEditorController,
} from '@inneranimalmedia/client-cms-editor';

export type ThemeEditorCmsAdapter = Record<string, (...args: any[]) => any> & {
  capabilities?: string[];
};

export declare function createCmsThemeEditorAdapter(
  cms: unknown,
  siteId: string,
  options?: {
    resolvePreview?: (siteId: string, page: { id: string; [key: string]: unknown }) => Promise<unknown>;
    uploadMedia?: (files: unknown[]) => Promise<unknown>;
  },
): ThemeEditorCmsAdapter;

export declare class ThemeEditorCapabilityError extends Error {
  capability: string;
  constructor(capability: string);
}

export declare function createThemeEditorBridge(adapter: unknown): ThemeEditorCmsAdapter;
export declare function createThemeProjectAdapter(project: unknown, options?: Record<string, unknown>): ThemeEditorCmsAdapter;
export declare function renderThemePage(...args: any[]): string;
export declare function validateThemeProject(project: unknown): unknown;

export { ECOMMERCE_CMS_CAPABILITIES, assertEcommerceCmsAuthoringContract } from './capabilities.mjs';

export declare const FORM_STUDIO_VERSION: string;
export declare const FORM_STUDIO_KINDS: readonly string[];
export declare function createFormStudioComponent(React: { createElement: (...args: any[]) => any; useState: any; useEffect: any }): any;
export declare function assertFormStudioAdapter(adapter: Record<string, unknown>): Record<string, unknown>;
export declare function normalizeStudioResource(resource: Record<string, unknown>): Record<string, unknown>;
export declare function filterStudioResources(resources: any[], filters?: {kind?:string; status?:string; search?:string}): any[];
