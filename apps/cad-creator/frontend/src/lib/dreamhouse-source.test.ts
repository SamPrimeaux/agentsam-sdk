import {describe, expect, it, vi} from 'vitest';
import {DREAMHOUSE_DESIGN_URL, loadDreamHouseProject} from './dreamhouse-source';

describe('public DreamHouse example source', () => {
  it('rejects unauthorized BIM access without returning a substitute project', async () => {
    const fetcher = vi.fn().mockResolvedValue({ok:false,status:401});
    await expect(loadDreamHouseProject(fetcher)).rejects.toThrow('public DreamHouse example is unavailable');
    expect(fetcher).toHaveBeenCalledWith(DREAMHOUSE_DESIGN_URL, {credentials:'omit'});
  });
  it('accepts the published public example when its project contract is valid', async () => {
    const source = {id:'dreamhouse-v1-wip',name:'DreamHouse',walls:[{id:'w1'}],rooms:[{id:'r1'}]};
    const fetcher = vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>source});
    await expect(loadDreamHouseProject(fetcher)).resolves.toBe(source);
  });
  it('rejects unrelated fixtures instead of replacing the current canvas', async () => {
    const fetcher = vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({id:'tpl_modern_villa',walls:[],rooms:[]})});
    await expect(loadDreamHouseProject(fetcher)).rejects.toThrow('example contract failed');
  });
  it('reports network failure without fabricating a public project', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(loadDreamHouseProject(fetcher)).rejects.toThrow('Cannot reach the public DreamHouse example');
  });
});
