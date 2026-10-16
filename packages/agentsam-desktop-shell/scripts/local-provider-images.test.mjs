import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareLocalChatMessages } from './local-provider-bridge.mjs';

const png = 'data:image/png;base64,' + Buffer.from('png-sample').toString('base64');

test('image requests preserve source bytes as structured OpenAI Responses input', () => {
  const messages = prepareLocalChatMessages([
    { role: 'system', content: 'You are AgentSam.' },
    { role: 'user', content: 'Describe the screenshot.', images: [{ mimeType: 'image/png', dataUrl: png }] },
  ], 'openai');
  assert.equal(messages[0].content, 'You are AgentSam.');
  assert.deepEqual(messages[1], {
    role: 'user', content: [
      { type: 'input_text', text: 'Describe the screenshot.' },
      { type: 'input_image', image_url: png },
    ],
  });
});
test('refuses unsupported multimodal providers instead of dropping image parts', () => {
  assert.throws(() => prepareLocalChatMessages([{ role: 'user', content: 'Screenshot', images: [{ mimeType: 'image/png', dataUrl: png }] }], 'gemini'), /provider_image_input_not_supported/);
});
test('normal text-only turns remain unchanged', () => {
  assert.deepEqual(prepareLocalChatMessages([{ role: 'user', content: 'Hello' }], 'openai'), [{ role: 'user', content: 'Hello' }]);
});
test('rejects untrusted remote image references', () => {
  assert.throws(() => prepareLocalChatMessages([{ role: 'user', content: '', images: [{ mimeType: 'image/png', dataUrl: 'https://private.example/image' }] }], 'openai'), /provider_image_data_invalid/);
});
