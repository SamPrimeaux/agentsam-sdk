import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  encodeEmbeddingChoice,
  parseEmbeddingChoice,
  looksLikeEmbedModel,
} from '../../src/indexing/ingest/discover-models.js';

describe('ingest model discovery helpers', () => {
  it('encodes/decodes embedding choices without breaking model ids that contain colons', () => {
    const value = encodeEmbeddingChoice('ollama', 'mxbai-embed-large:latest', 1024);
    assert.equal(value, 'ollama|mxbai-embed-large:latest|1024');
    const parsed = parseEmbeddingChoice(value);
    assert.equal(parsed.provider, 'ollama');
    assert.equal(parsed.model, 'mxbai-embed-large:latest');
    assert.equal(parsed.dimensions, 1024);
  });

  it('treats none as disabled embedding', () => {
    const parsed = parseEmbeddingChoice('none');
    assert.equal(parsed.provider, 'none');
    assert.equal(parsed.dimensions, 0);
  });

  it('classifies ollama embed vs chat tags', () => {
    assert.equal(looksLikeEmbedModel('mxbai-embed-large:latest'), true);
    assert.equal(looksLikeEmbedModel('nomic-embed-text'), true);
    assert.equal(looksLikeEmbedModel('qwen2.5-coder:latest'), false);
  });
});
