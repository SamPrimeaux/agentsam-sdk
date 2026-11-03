import { MemoryCmsAdapter } from './memory';
import { installStarterPack } from '../../../shared/cms/src/starter-pack';
import {
  HEURISTIC_STARTER_PACK_ID,
  heuristicStarterPack,
} from '../../../starter-packs/heuristic';

/**
 * Preview helper: install Heuristic into an in-memory adapter.
 * The pack is a real starter; the adapter choice is what makes this temporary.
 * Prefer installStarterPack(sqliteOrHttpAdapter, heuristicStarterPack) for durable first-run.
 */
export async function previewHeuristicStarter(siteId = HEURISTIC_STARTER_PACK_ID) {
  const adapter = MemoryCmsAdapter.createEmpty();
  const installed = await installStarterPack(adapter, heuristicStarterPack, { siteId });
  return {
    adapter,
    siteId: installed.siteId,
    pageId: installed.pageIds[0] || null,
    pack: heuristicStarterPack,
    /** Adapter is temporary — pack provenance remains builtin_starter. */
    adapterTemporary: true as const,
  };
}

/** @deprecated Use previewHeuristicStarter / installStarterPack(heuristicStarterPack). */
export async function createHeuristicThemeMemoryAdapter(siteId = HEURISTIC_STARTER_PACK_ID) {
  return previewHeuristicStarter(siteId);
}
