import {describe, expect, it, vi} from 'vitest';
import {DREAMHOUSE_DESIGN_URL, loadDreamHouseProject} from './dreamhouse-source';

describe('authenticated DreamHouse source', () => {
  it('rejects unauthorized BIM access without returning a substitute project', async () => {
    const fetcher = vi.fn().mockResolvedValue({ok:false,status:401});
    await expect(loadDreamHouseProject(fetcher)).rejects.toThrow('authorized AgentSam CAD session');
    expect(fetcher).toHaveBeenCalledWith(DREAMHOUSE_DESIGN_URL, {credentials:'include'});
  });
  it('accepts verified actual project geometry when access is authorized', async () => {
    const source = {id:'dreamhouse-v1-wip',name:'DreamHouse',walls:[{id:'w1'}],rooms:[{id:'r1'}]};
    const fetcher = vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>source});
    await expect(loadDreamHouseProject(fetcher)).resolves.toBe(source);
  });
  it('rejects unrelated fixtures instead of replacing the working canvas', async () => {
    const fetcher = vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({id:'tpl_modern_villa',walls:[],rooms:[]})});
    await expect(loadDreamHouseProject(fetcher)).rejects.toThrow('contract failed');
  });
  it('reports network failure without fabricating a project', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(loadDreamHouseProject(fetcher)).rejects.toThrow('Cannot reach');
  });
});
