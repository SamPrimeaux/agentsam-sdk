/**
 * Block helpers — scenes compose these; they never own brand URLs.
 */

export {
  createCopyBlock,
  createMediaBlock,
  createActionBlock,
  createCardsBlock,
  createDemoBlock,
  composeCardCollection,
  BLOCK_KINDS,
} from '../contracts/index.js';

/** Resolve whether a block should render (empty collections disappear). */
export function shouldRenderBlock(block) {
  if (!block?.kind) return false;
  if (block.kind === 'cards') return Array.isArray(block.items) && block.items.length > 0;
  if (block.kind === 'copy') {
    return Boolean(block.title || block.body || block.eyebrow || (block.bullets && block.bullets.length));
  }
  if (block.kind === 'action') return Boolean(block.label);
  if (block.kind === 'demo') return Boolean(block.adapter);
  if (block.kind === 'media') return Boolean(block.media?.assetRole || block.media?.ref);
  return true;
}

export function filterRenderableBlocks(blocks = []) {
  return blocks.filter(shouldRenderBlock);
}
