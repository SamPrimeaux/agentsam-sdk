/**
 * PrimeTech's original shared Three.js world, extracted from the v1 showcase.
 * Geometry, palette, 11 camera stops and cameraAt interpolation are preserved.
 * CMS sections only provide the scroll anchors; this runtime owns one canvas.
 */
import * as THREE from "three";
let seed = 42891;
function rand(){seed = (seed * 1664525 + 1013904223) >>> 0;return seed / 4294967296;}
const mix = (a,b,t)=>a+(b-a)*t, clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const smooth=(v)=>{const t=clamp(v);return t*t*(3-2*t);};
const COLORS = {
  clay:0xf2f4f1, ivory:0xfffdf9, snow:0xe9efee, stone:0xdbe4e7, shade:0xcbd6d8,
  sea:0xaeeaf1, glass:0xb2d7e8, glassDeep:0x87bbd3, glassPale:0xd4ecf5,
  leaf:0x9fc544, leaf2:0x82b154, leaf3:0xb1d456, trunk:0x9bada3, road:0xe2e8e7
};
const mat=(hex,extra={})=>new THREE.MeshStandardMaterial({color:hex,roughness:.83,metalness:0,...extra});
const clay=mat(COLORS.clay), white=mat(COLORS.ivory), snow=mat(COLORS.snow),
  stone=mat(COLORS.stone), glass=mat(COLORS.glass,{roughness:.27,metalness:.07}),
  glassDeep=mat(COLORS.glassDeep,{roughness:.32,metalness:.03}),
  road=mat(COLORS.road), trunk=mat(COLORS.trunk),
  greens=[mat(COLORS.leaf,{flatShading:true}),mat(COLORS.leaf2,{flatShading:true}),mat(COLORS.leaf3,{flatShading:true})];

let renderer,scene,camera,animating=false,reducedMotion=false,progress=0;
let stage=null,canvas=null,sectionObserver=null,mutationObserver=null;
let cameraPath={from:0,to:1};
const turbines=[],floating=[],companionSprites=[];
const spots=[
 {p:[23,15,30],t:[9,1,-8]},
 {p:[39,18,38],t:[29,0,-7]},
 {p:[71,21,35],t:[61,0,-6]},
 {p:[74,27,34],t:[68,0,-5]},
 {p:[99,24,43],t:[93,1,-4]},
 {p:[119,16,31],t:[109,0,-8]},
 {p:[144,21,38],t:[130,2,-8]},
 {p:[169,17,31],t:[154,1,-7]},
 {p:[185,19,35],t:[172,1,-7]},
 {p:[106,30,39],t:[104,-1,-4]},
 {p:[35,30,41],t:[38,-1,-3]}
];
const focusPos=new THREE.Vector3(),focusTarget=new THREE.Vector3();
function heightAt(x,z){
  const edge=Math.max(0,(Math.abs(z)-12)/38);
  return -3.8+Math.pow(edge,1.58)*26
     +edge*(Math.sin(x*.16+z*.2)*2.1+Math.cos(x*.105-z*.12)*1.35)
     +edge*edge*Math.sin(x*.045)*2.1;
}
function addBox(parent,x,y,z,w,h,d,material,shadow=true){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
  mesh.position.set(x,y,z);mesh.castShadow=shadow;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function addCylinder(parent,x,y,z,rTop,rBot,h,material,segments=8){
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(rTop,rBot,h,segments),material);
  mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function terrain(){
  // Every triangle receives a subtly distinct clay shade, leaving the geometry itself as the texture.
  const nx=155,nz=64,xMin=-64,xMax=211,zMin=-65,zMax=67;
  const pos=[],colors=[];
  const palette=[new THREE.Color(0xf3f4f1),new THREE.Color(0xe7eeed),new THREE.Color(0xf8f8f5),new THREE.Color(0xe3e9e9),new THREE.Color(0xeff2ef)];
  const vertex=(x,z)=>[x,heightAt(x,z),z];
  const emit=(a,b,c)=>{const k=palette[Math.floor(rand()*palette.length)];for(const v of [a,b,c]){pos.push(...v);colors.push(k.r,k.g,k.b);}};
  for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){
    const x0=mix(xMin,xMax,i/nx),x1=mix(xMin,xMax,(i+1)/nx);
    const z0=mix(zMin,zMax,j/nz),z1=mix(zMin,zMax,(j+1)/nz);
    const a=vertex(x0,z0),b=vertex(x1,z0),c=vertex(x1,z1),d=vertex(x0,z1);
    if((i+j)%2){emit(a,b,d);emit(b,c,d);}else{emit(a,b,c);emit(a,c,d);}
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true,side:THREE.DoubleSide}));
  mesh.receiveShadow=true;scene.add(mesh);
  // The water is a shallow continuous blue channel between clay banks.
  const waterPos=[],waterInd=[];
  for(let i=0;i<=180;i++){const x=-64+i*1.54,center=5.2+Math.sin(x*.047)*2.9;
    waterPos.push(x,-2.65,center-11,x,-2.65,center+11);
    if(i<180){const o=i*2;waterInd.push(o,o+1,o+2,o+1,o+3,o+2);}
  }
  const waterGeo=new THREE.BufferGeometry();
  waterGeo.setAttribute('position',new THREE.Float32BufferAttribute(waterPos,3));
  waterGeo.setIndex(waterInd);waterGeo.computeVertexNormals();
  const water=new THREE.Mesh(waterGeo,new THREE.MeshPhysicalMaterial({color:0x9edfe9,roughness:.22,metalness:.06,side:THREE.DoubleSide}));
  water.receiveShadow=true;scene.add(water);
}
function mountain(x,z,scale){
  const h=18*scale,r=12*scale;
  const g=new THREE.ConeGeometry(r,h,5);
  g.rotateY(rand()*Math.PI);
  const mesh=new THREE.Mesh(g,rand()>.5?snow:clay);
  mesh.position.set(x,heightAt(x,z)+h*.39,z);mesh.receiveShadow=true;mesh.castShadow=true;scene.add(mesh);
}
function tree(x,z,scale=1){
  const y=heightAt(x,z),g=new THREE.Group();
  g.position.set(x,y,z);
  addCylinder(g,0,.7*scale,0,.14*scale,.19*scale,1.6*scale,trunk,5);
  const canopy=new THREE.Mesh(new THREE.IcosahedronGeometry(1.04*scale,0),greens[Math.floor(rand()*greens.length)]);
  canopy.scale.set(.75+rand()*.2,1.1+rand()*.45,.8+rand()*.28);
  canopy.position.y=1.94*scale;canopy.castShadow=true;canopy.receiveShadow=true;g.add(canopy);scene.add(g);
}
function windowStrip(parent,x,y,z,w,h){
  addBox(parent,x,y,z,w,h,.07,glass,false);
  addBox(parent,x,y+h*.5+.11,z,w+.06,.17,.18,white,false);
}
function house(x,z,s=1){
  const g=new THREE.Group();g.position.set(x,heightAt(x,z),z);scene.add(g);
  const w=s*(2.5+rand()*1.5),d=s*(2.2+rand()*1.4),h=s*(2+rand()*1.3);
  addBox(g,0,h/2,0,w,h,d,rand()>.5?clay:white);
  const roof=new THREE.Mesh(new THREE.ConeGeometry(w*.79,1.45*s,4),white);
  roof.rotation.y=Math.PI/4;roof.position.y=h+.48*s;roof.castShadow=true;g.add(roof);
  addBox(g,0,h*.52,d/2+.05,w*.23,h*.45,.06,glassDeep,false);
  if(w>3.5) addBox(g,w*.28,h*.66,d/2+.05,.45*s,.55*s,.06,glass,false);
}
function tower(x,z,w,h,d){
  const g=new THREE.Group();g.position.set(x,heightAt(x,z),z);scene.add(g);
  addBox(g,0,h/2,0,w,h,d,clay);
  addBox(g,0,h*.58,d/2+.045,w*.89,h*.7,.08,glass);
  for(let n=1;n<Math.ceil(h/2.7);n++)addBox(g,0,n*(h/Math.ceil(h/2.7)),d/2+.10,w*.92,.12,.18,white,false);
  for(let i=-1;i<=1;i++)addBox(g,w*.37*i,h*.55,d/2+.15,.14,h*.73,.18,white,false);
  addBox(g,0,h+.22,0,w+0.7,.42,d+.7,white);
}
function modern(x,z,w,h,d,levels=2){
  const g=new THREE.Group();g.position.set(x,heightAt(x,z),z);scene.add(g);
  addBox(g,0,.12,0,w+2,.25,d+2,stone);
  addBox(g,0,h*.44,0,w,h*.88,d,clay);
  addBox(g,0,h*.48,d/2+.07,w*.83,h*.68,.10,glass);
  for(let i=-2;i<=2;i++)addBox(g,i*w*.167,h*.48,d/2+.19,.20,h*.75,.23,white);
  addBox(g,0,h*.87,0,w+1.2,.39,d+1,white);
  if(levels>1){
    addBox(g,-w*.06,h*1.18,-d*.2,w*.72,h*.52,d*.72,clay);
    addBox(g,-w*.06,h*1.18,-d*.2+d*.38,w*.67,h*.43,.12,glass);
    addBox(g,-w*.06,h*1.47,-d*.2,w*.82,.34,d*.82,white);
  }
  // cantilevered deck, key to the architectural language
  addBox(g,w*.43,h*.72,d*.22,w*.57,.29,d*.72,white);
  return g;
}
function plaza(x,z,r){
  const base=heightAt(x,z),geometry=new THREE.CylinderGeometry(r,r+.4,.17,8);
  const mesh=new THREE.Mesh(geometry,stone);mesh.position.set(x,base+.1,z);mesh.receiveShadow=true;scene.add(mesh);
}
function sculpt(x,z,size=2.6){
  const base=heightAt(x,z),g=new THREE.Group();g.position.set(x,base,z);scene.add(g);
  addCylinder(g,0,.42,0,size*1.1,size*1.25,.8,stone,12);
  const mesh=new THREE.Mesh(new THREE.TorusKnotGeometry(size*.73,size*.23,110,8,2,3),white);
  mesh.position.y=size+1.1;mesh.rotation.set(.2,.18,.4);mesh.castShadow=true;g.add(mesh);floating.push(mesh);
}
function windmill(x,z,s=1){
  const y=heightAt(x,z),g=new THREE.Group();g.position.set(x,y,z);scene.add(g);
  addCylinder(g,0,6*s,0,.21*s,.35*s,12*s,white,7);
  const bladeGroup=new THREE.Group();bladeGroup.position.y=12*s;g.add(bladeGroup);
  addCylinder(bladeGroup,0,0,0,.44*s,.44*s,.55*s,stone);
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3;const blade=addBox(bladeGroup,Math.sin(a)*3.2*s,Math.cos(a)*3.2*s,.35*s,.37*s,6.1*s,.12*s,white);
    blade.rotation.z=-a;
  }
  turbines.push(bladeGroup);
}

function companions() {
  // These are the exact supplied InnerAnimal portrait assets, not procedural animal meshes.
  // The 3D world uses camera-facing textured sprites so the artwork remains unchanged.
  const loader = new THREE.TextureLoader();
  const characters = [
    { id: 'geaux', x: 146, z: -2.2, size: 5.2, pedestal: 1.62, phase: 0 },
    { id: 'meaux', x: 160, z: -1.4, size: 4.7, pedestal: .98, phase: 1.15 }
  ];

  for (const character of characters) {
    const baseY = heightAt(character.x, character.z);
    addCylinder(scene, character.x, baseY + .16, character.z,
      character.pedestal, character.pedestal + .18, .32, stone, 10);

    const assetUrl = new URL(
      `/assets/primetech/companions/${character.id}.png`,
      window.location.origin
    ).href;

    loader.load(assetUrl, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;

      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        alphaTest: .025,
        depthWrite: false,
        toneMapped: false
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(character.x, baseY + character.size * .52 + .2, character.z);
      sprite.scale.set(character.size, character.size, 1);
      sprite.renderOrder = 3;
      sprite.userData.baseY = sprite.position.y;
      sprite.userData.phase = character.phase;
      sprite.userData.companionId = character.id;
      scene.add(sprite);
      companionSprites.push(sprite);
    }, undefined, (error) => {
      console.error(`PrimeTech could not load the original ${character.id} artwork:`, error);
    });
  }
}

function construction(){
  terrain();
  // Mountain ranges form the same white horizon across every chapter.
  for(let i=0;i<17;i++){
    const x=-55+i*16.7;
    mountain(x,-47-rand()*10,.7+rand()*.65);
    mountain(x+7,49+rand()*11,.72+rand()*.56);
  }
  // Architectural campuses and productive neighborhoods.
  modern(10,-12,13,7.4,9,2);
  modern(30,-13,11,7,8,2);
  tower(21,-23,5,12,5);tower(37,-24,6,10,6);
  modern(59,-10,11,7,9,2);tower(66,-23,4.8,13,4.8);
  modern(85,-13,9,6,7,2);tower(89,-24,5,13,5);
  modern(108,-13,16,9,11,2);tower(117,-26,5,15,5);
  modern(132,-12,12,10,8,2);tower(141,-24,5,17,5);
  modern(154,-13,12,7.3,9,2);tower(164,-23,6,13,5);
  // CAD's faceted open ring and a sculpture district.
  plaza(105,-12,11);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(4.4,.55,10,52),white);
  ring.position.set(106,heightAt(106,-12)+13,-12);
  ring.rotation.y=Math.PI*.23;ring.castShadow=true;scene.add(ring);
  sculpt(151,-9,3.1);sculpt(167,-10,2.1);
  companions();
  // A recognizable PrimeTech-connected data campus, not a product screenshot.
  const podPositions=[[127,-4],[135,-1],[143,-6]];
  podPositions.forEach(([x,z],idx)=>{
    const y=heightAt(x,z);
    addCylinder(scene,x,y+2.6,z,2.4,2.8,5.3,idx%2?clay:white,8);
    addCylinder(scene,x,y+5.35,z,2.7,2.7,.45,glass,8);
  });
  // Suburban clusters and greenspace keep the scene feeling inhabited.
  for(let i=0;i<115;i++){
    const x=-35+rand()*224;
    const z=(rand()>.5?1:-1)*(13+rand()*21);
    if((x>5&&x<15&&z>-19&&z<-5)||(x>97&&x<117&&z>-22&&z<-3)||(x>146&&x<161&&z>-20&&z<-4))continue;
    if(rand()>.52) house(x,z,.68+rand()*.58);
  }
  for(let i=0;i<240;i++){
    const x=-55+rand()*251;
    const z=(rand()>.5?1:-1)*(12+rand()*35);
    if(x>-5&&x<28&&z>17)continue;
    if(x>2&&x<17&&z>-23&&z<-6)continue;
    if(x>96&&x<118&&z>-24&&z<-4)continue;
    if(x>126&&x<148&&z>-24&&z<-3)continue;
    if(x>145&&x<169&&z>-22&&z<-2)continue;
    tree(x,z,.7+rand()*.8);
  }
  // Trains and a clear seam through the landscape, familiar to architectural maquettes.
  for(const z of [27.9,29.25])addBox(scene,73,heightAt(72,28)+.24,z,237,.085,.17,stone,false);
  for(let i=0;i<150;i++){
    const x=-43+i*1.57;addBox(scene,x,heightAt(x,28.5)+.1,28.55,.29,.1,2.25,road,false);
  }
  windmill(-13,-34,1.15);windmill(46,-39,.9);windmill(82,38,.85);windmill(175,-38,1.05);
  // Waterfront terraces make cyan water visibly part of every region.
  for(const x of [0,34,67,99,129,165]){
    const z=-2.8, y=heightAt(x,z);
    addBox(scene,x,y+.25,z,10,.42,3.6,white);
    addBox(scene,x,y+.18,z+2.1,10,.2,.5,stone,false);
  }
}


function sectionEntries(){
  return [...document.querySelectorAll('[data-primetech-scene-index]')]
    .map((element)=>({element,index:Number(element.dataset.primetechSceneIndex),top:element.getBoundingClientRect().top+window.scrollY}))
    .filter((item)=>Number.isInteger(item.index)&&item.index>=0&&item.index<spots.length)
    .sort((a,b)=>a.top-b.top);
}
function getScrollStage(){
  const sections=sectionEntries();
  if(!sections.length){cameraPath={from:0,to:0};return 0;}
  const center=window.scrollY+2;
  let n=0;
  for(let i=0;i<sections.length;i++){if(center>=sections[i].top)n=i;}
  const current=sections[n],next=sections[n+1];
  cameraPath={from:current.index,to:next?next.index:current.index};
  if(!next)return current.index;
  const p=clamp((center-current.top)/Math.max(1,next.top-current.top));
  return current.index+(next.index-current.index)*smooth(p);
}
function cameraAt(t){
  const a=Math.min(spots.length-1,Math.floor(t)),b=Math.min(spots.length-1,a+1),v=smooth(t-a);
  const from=spots[a],to=spots[b];
  focusPos.set(mix(from.p[0],to.p[0],v),mix(from.p[1],to.p[1],v),mix(from.p[2],to.p[2],v));
  focusTarget.set(mix(from.t[0],to.t[0],v),mix(from.t[1],to.t[1],v),mix(from.t[2],to.t[2],v));
  if(window.innerWidth<800){focusPos.y+=12;focusPos.z+=1;focusTarget.y+=1.2;}
  camera.position.copy(focusPos);camera.lookAt(focusTarget);
}
function cameraAtDirected(fromIndex,toIndex,position){
  const descending=toIndex<fromIndex;
  const bounded=clamp(position,Math.min(fromIndex,toIndex),Math.max(fromIndex,toIndex));
  const a=descending?Math.ceil(bounded):Math.floor(bounded);
  const b=descending?Math.max(0,a-1):Math.min(spots.length-1,a+1);
  const v=descending?a-bounded:bounded-a;
  const from=spots[a],to=spots[b];
  focusPos.set(mix(from.p[0],to.p[0],v),mix(from.p[1],to.p[1],v),mix(from.p[2],to.p[2],v));
  focusTarget.set(mix(from.t[0],to.t[0],v),mix(from.t[1],to.t[1],v),mix(from.t[2],to.t[2],v));
  if(window.innerWidth<800){focusPos.y+=12;focusPos.z+=1;focusTarget.y+=1.2;}
  camera.position.copy(focusPos);camera.lookAt(focusTarget);
}
function resize(){
  if(!renderer||!camera)return;
  renderer.setSize(window.innerWidth,window.innerHeight,false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,window.innerWidth<700?1.25:1.65));
  camera.aspect=window.innerWidth/window.innerHeight;
  camera.fov=window.innerWidth<700?43:36;
  camera.updateProjectionMatrix();
}
function animate(time=0){
  if(!animating||!renderer||!scene||!camera)return;
  requestAnimationFrame(animate);
  const t=getScrollStage();
  progress+=(t-progress)*(reducedMotion?1:.14);
  if(cameraPath.to<cameraPath.from)cameraAtDirected(cameraPath.from,cameraPath.to,progress);
  else cameraAt(progress);
  if(!reducedMotion){
    for(const blade of turbines)blade.rotation.z=time*.00011;
    for(const shape of floating)shape.rotation.y+=.0007;
    for(const sprite of companionSprites){sprite.position.y=sprite.userData.baseY+Math.sin(time*.0011+sprite.userData.phase)*.11;}
  }
  renderer.render(scene,camera);
}
function start(){if(animating||document.hidden||!renderer)return;animating=true;requestAnimationFrame(animate);}
function stop(){animating=false;}
function updateActive(){
  if(!stage)return;
  const active=sectionEntries().some(({element})=>{const r=element.getBoundingClientRect();return r.bottom>0&&r.top<window.innerHeight;});
  stage.classList.toggle('is-active',active);
  if(active)start();else stop();
}
function initScene(){
  try{
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    renderer.setSize(window.innerWidth,window.innerHeight,false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,window.innerWidth<700?1.25:1.65));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    scene=new THREE.Scene();scene.background=new THREE.Color(0xc7f0ff);
    scene.fog=new THREE.Fog(0xe3f4f8,100,210);
    const ambient=new THREE.HemisphereLight(0xffffff,0xc5dfea,1.5);scene.add(ambient);
    const sun=new THREE.DirectionalLight(0xffffff,1.85);
    sun.position.set(-18,58,42);sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048);
    sun.shadow.camera.left=-95;sun.shadow.camera.right=95;
    sun.shadow.camera.top=85;sun.shadow.camera.bottom=-85;
    sun.shadow.camera.near=.5;sun.shadow.camera.far=195;
    sun.shadow.bias=-.00012;sun.shadow.normalBias=.09;scene.add(sun);
    camera=new THREE.PerspectiveCamera(window.innerWidth<700?42:36,window.innerWidth/window.innerHeight,.1,350);
    construction();resize();progress=getScrollStage();cameraAt(progress);
    stage.classList.add('ready');
  }catch(error){
    console.error('[PrimeTech] Shared scene could not initialize:',error);
    stage.classList.add('is-failed');
    if(canvas)canvas.style.display='none';
  }
}
function handleScrollNext(event){
  const button=event.target?.closest?.('[data-primetech-scroll-next]');
  if(!button)return;
  const current=button.closest('[data-primetech-scene-index]');
  const sections=sectionEntries();
  const next=sections.find((item)=>item.element!==current&&item.top>(current?.getBoundingClientRect().top+window.scrollY+1));
  if(next)next.element.scrollIntoView({behavior:reducedMotion?'auto':'smooth',block:'start'});
}
function mount(){
  if(window.__primeTechSceneMounted)return;
  const sections=document.querySelectorAll('[data-primetech-scene-index]');
  if(!sections.length)return;
  window.__primeTechSceneMounted=true;
  reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
  stage=document.createElement('div');stage.className='pt-scene-environment';stage.setAttribute('aria-hidden','true');
  canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');
  const sky=document.createElement('div');sky.className='pt-scene-sky-wash';
  const haze=document.createElement('div');haze.className='pt-scene-light-haze';
  stage.append(canvas,sky,haze);document.body.prepend(stage);
  initScene();
  if('IntersectionObserver'in window){
    sectionObserver=new IntersectionObserver(updateActive,{threshold:.01});
    sectionEntries().forEach(({element})=>sectionObserver.observe(element));
  }
  mutationObserver=new MutationObserver(()=>{
    if(sectionObserver)sectionEntries().forEach(({element})=>sectionObserver.observe(element));
    updateActive();
  });
  mutationObserver.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('scroll',updateActive,{passive:true});
  window.addEventListener('resize',()=>{resize();updateActive();},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else updateActive();});
  document.addEventListener('click',handleScrollNext);
  window.__primeTechScene={stage,renderer,scene,camera,spots,dispose(){
    stop();sectionObserver?.disconnect();mutationObserver?.disconnect();
    window.removeEventListener('scroll',updateActive);renderer?.dispose();stage?.remove();
    window.__primeTechSceneMounted=false;window.__primeTechScene=null;
  }};
  updateActive();
}
function boot(){
  if(document.querySelector('[data-primetech-scene-index]'))mount();
  else if(!window.__primeTechSceneWaiter){
    window.__primeTechSceneWaiter=new MutationObserver(()=>{
      if(document.querySelector('[data-primetech-scene-index]')){
        window.__primeTechSceneWaiter.disconnect();window.__primeTechSceneWaiter=null;mount();
      }
    });
    window.__primeTechSceneWaiter.observe(document.documentElement,{childList:true,subtree:true});
  }
}
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
}
