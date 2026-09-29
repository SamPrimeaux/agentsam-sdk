/**
 * Explicit Heuristic Theme sample fixture.
 * Must only load via an intentional seed into a real CmsEditorAdapter —
 * never as an automatic localhost/API fallback.
 */
import { mapCmsEditorBootstrap } from '../../shared/cms/src/map';
import type { CmsEditorSite } from '../../shared/cms/src/editor-types';
import { buildHeuristicThemeRawBootstrap } from './raw-bootstrap';

export const HEURISTIC_THEME_EXAMPLE_ID = 'heuristic-theme';

export type HeuristicThemeFixture = {
  id: typeof HEURISTIC_THEME_EXAMPLE_ID;
  label: string;
  ephemeral: true;
  site: CmsEditorSite;
  themeVars: Record<string, string>;
  schemas: {
    protocol_version: number;
    sections: unknown[];
    blocks: unknown[];
  };
};

export function loadHeuristicThemeFixture(projectSlug = HEURISTIC_THEME_EXAMPLE_ID): HeuristicThemeFixture {
  const raw = buildHeuristicThemeRawBootstrap(projectSlug);
  const mapped = mapCmsEditorBootstrap(raw, projectSlug);
  return {
    id: HEURISTIC_THEME_EXAMPLE_ID,
    label: 'Heuristic Theme (explicit example)',
    ephemeral: true,
    site: mapped.site,
    themeVars: mapped.themeVars,
    schemas: mapped.schemas,
  };
}
