import assert from 'node:assert/strict';
import test from 'node:test';

import {
  listLocalStudioWidgets,
  setLocalStudioWidgetVisible,
} from '../frontend/src/lib/widgets/preferences.ts';

test('Local Studio exposes the donor concept gallery without installing concept widgets', () => {
  const widgets = listLocalStudioWidgets();
  assert.equal(widgets.length, 22);
  assert.equal(new Set(widgets.map((widget) => widget.id)).size, 22);

  const ready = widgets.filter((widget) => widget.availability === 'ready');
  assert.deepEqual(ready.map((widget) => widget.id), ['countdown']);
  assert.equal(ready[0].visible, true);

  const concepts = widgets.filter((widget) => widget.availability === 'demo');
  assert.equal(concepts.length, 21);
  assert.ok(concepts.every((widget) =>
    !widget.visible &&
    !widget.deeplink &&
    widget.preferenceScope === 'Not installed'
  ));
  assert.throws(() => setLocalStudioWidgetVisible('approvals', true), /widget_not_found/);
});
