/**
 * Site-first starter provisioning. Reuse the production theme installer and
 * its D1 + immutable R2 revisions. Every theme can supply the same preset
 * contract; the platform default merely selects one packaged preset.
 */
import { heuristicStarterPreset } from '@inneranimalmedia/theme-heuristic/commerce/starter';
import { materializeStarterProject } from '../../frontend/theme-editor/starter-project.mjs';
import { listThemeProjects, installThemeDraft } from './theme-project-store.mjs';
import { resolveCmsSite } from './site-context.mjs';

export async function ensureCmsSiteStarter(env, accountId, siteId, {
  preset = heuristicStarterPreset,
} = {}) {
  if (!accountId || !siteId) return {ok:false,status:400,error:'cms_site_required'};
  if (!env?.DB || !env?.WEBSITE_ASSETS) return {ok:false,status:503,error:'cms_starter_storage_unavailable'};
  let site;
  try { site = await resolveCmsSite(env.DB,{accountId,siteId}); }
  catch {return {ok:false,status:404,error:'site_not_found_or_unauthorized'};}

  // Any existing site-owned project is a legitimate installed starting point.
  // This is not a migration: never replace somebody's selected theme or edits.
  const existing = await listThemeProjects(env,accountId,site.id);
  if (!existing.ok) return existing;
  if (existing.projects.length) return {
    ok:true,unchanged:true,site_id:site.id,projects:existing.projects,
    editor_url:'/admin/theme-project-editor?project='+
      encodeURIComponent(existing.projects[0].id)+'&site_id='+encodeURIComponent(site.id),
  };

  const project = materializeStarterProject(preset,site);
  const installed = await installThemeDraft(env,accountId,preset.theme.slug,{
    project,package_name:preset.theme.packageName,
    package_version:preset.theme.packageVersion,
  },site.id);
  if (!installed.ok) return installed;
  return {
    ok:true,unchanged:installed.unchanged===true,site_id:site.id,
    projects:[installed.project],
    editor_url:'/admin/theme-project-editor?project='+
      encodeURIComponent(installed.project.id)+'&site_id='+encodeURIComponent(site.id),
  };
}
