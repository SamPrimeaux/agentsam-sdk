import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { inspectMediaEnvironment, MEDIA_SELECTION_PATH } from '../sam/media/environment.js';

const VALID = ['local','r2','r2_d1'];
export async function runSamMedia(argv=[],{
  root=process.cwd(),write=s=>process.stdout.write(s),
  input=process.stdin,output=process.stdout,connected={},
  inspect=inspectMediaEnvironment,
}={}) {
  const json=argv.includes('--json'),args=argv.filter(x=>x!=='--json');
  const sub=args[0]||'doctor';
  const report=inspect({root,connected});
  if (sub==='doctor' || sub==='inspect') {
    if (json) write(JSON.stringify({ok:true,...report},null,2)+'\n');
    else {
      write('SAM media · '+report.root+'\n');
      for (const lane of report.storage) write('  '+lane.kind.padEnd(8)+' '+lane.status+
        (lane.requires.length?' · needs '+lane.requires.join(', '):'')+'\n');
      write('  Current selection: '+(report.selected||'none (local SDK defaults remain usable)')+'\n');
      write('  Raster: '+Object.entries(report.packages).filter(([,v])=>v.installed)
        .map(([name])=>name).join(', ').concat('\n'));
      write('  Tools: '+Object.entries(report.tools).filter(([,v])=>v.installed)
        .map(([name])=>name).join(', ').concat('\n'));
      write('  Config is not proof of remote storage access; no credentials or provider calls inspected.\n');
    }
    return {ok:true,...report};
  }
  if (sub==='help' || sub==='--help' || sub==='-h') {
    const help='agentsam sam media doctor [--json] | setup [--storage local|r2|r2_d1] [--yes] [--json]';
    write(help+'\n');return {ok:true,help};
  }
  if (sub!=='setup') return {ok:false,error:'unknown_sam_media_command'};
  const specified=args.indexOf('--storage');
  let kind=specified>=0?args[specified+1]:null;
  const yes=args.includes('--yes');
  let rl=null;
  try {
    if (!kind) {
      if (!input.isTTY || !output.isTTY) {
        return {ok:false,error:'interactive_selection_required',
          guidance:'Specify --storage and --yes for non-interactive setup.'};
      }
      rl=readline.createInterface({input,output});
      write('Available media storage:\n');
      report.storage.forEach((lane,i)=>write('  '+(i+1)+'. '+lane.kind+' ('+lane.status+')\n'));
      const answer=(await rl.question('Choose storage [1-3, blank cancels]: ')).trim();
      kind=report.storage[Number(answer)-1]?.kind||null;
      if (!kind) return {ok:false,error:'media_setup_cancelled'};
    }
    if (!VALID.includes(kind)) return {ok:false,error:'unknown_storage_lane'};
    const lane=report.storage.find(x=>x.kind===kind);
    if (lane.status!=='available' && lane.status!=='adapter_connected') {
      return {ok:false,error:'storage_adapter_not_connected',kind,
        required:lane.requires,
        guidance:'Configuration was discovered, but the host must inject an authorized adapter before activation.'};
    }
    if (!yes) {
      if (!input.isTTY || !output.isTTY) {
        return {ok:false,error:'media_setup_confirmation_required',
          guidance:'Use --yes only after reviewing the selected storage lane.'};
      }
      rl ||= readline.createInterface({input,output});
      const answer=(await rl.question('Use '+kind+' for this project? [y/N]: ')).trim().toLowerCase();
      if (!['y','yes'].includes(answer)) return {ok:false,error:'media_setup_cancelled'};
    }
    const file=path.join(path.resolve(root),MEDIA_SELECTION_PATH);
    await mkdir(path.dirname(file),{recursive:true});
    await writeFile(file,JSON.stringify({
      schema:'agentsam.media.storage.v1',kind,selected_at:new Date().toISOString(),
    },null,2)+'\n',{mode:0o600});
    const result={ok:true,selected:kind,config:MEDIA_SELECTION_PATH,
      note:'Selection saved. Runtime authorization remains mandatory for writes.'};
    write(json?JSON.stringify(result,null,2)+'\n':'SAM media: '+kind+' selected for this project.\n');
    return result;
  } finally {rl?.close();}
}
