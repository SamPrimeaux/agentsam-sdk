import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";

// Local WIP integration only. This exposes discovered source files from the sibling
// SamScene checkout without copying source libraries into the MovieMode package.
const localSamSceneRoot = fileURLToPath(new URL('../../../samscenev2/', import.meta.url));
const localSourceFolders = [
  {id:'models',folder:join(localSamSceneRoot,'public/models'),kind:'scene'},
  {id:'sky-media',folder:join(localSamSceneRoot,'.data/dev-preview'),kind:'video'},
  {id:'sky-reference',folder:join(localSamSceneRoot,'public/assets/aistudio'),kind:'video'},
] as const;
const localMime = (filename:string) => ({'.glb':'model/gltf-binary','.mp4':'video/mp4','.mov':'video/quicktime','.webm':'video/webm'}[extname(filename).toLowerCase()] || 'application/octet-stream');
function localSamSceneSources() {
  return localSourceFolders.flatMap(group => !existsSync(group.folder) ? [] : readdirSync(group.folder)
    .filter(name=>/^[-_ .()a-zA-Z0-9]+$/.test(name) && (group.kind==='scene'?name.toLowerCase().endsWith('.glb'):/\.(mp4|mov|webm)$/i.test(name)))
    .map(name=>({id:group.id+'/'+name,name,kind:group.kind,source:group.id,
      sizeBytes:statSync(join(group.folder,name)).size,
      url:'/api/local-samscene/file/'+group.id+'/'+encodeURIComponent(name)})));
}

const repoUi = fileURLToPath(new URL("../../packages/copro-ui/src/index.ts", import.meta.url));
const repoStyles = fileURLToPath(new URL("../../packages/copro-ui/styles/copro.css", import.meta.url));
const repoStorage = fileURLToPath(new URL("../../packages/copro-storage/src/index.js", import.meta.url));
const repoEditor = fileURLToPath(new URL("../../packages/copro-editor/src/index.js", import.meta.url));
const repoMedia = fileURLToPath(new URL("../../packages/copro-media/src/index.js", import.meta.url));

/**
 * This is the LOCAL development and build resolution, not a localhost runtime
 * dependency. Always consume the current worktree instead of stale installed SDK
 * package copies or an old dist emitted before the last editing pass.
 */
export default defineConfig({
  plugins: [
    react(),
    {
      name:'local-samscene-source-library',
      apply:'serve',
      configureServer(server) {
        server.middlewares.use((req,res,next)=>{
          const url=new URL(req.url || '/', 'http://localhost');
          if (url.pathname === '/primetech-onboarding' || url.pathname === '/primetech-onboarding/') {
            res.statusCode = 302;
            res.setHeader('Location', '/primetech-onboarding/index.html' + url.search + url.hash);
            res.end();
            return;
          }
          if (url.pathname==='/api/local-samscene/sources') {
            res.setHeader('Content-Type','application/json; charset=utf-8');
            res.setHeader('Cache-Control','no-store');
            res.end(JSON.stringify({items:localSamSceneSources()}));
            return;
          }
          if (!url.pathname.startsWith('/api/local-samscene/file/')) {
            if(url.pathname.startsWith('/api/local-samscene/')) {res.statusCode=404;res.end('Local source not found');return;}
            return next();
          }
          const rest=url.pathname.slice('/api/local-samscene/file/'.length);
          const folderId=rest.split('/')[0];
          const filename=decodeURIComponent(rest.slice(folderId.length+1));
          const folder=localSourceFolders.find(candidate=>candidate.id===folderId);
          // Exact allowlisted basename: no arbitrary local file reads.
          if (!folder || !/^[\w .()\-]+$/.test(filename) || basename(filename)!==filename ||
            !localSamSceneSources().some(item=>item.id===folderId+'/'+filename)) {
            res.statusCode=404;res.end('Media not found');return;
          }
          const file=join(folder.folder,filename);
          const size=statSync(file).size;
          const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
          const start=range?Number(range[1]):0;
          const end=range&&range[2]?Number(range[2]):size-1;
          if(start>=size || end>=size || end<start) {res.statusCode=416;res.end();return;}
          res.statusCode=range?206:200;
          res.setHeader('Content-Type',localMime(filename));
          res.setHeader('Content-Length',end-start+1);
          res.setHeader('Accept-Ranges','bytes');
          if(range)res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`);
          if(req.method==='HEAD'){res.end();return;}
          createReadStream(file,{start,end}).pipe(res);
        });
      },
    },
    {
      name: "portable-copro-source-paths",
      apply: "build",
      enforce: "post",
      renderChunk(code) {
        const root = fileURLToPath(
          new URL("../../", import.meta.url)
        ).replaceAll("\\", "/");
        return code.includes(root)
          ? { code: code.replaceAll(root, "sdk:///"), map: null }
          : null;
      },
    },
  ],
  resolve: {
    // CoPro source lives outside the app root. Use one React singleton for hooks and the renderer.
    dedupe: ["react", "react-dom", "react/jsx-runtime", "three"],
    alias: [
      {find:/^@inneranimalmedia\/copro-ui\/styles\.css$/, replacement:repoStyles},
      {find:/^@inneranimalmedia\/copro-ui$/,replacement:repoUi},
      {find:/^@inneranimalmedia\/copro-storage$/,replacement:repoStorage},
      {find:/^@inneranimalmedia\/copro-editor$/,replacement:repoEditor},
      {find:/^@inneranimalmedia\/copro-media$/,replacement:repoMedia},
    ],
  },
  optimizeDeps: { exclude:["@inneranimalmedia/copro-ui","@inneranimalmedia/copro-storage","@inneranimalmedia/copro-editor","@inneranimalmedia/copro-media"] },
  // The active cms_themes registry is served by local-studio (its dev port); standalone CoPro reads it, never owns it.
  server: { fs:{allow:[fileURLToPath(new URL('../../',import.meta.url)),localSamSceneRoot]}, watch:{usePolling:true,interval:400},
    proxy:{'/api/studio':{target:'http://127.0.0.1:8080',changeOrigin:true}} },
  build: { target:"esnext" },
});
