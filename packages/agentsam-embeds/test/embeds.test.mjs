import test from 'node:test';
import assert from 'node:assert/strict';
import { listEmbeds, validateEmbed, getEmbed } from '../src/index.js';

test('every packaged embed is installable and its editor fields have defaults', () => {
  const all = listEmbeds();
  assert.deepEqual(all.map((e) => e.key), ['form_inline', 'form_popup', 'store_chat', 'grow_capture']);
  for (const e of all) assert.deepEqual(validateEmbed(e), [], e.key);
});

test('store chat exposes the left-panel fields', () => {
  const keys = getEmbed('store_chat').editor_fields.map((f) => f.key);
  for (const k of ['greeting', 'show_featured_products', 'accent', 'style', 'icon', 'label', 'horizontal_position', 'vertical_position', 'font_size', 'border_radius']) assert.ok(keys.includes(k), k);
});

test('no baked-in color presets', () => {
  for (const e of listEmbeds()) for (const k of ['accent', 'background', 'font_color']) assert.equal(e.default_config[k], '', e.key + '.' + k);
});
