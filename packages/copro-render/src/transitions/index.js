import {TRANSITIONS} from './catalog.js';
export {TRANSITIONS};
const clone=x=>structuredClone(x);
const aliases={fade:'gl:Fade',crossfade:'gl:Fade',wipe:'gl:DirectionalWipe',zoom:'gl:SimpleZoom',glitch:'gl:GlitchMemories'};
export function findTransition(type) { const entry=TRANSITIONS.find(x=>x.id===(aliases[type]||type)); if(!entry)throw new Error('copro_transition_unknown:'+type);return clone(entry); }
export function normalizeTransition(input={}) {
 if(typeof input==='string')input={type:input};
 if(input.type==='none') return {type:'none',durationUs:0,parameters:{}};
 const def=findTransition(input.type),durationUs=input.durationUs??300000;
 if(!Number.isSafeInteger(durationUs)||durationUs<=0)throw new RangeError('copro_transition_duration_invalid');
 if(input.parameters!==undefined&&(!input.parameters||typeof input.parameters!=='object'||Array.isArray(input.parameters)))throw new TypeError('copro_transition_parameters_invalid');
 const parameters={};
 for(const key of Object.keys(input.parameters||{}))if(!Object.hasOwn(def.parameters,key))throw new Error('copro_transition_parameter_unknown:'+key);
 for(const [key,spec] of Object.entries(def.parameters)) {
  const value=input.parameters?.[key]??clone(spec.default),ints=spec.type==='int'||spec.type.startsWith('ivec');
  const validNumber=x=>Number.isFinite(x)&&Math.abs(x)<=1000000&&(!ints||Number.isSafeInteger(x));
  if(spec.type==='bool'?typeof value!=='boolean':spec.type.includes('vec')? !Array.isArray(value)||value.length!==Number(spec.type.at(-1))||!value.every(validNumber):!validNumber(value)) throw new TypeError('copro_transition_parameter_invalid:'+key);
  parameters[key]=value;
 }
 return {type:def.id,durationUs,parameters};
}
export function transitionProgress(timeUs,durationUs) {
 if(!Number.isSafeInteger(timeUs)||!Number.isSafeInteger(durationUs)||durationUs<=0)throw new RangeError('copro_transition_time_invalid');
 return Math.max(0,Math.min(1,timeUs/durationUs));
}
// GL Transitions' standard API is preserved: ratio, progress, getFromColor and getToColor.
// Host-decoded ImageBitmap/VideoFrame/canvas inputs only; this module does no media I/O.
const vertex='attribute vec2 position; varying vec2 vUv; void main(){vUv=(position+1.0)*0.5;gl_Position=vec4(position,0.0,1.0);}';
export function transitionFragmentSource(def,precision='highp') {
 return `precision ${precision} float; varying vec2 vUv;
 uniform sampler2D fromTexture; uniform sampler2D toTexture;
 uniform float progress; uniform float ratio; uniform float fromRatio; uniform float toRatio;
 vec2 coverUv(vec2 uv,float imageRatio){return (uv-.5)*vec2(min(ratio/imageRatio,1.0),min(imageRatio/ratio,1.0))+.5;}
 vec4 getFromColor(vec2 uv){return texture2D(fromTexture,coverUv(uv,fromRatio));}
 vec4 getToColor(vec2 uv){return texture2D(toTexture,coverUv(uv,toRatio));}
 ${def.glsl}
 void main(){if(progress<=0.0){gl_FragColor=getFromColor(vUv);}else if(progress>=1.0){gl_FragColor=getToColor(vUv);}else{gl_FragColor=transition(vUv);}}`;
}
export function createCoProTransitionRenderer(canvas,{contextAttributes={}}={}) {
 const gl=canvas?.getContext?.('webgl',{alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true,...contextAttributes});
 if(!gl)throw new Error('copro_webgl_unavailable');
 let disposed=false,lost=false,buffer,textures=[];const programs=new Map();
 function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(s);gl.deleteShader(s);throw new Error('copro_shader_compile_failed:'+log);}return s;}
 function init(){buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);textures=[0,1].map(()=>{const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);return tex;});}
 function program(def){if(programs.has(def.id))return programs.get(def.id);const precision=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT)?.precision?'highp':'mediump';let vs,fs,p;
  try{vs=shader(gl.VERTEX_SHADER,vertex);fs=shader(gl.FRAGMENT_SHADER,transitionFragmentSource(def,precision));p=gl.createProgram();gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('copro_shader_link_failed:'+gl.getProgramInfoLog(p));programs.set(def.id,p);return p;}catch(error){if(p)gl.deleteProgram(p);throw error;}finally{if(vs)gl.deleteShader(vs);if(fs)gl.deleteShader(fs);}
 }
 function check(){if(disposed)throw new Error('copro_transition_renderer_disposed');if(lost||gl.isContextLost())throw new Error('copro_webgl_context_lost');}
 function onLost(e){e.preventDefault();lost=true;programs.clear();}
 function onRestored(){if(disposed)return;lost=false;init();}
 canvas.addEventListener?.('webglcontextlost',onLost);canvas.addEventListener?.('webglcontextrestored',onRestored);init();
 return Object.freeze({
  compile(type){check();program(findTransition(type));return {type,compiled:true};},
  render({transition,from,to,timeUs=0}){
   check();const normalized=normalizeTransition(transition);const def=findTransition(normalized.type==='none'?'gl:Fade':normalized.type);const p=program(def);gl.useProgram(p);
   const width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;if(width<1||height<1)throw new Error('copro_transition_canvas_empty');gl.viewport(0,0,width,height);
   gl.bindBuffer(gl.ARRAY_BUFFER,buffer);const pos=gl.getAttribLocation(p,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
   const uniform=(name,fn,...args)=>{const loc=gl.getUniformLocation(p,name);if(loc!==null)gl[fn](loc,...args);};
   for(const [i,img] of [from,to].entries()){
    const iw=img?.displayWidth||img?.videoWidth||img?.naturalWidth||img?.width,ih=img?.displayHeight||img?.videoHeight||img?.naturalHeight||img?.height;
    if(!(iw>0&&ih>0))throw new Error('copro_transition_source_invalid');
    gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,textures[i]);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);uniform(i?'toTexture':'fromTexture','uniform1i',i);uniform(i?'toRatio':'fromRatio','uniform1f',iw/ih);
   }
   const progress=normalized.type==='none'?1:transitionProgress(timeUs,normalized.durationUs);uniform('progress','uniform1f',progress);uniform('ratio','uniform1f',width/height);
   for(const [name,spec] of Object.entries(def.parameters)) {
    const value=normalized.parameters[name]??spec.default;
    if(spec.type.includes('vec'))uniform(name,`uniform${spec.type.at(-1)}${spec.type.startsWith('i')?'i':'f'}v`,value);
    else uniform(name,spec.type==='float'?'uniform1f':'uniform1i',spec.type==='bool'?Number(value):value);
   }
   gl.disable(gl.BLEND);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);const error=gl.getError();if(error!==gl.NO_ERROR)throw new Error('copro_webgl_error:'+error);return {type:normalized.type,progress,width,height};
  },
  dispose(){if(disposed)return;disposed=true;canvas.removeEventListener?.('webglcontextlost',onLost);canvas.removeEventListener?.('webglcontextrestored',onRestored);for(const p of programs.values())gl.deleteProgram(p);for(const t of textures)gl.deleteTexture(t);gl.deleteBuffer(buffer);programs.clear();},
 });
}
