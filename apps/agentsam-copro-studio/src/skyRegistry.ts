/** Sky looks come from the studio_templates registry; the engine presets (constants.ts) supply their colors. */
import { useEffect, useState } from 'react';
import type { StageSky } from '@inneranimalmedia/copro-ui';
import { SKY_PRESET_MAP } from './samscene/constants.ts';
import { SAMSCENE_SKY_IDS } from './SamSceneSkyBridge';

const SKY_RENDERER = 'threejs.samscene.sky-dome.v1';
const CATALOG_URL = '/api/work/cad/catalog?kind=scene_composition';
const KEY_BY_PRESET = Object.fromEntries(Object.entries(SAMSCENE_SKY_IDS).map(([key, preset]) => [preset, key]));

type CatalogItem = { renderer?: string | null; title?: string; previewUrl?: string | null; specs?: { presetId?: string } };

export function skiesFromCatalog(items: CatalogItem[]): StageSky[] {
  return items.flatMap((item) => {
    const presetId = item.specs?.presetId;
    const preset = presetId && presetId in SKY_PRESET_MAP ? SKY_PRESET_MAP[presetId as keyof typeof SKY_PRESET_MAP] : null;
    if (item.renderer !== SKY_RENDERER || !preset || !presetId) return [];
    const v = preset.config;
    return [{
      id: KEY_BY_PRESET[presetId] ?? presetId,
      name: preset.label,
      note: preset.subtitle,
      top: v.zenithHex,
      bottom: v.horizonHex,
      glow: v.sunHex,
      previewUrl: item.previewUrl || undefined,
    }];
  });
}

/** Registry skies, or undefined until loaded (and if the host cannot answer) so the panel keeps its built-in list. */
export function useRegistrySkies(): StageSky[] | undefined {
  const [skies, setSkies] = useState<StageSky[]>();
  useEffect(() => {
    let live = true;
    fetch(CATALOG_URL, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        const list = skiesFromCatalog(Array.isArray(body?.items) ? body.items : []);
        if (live && list.length) setSkies(list);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return skies;
}
