import test from 'node:test';
import assert from 'node:assert/strict';
import {readShellAppearancePreference,resolveShellAppearance,shellAccentForeground,observeShellAppearance} from '../src/appearance.ts';

test('appearance reader rejects malformed preferences and resolves system without a second saved setting',()=>{
 const storage=value=>({getItem:()=>value});
 assert.equal(readShellAppearancePreference(storage('{')),null);
 assert.equal(readShellAppearancePreference(storage(JSON.stringify({theme:'light',accent:'invalid'}))),null);
 const pref=readShellAppearancePreference(storage(JSON.stringify({theme:'system',accent:'#0D9488'})));
 assert.deepEqual(resolveShellAppearance(pref,true),{theme:'light',accent:'#0D9488'});
 assert.deepEqual(resolveShellAppearance(pref,false),{theme:'dark',accent:'#0D9488'});
 assert.equal(resolveShellAppearance({theme:'light',accent:'#2563EB'},false).theme,'light');
});

test('plain application observers follow Settings and system changes and unsubscribe',()=>{
 const oldWindow=globalThis.window;const events=new EventTarget();const media=new EventTarget();media.matches=false;
 let preference={theme:'system',accent:'#2563EB'};
 globalThis.window={localStorage:{getItem:()=>JSON.stringify(preference)},matchMedia:()=>media,addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events)};
 try{const seen=[];const stop=observeShellAppearance(value=>seen.push(value));
 media.matches=true;media.dispatchEvent(new Event('change'));
 preference={theme:'dark',accent:'#BE185D'};events.dispatchEvent(new Event('agentsam:shell-appearance'));
 assert.deepEqual(seen.map(x=>x.theme),['dark','light','dark']);assert.equal(seen.at(-1).accent,'#BE185D');
 stop();events.dispatchEvent(new Event('storage'));assert.equal(seen.length,3);
 }finally{globalThis.window=oldWindow;}
});

test('accent foreground selects the higher contrast black or white',()=>{
 assert.equal(shellAccentForeground('#2563EB'),'#ffffff');
 assert.equal(shellAccentForeground('#0D9488'),'#000000');
 assert.equal(shellAccentForeground('#ffffff'),'#000000');
 assert.equal(shellAccentForeground('#000000'),'#ffffff');
});
