/** Canonical package product metadata. Site and manifest remain read-only. */
export const THEME = Object.freeze({
  id:'theme.plain-jane',slug:'plain-jane',displayName:'Plain Jane Journal',
  kind:'prebuild',family:'editorial-blog',version:'0.1.0',
  package:'@inneranimalmedia/theme-plain-jane',category:'Editorial / Blog',
  description:'A considered, minimal journal with articles, photography, editorial layouts and an external-CMS component manifest.',
  industries:['Publishing','Creator','Portfolio'],
  pages:['Home','Journal post','About','Photography','Contact','Privacy','Terms'],
  features:['CMS section/block manifest','Dynamic SEO','Editorial cards','Gallery and lightbox'],
  installable:false,portable:true,prebuildRoot:'site',
  capabilityHints:['cms.read-only','cms.section-manifest','theme.site.shell']
});
export function createTheme(){return structuredClone(THEME);}
export default createTheme;
