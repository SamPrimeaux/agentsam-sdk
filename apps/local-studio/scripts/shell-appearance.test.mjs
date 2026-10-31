import test from 'node:test';
import assert from 'node:assert/strict';
import { projectStudioShellAppearance, applyStudioShellAppearance } from '../shared/shell-appearance.mjs';

test('CMS roles project identically into navigation and Console chrome', () => {
  const appearance=projectStudioShellAppearance({id:'theme-a',themeFamily:'light',cssVars:{'--bg-canvas':'#fafafa','--bg-nav':'#eeeeee','--text-main':'#111111','--accent':'#117755'}});
  const values=new Map();
  const root={dataset:{},style:{setProperty:(k,v)=>values.set(k,v)}};
  applyStudioShellAppearance(appearance,root);
  assert.equal(root.dataset.theme,'light');
  assert.equal(values.get('--c-bg'),appearance.tokens.canvas);
  assert.equal(values.get('--c-surface-2'),appearance.tokens.sidebar);
  assert.equal(values.get('--c-ink'),appearance.tokens.text);
  assert.equal(values.get('--c-accent'),'#117755');
  assert.equal(values.get('--nav-accent'),'#117755');
  assert.equal(Object.keys(appearance.tokens).length,10,'partial themes still have a complete semantic palette');
});

test('explicit navigation roles take precedence and removing a theme resets its palette', () => {
  const custom=projectStudioShellAppearance({themeFamily:'dark',cssVars:{'--nav-canvas':'#123456','--bg-canvas':'#654321'}});
  assert.equal(custom.tokens.canvas,'#123456');
  const reset=projectStudioShellAppearance(null,{theme:'light',accentColor:'#123456'});
  assert.equal(reset.tokens.canvas,'#fafafa');
  assert.equal(reset.tokens.text,'#202020');
  assert.equal(reset.accentColor,'#123456');
  assert.equal(reset.themeId,null);
});
