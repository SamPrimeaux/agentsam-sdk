/// <reference types="vite/client" />

declare module '*.css?raw' {
  const content: string;
  export default content;
}

declare module '@inneranimalmedia/agentsam-cms-backend/routing' {
  export function buildCmsHubPath(siteSlug?: string | null, basePath?: string): string;
  export function buildCmsPath(options?: any, basePath?: string): string;
  export function parseCmsRoute(pathname?: string, searchParams?: any, basePath?: string): any;
  export function buildCmsEditorPath(options?: any, basePath?: string): string;
}

