// Deterministic creative sampling. No playback clock or animation-engine dependency.
export const MOTION_SCHEMA = 'copro.motion.v1';
export const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
export const cubicOut = p => 1 - (1 - clamp(p)) ** 3;
export function integerUs(value, name = 'timeUs', positive = false) {
  if (!Number.isSafeInteger(value) || (positive && value <= 0)) throw new RangeError(`copro_${name}_invalid`);
  return value;
}
export function frameToUs(frame, frameRate = 30) {
  if (!Number.isSafeInteger(frame) || frame < 0) throw new RangeError('copro_frame_invalid');
  const numerator = typeof frameRate === 'number' ? frameRate : frameRate?.numerator;
  const denominator = typeof frameRate === 'number' ? 1 : frameRate?.denominator;
  if (!Number.isSafeInteger(numerator) || numerator <= 0 || !Number.isSafeInteger(denominator) || denominator <= 0) throw new RangeError('copro_frame_rate_rational_required');
  const result = (BigInt(frame) * 1000000n * BigInt(denominator) + BigInt(numerator) / 2n) / BigInt(numerator);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('copro_time_overflow');
  return Number(result);
}
const families = ['fade', 'rise', 'slide-left', 'slide-right', 'zoom', 'spin', 'blur', 'spring', 'bounce', 'shake', 'flip', 'wipe'];
export const ANIMATIONS = Object.freeze(families.flatMap(family => ['in', 'out', 'combo'].map(mode => Object.freeze({
  id: `${family}-${mode}`, name: `${family.replaceAll('-', ' ')} · ${mode}`, family, mode,
  durationUs: mode === 'combo' ? 2400000 : 800000, schema: MOTION_SCHEMA,
  provenance: family === 'blur' ? 'degueba/onda' : 'original',
}))));
export function sampleAnimation(id, timeUs, {durationUs, delayUs = 0, amplitude = 80} = {}) {
  const def = ANIMATIONS.find(x => x.id === id);
  if (!def) throw new Error('copro_animation_unknown');
  integerUs(timeUs); integerUs(delayUs, 'delayUs');
  durationUs ??= def.durationUs; integerUs(durationUs, 'durationUs', true);
  if (!Number.isFinite(amplitude) || Math.abs(amplitude) > 10000) throw new RangeError('copro_amplitude_invalid');
  const raw = clamp((timeUs - delayUs) / durationUs);
  const p = def.mode === 'out' ? 1 - raw : def.mode === 'combo' ? raw < .3 ? raw / .3 : raw > .7 ? (1 - raw) / .3 : 1 : raw;
  const e = cubicOut(p), k = 1 - e;
  const s = {x: 0, y: 0, scale: 1, rotation: 0, opacity: e, blur: 0, clipInset: 0, scaleX: 1};
  switch (def.family) {
    case 'rise': s.y = amplitude * k; break;
    case 'slide-left': s.x = -amplitude * k; break;
    case 'slide-right': s.x = amplitude * k; break;
    case 'zoom': s.scale = .45 + .55 * e; break;
    case 'spin': s.rotation = -100 * k; s.scale = .65 + .35 * e; break;
    // Onda BlurReveal: coupled fade, ten-pixel blur and sixteen-pixel rise.
    case 'blur': s.blur = 10 * k; s.y = 16 * k; break;
    case 'spring': s.scale = p === 0 ? 0 : p === 1 ? 1 : 1 - Math.exp(-7 * p) * Math.cos(12 * p); break;
    case 'bounce': s.y = -amplitude * Math.abs(Math.sin((1 - p) * Math.PI * 2.5)) * (1 - p); break;
    case 'shake': s.x = amplitude * .22 * Math.sin(p * Math.PI * 10) * (1 - p); break;
    case 'flip': s.scaleX = Math.cos((1 - e) * Math.PI / 2); break;
    case 'wipe': s.clipInset = 1 - e; s.opacity = 1; break;
  }
  return s;
}

/** Adapted from remotion-bits TypeWriter event scheduling. Frames/hooks removed;
 * graphemes, binary-search scrubbing and explicit microsecond events added.
 * Source declaration: MIT in upstream package.json. See THIRD_PARTY_NOTICES.md. */
export function createTypewriterEvents(texts, {typeUs = 60000, deleteUs = 35000, holdUs = 500000, gapUs = 150000, loop = false} = {}) {
  for (const [k,v] of Object.entries({typeUs, deleteUs})) integerUs(v,k,true);
  for (const [k,v] of Object.entries({holdUs,gapUs})) { integerUs(v,k); if(v<0) throw new RangeError('copro_timing_negative'); }
  texts = Array.isArray(texts) ? texts : [texts];
  if (!texts.length || texts.length > 100 || texts.some(s => typeof s !== 'string' || s.length > 10000)) throw new TypeError('copro_typewriter_text_invalid');
  const segment = s => Array.from(new Intl.Segmenter('en', {granularity:'grapheme'}).segment(s), x=>x.segment);
  const events = [{timeUs: 0, text: ''}]; let t = 0;
  texts.forEach((text,index) => {
    const chars = segment(text); let visible = '';
    chars.forEach(char => { t += typeUs; visible += char; events.push({timeUs:t,text:visible}); });
    t += holdUs; events.push({timeUs:t,text:visible});
    if (index < texts.length - 1 || loop) {
      while(chars.length) { chars.pop(); t += deleteUs; events.push({timeUs:t,text:chars.join('')}); }
      t += gapUs; events.push({timeUs:t,text:''});
    }
  });
  integerUs(t, 'durationUs');
  return {events, durationUs:t, loop};
}
export function sampleTypewriter(sequence, timeUs, {blinkUs=800000} = {}) {
  integerUs(timeUs); integerUs(blinkUs, 'blinkUs', true);
  const t = timeUs >= 0 && sequence.loop && sequence.durationUs > 0 ? timeUs % sequence.durationUs : timeUs;
  if (t < 0) return {text:'',cursor:false};
  let lo=0, hi=sequence.events.length;
  while(lo<hi) { const mid=(lo+hi)>>>1; if(sequence.events[mid].timeUs<=t) lo=mid+1; else hi=mid; }
  return {text:sequence.events[Math.max(0,lo-1)].text,cursor:t%blinkUs<blinkUs/2};
}

export const OVERLAYS = Object.freeze(['film-grain','vignette','letterbox','scanlines','light-leak','dust','blueprint-grid','halftone'].map(id=>Object.freeze({id,name:id.replaceAll('-',' '),provenance:id==='film-grain'?'degueba/onda':'original'})));
export const TREATMENTS = Object.freeze([
  {id:'clean', matrix:'1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0'},
  {id:'monochrome',matrix:'.2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 0 0 0 1 0'},
  {id:'warm-film',matrix:'1.05 .03 0 0 .02 .02 .98 0 0 0 0 .03 .88 0 0 0 0 0 1 0'},
  {id:'cool-steel',matrix:'.9 0 .03 0 0 0 .98 .02 0 0 .02 0 1.08 0 .01 0 0 0 1 0'},
]);

/** remotion-bits AnimatedCounter's keyframe interpolation, decoupled from hooks. */
export function sampleCounter(values,timeUs,{durationUs=1000000,decimals=0}={}) {
 integerUs(timeUs);integerUs(durationUs,'durationUs',true);
 if(!Array.isArray(values)||values.length<2||values.length>100||values.some(v=>!Number.isFinite(v))||!Number.isInteger(decimals)||decimals<0||decimals>12)throw new RangeError('copro_counter_invalid');
 const phase=clamp(timeUs/durationUs)*(values.length-1),index=Math.min(values.length-2,Math.floor(phase)),p=phase-index;
 const value=values[index]+(values[index+1]-values[index])*cubicOut(p);
 return {value,text:value.toFixed(decimals)};
}
