import { MemoryCmsAdapter } from './memory';
import {
  HEURISTIC_THEME_EXAMPLE_ID,
  loadHeuristicThemeFixture,
} from '../../../fixtures/heuristic-theme';

/** Explicit example loader — never auto-wired on localhost. */
export function createHeuristicThemeMemoryAdapter(siteId = HEURISTIC_THEME_EXAMPLE_ID) {
  const fixture = loadHeuristicThemeFixture(siteId);
  return {
    adapter: MemoryCmsAdapter.fromSite(fixture.site),
    siteId: fixture.site.id,
    ephemeral: true as const,
    label: fixture.label,
  };
}
