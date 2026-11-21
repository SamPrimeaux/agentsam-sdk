import test from 'node:test';
import assert from 'node:assert/strict';
import { listEmbeds, validateEmbed, getEmbed } from '../src/index.js';
import { widgetFont, widgetImage, widgetText } from '../src/widget-transport.js';

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
  for (const e of listEmbeds()) for (const k of ['accent', 'background', 'font_color', 'icon_color', 'icon_background']) assert.equal(e.default_config[k] ?? '', '', e.key + '.' + k);
});

test('store chat is templatable: image, icon colors, labels and typography are editable', () => {
  const chat = getEmbed('store_chat');
  const byKey = Object.fromEntries(chat.editor_fields.map((f) => [f.key, f]));
  assert.equal(byKey.image.type, 'image');
  for (const k of ['icon_color', 'icon_background']) assert.equal(byKey[k].theme_token, true, k);
  for (const k of ['header_label', 'greeting', 'placeholder', 'email_label', 'message_label', 'send_label', 'success_message']) assert.equal(byKey[k].type === 'text' || byKey[k].type === 'textarea', true, k);
  assert.deepEqual(byKey.font_family.options, ['inherit', 'system', 'serif', 'rounded', 'mono']);
  assert.ok(byKey.icon.options.includes('image'));
  for (const f of chat.editor_fields) assert.ok(f.group, 'group: ' + f.key);
});

test('widget helpers only accept safe images, bounded text and known fonts', () => {
  assert.equal(widgetImage('/media/logo.png'), '/media/logo.png');
  assert.equal(widgetImage('https://cdn.example.com/a.png'), 'https://cdn.example.com/a.png');
  for (const bad of ['javascript:alert(1)', 'http://example.com/a.png', '//evil.test/a.png', 'data:image/png;base64,AAAA', '', null]) assert.equal(widgetImage(bad), '', String(bad));
  assert.equal(widgetText('  Ask us  ', 'Chat'), 'Ask us');
  assert.equal(widgetText('   ', 'Chat'), 'Chat');
  assert.equal(widgetText('x'.repeat(500), 'Chat', 24).length, 24);
  assert.equal(widgetFont('inherit'), 'inherit');
  assert.match(widgetFont('serif'), /Georgia/);
  assert.match(widgetFont('inherit', false), /system-ui/);
  assert.equal(widgetFont('url(evil)'), 'inherit');
});
