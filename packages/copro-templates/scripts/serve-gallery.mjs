import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url))),port=Number(process.env.COPRO_GALLERY_PORT||4317);
const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png'};
createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.writeHead(302,{Location:'/packages/copro-templates/preview/'});res.end();return;}const path=resolve(root,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(root+sep)&&path!==root)throw new Error('outside_root');const s=await stat(path);const file=s.isDirectory()?resolve(path,'index.html'):path;res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(await readFile(file));}catch{res.writeHead(404);res.end('Not found');}}).listen(port,'127.0.0.1',()=>console.log(`CoPro gallery: http://127.0.0.1:${port}/packages/copro-templates/preview/`));
