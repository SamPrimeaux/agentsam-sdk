/** Local showcase catalog from real SDK package manifests — never a tenant install claim. */
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
const PACKAGES=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const SUPPORTED=['resolve','violet','plain-jane'];
export async function listLocalThemeProducts(){
  const entries=await Promise.all(SUPPORTED.map(async slug=>{
    const root=path.join(PACKAGES,'theme-'+slug);
    try{
      const [packageInfo,prebuild]=await Promise.all([
        readFile(path.join(root,'package.json'),'utf8').then(JSON.parse),
        readFile(path.join(root,'prebuild.json'),'utf8').then(JSON.parse)
      ]);
      const category=prebuild.category || ({resolve:'Commerce',violet:'Nonprofit', 'plain-jane':'Editorial / Blog'}[slug]);
      const rootPath=slug==='plain-jane'
        ?path.join(root,'site/index.html')
        :slug==='violet'
          ?path.join(root,'site/index.html')
          :path.resolve(root,'../../apps/theme-gallery-preview/themes/'+slug+'/site/index.html');
      const ready=await stat(rootPath).then(s=>s.isFile()).catch(()=>false);
      const previewZip=path.join(tmpdir(),'agentsam-template-releases','plain-jane-journal-0.1.0-preview.zip');
      const downloadable=slug==='plain-jane' && await stat(previewZip).then(s=>s.isFile()&&s.size>0).catch(()=>false);
      return {
        id:'theme.'+slug,
        sku:'theme-'+slug+'-starter',
        slug,name:slug==='plain-jane'?'Plain Jane Journal':slug[0].toUpperCase()+slug.slice(1),
        category,description:prebuild.description||packageInfo.description,
        package:packageInfo.name,version:packageInfo.version,
        source:slug==='plain-jane'?'SamPrimeaux/inneranimalmedia-blog-template':'SamPrimeaux/agentsam-sdk',
        preview_url:ready?'/themes/'+slug+'/demo/':null,
        editor_url:ready?'/admin/theme-editor?showcase='+encodeURIComponent(slug)+'&slug='+(slug==='plain-jane'?'journal-home':'home'):null,
        cms_manifest_url:slug==='plain-jane'?'/themes/plain-jane/demo/journal-cms-manifest.json':null,
        preview_ready:ready,
        download_url:downloadable?'/api/admin/theme-products/plain-jane/download':null,
        download_kind:downloadable?'preview_zip':null,
        installed:false,purchasable:false,
        state:ready?'local_preview':'source_only',
        install_status:'not_connected',kind:'theme'
      };
    }catch{return null;}
  }));
  return entries.filter(Boolean);
}
