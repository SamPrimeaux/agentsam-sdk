import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(await readFile(resolve(root,'public/sources/manifest.json'),'utf8'));
const docs={};
for(const board of manifest.boards) {
  if(!/^[a-z0-9-]+$/.test(board.family) || !/^[\w.-]+\.html$/.test(board.filename) && !(board.family==='stock' && /^[a-z0-9-]+\/[\w.-]+\.html$/.test(board.filename)))throw Error('Invalid source path');
  const key=board.family+'/'+board.filename;
  docs[key]=await readFile(resolve(root,'public/sources',key),'utf8');
}
await writeFile(resolve(root,'src/source-documents.generated.json'),JSON.stringify(docs));
console.log('Bundled '+Object.keys(docs).length+' source documents as app-owned data.');
