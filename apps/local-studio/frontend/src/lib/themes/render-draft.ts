// @ts-ignore Public portable JavaScript theme authoring contract has no bundled TS declaration.
import { renderThemePage } from '@inneranimalmedia/ecommerce-cms-agentsam/theme-editor/project';

/** Renders one saved theme page to a standalone document for read-only previews. */
export function renderDraftPage(page: unknown, tokens: unknown, baseUrl?: string): string {
  const render = renderThemePage as unknown as (page: unknown, tokens: unknown, options: unknown) => string;
  return render(page, tokens, { baseUrl });
}
