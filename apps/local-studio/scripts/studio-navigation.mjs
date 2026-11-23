import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listAppManifests } from '../../../packages/agentsam-desktop-shell/scripts/app-discovery.mjs';

const localStudio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(localStudio, '../..');

// Host route composition only. Product identity and inclusion come from the existing manifests.
const mounts = {
  'local-studio': { href: '/admin/agentsam', icon: 'messageSquare', label: 'AgentSam', aliases: ['/admin/agentsam', '/admin/chats'] },
  'cad-creator': { href: '/admin/cad', icon: 'box', label: 'CAD Creator', aliases: ['/admin/cad'] },
  // MovieMode is Apps-only. Never alias /media — Media Library owns that tree.
  'moviemode': { href: '/admin/moviemode', icon: 'film', label: 'MovieMode', aliases: [] },
  'samsketch': { href: '/admin/samsketch', icon: 'layers', label: 'SamSketch', aliases: [] },
  // SamSculpt is Creative Department Batch 1+. Include only when apps/samsculpt (or packaged
  // agentsam-3d-studio) is listed in included_apps — mount stays dormant until then.
  'samsculpt': { href: '/samsculpt', icon: 'box', label: 'SamSculpt', aliases: [] },
};

/** Rebuildable navigation projection; included_apps and APP manifests remain authoritative. */
export function studioNavigationProjection({ repoRoot = root, manifestPath = path.join(repoRoot, 'packages/agentsam-desktop-shell/manifests/local-studio.json') } = {}) {
  const host = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const apps = new Map(listAppManifests(repoRoot).map((app) => [app.id, app]));
  const ids = [...new Set([host.app_id, ...(host.included_apps || [])])];
  const commerce = ids.includes('ecommerce-cms-agentsam');
  const growthPath = path.join(repoRoot, 'apps/ecommerce-cms-agentsam/apps/growth/agentsam.package.json');
  let growthNav = null;
  if (commerce) {
    const growth = JSON.parse(readFileSync(growthPath, 'utf8'));
    if (growth.status === 'bundled' && growth.role === 'embedded-app') {
      growthNav = {
        id: growth.id,
        name: growth.name,
        label: growth.navigation.label,
        href: growth.routes[0],
        icon: 'growth',
        aliases: [],
        provenance: 'ecommerce-bundled-manifest',
      };
      // Growth is an Audience module, not an independent installed APP.
    }

  }
  return {
    primary: [
      {id:'home',label:'Home',href:'/admin/home',icon:'home'},
      {id:'media',label:'Library',href:'/admin/media',icon:'library',children:[
        {id:'images',label:'Images',href:'/admin/media/images'},
        {id:'videos',label:'Videos',href:'/admin/media/videos'},
        {id:'models',label:'Models',href:'/admin/media/models'},
        {id:'files',label:'All files',href:'/admin/media/files'},
      ]},
      {id:'analytics',label:'Analytics',href:'/admin/analytics/overview',icon:'analytics',children:[
        {id:'finance',label:'Finance',href:'/admin/analytics/finance'},
        {id:'health',label:'Health',href:'/admin/analytics/health'},
      ]},
      {id:'tickets',label:'Tickets',href:'/admin/tickets',icon:'tickets'},
    ],
    channels: commerce ? [
      {id:'online-store',label:'Online Store',href:'/admin/store',icon:'store',children:[
        {id:'pages',label:'Pages',href:'/admin/pages'},
        {id:'theme-editor',label:'Theme Editor',href:'/admin/theme-editor'},
        {id:'preferences',label:'Preferences',href:'/admin/preferences'},
      ]},
      {id:'products',label:'Products',href:'/admin/products',icon:'products',children:[
        {id:'collections',label:'Collections',href:'/admin/collections'},
        {id:'create',label:'Create',href:'/admin/products/create'},
        {id:'inventory',label:'Inventory',href:'/admin/inventory'},
        {id:'orders',label:'Orders',href:'/admin/orders'},
        {id:'discounts',label:'Discounts',href:'/admin/discounts'},
      ]},
      {id:'audience',label:'Audience',href:'/admin/subscribers',icon:'customers',children: growthNav ? [
        {id:'growth',label:'Growth',href:growthNav.href},
      ] : []},
    ] : [],
    // Settings owns Documentation at /admin/settings/docs. Artwork Help redirects there.
    utilities: [],
    schema: 'agentsam.host-navigation.v1',
    hostAppId: host.app_id,
    source: 'included_apps',
    apps: [...ids.flatMap((id) => {
      const app = apps.get(id);
      if (!app) throw new Error('Included application has no manifest: ' + id);
      const mount = mounts[id];
      // An included build is not automatically a mounted navigation destination.
      if (!mount) return [];
      return [{ id: app.id, name: app.name, package: app.manifest.package, version: app.manifest.version, ...mount }];
    })],
  };
}

export function writeStudioNavigation(options = {}) {
  const projection = studioNavigationProjection(options);
  const target = path.join(options.localStudio || localStudio, 'frontend/public/admin/data/navigation.json');
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(projection, null, 2) + '\n');
  return projection;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = writeStudioNavigation();
  console.log('Projected ' + result.apps.length + ' configured applications from ' + result.source);
}
