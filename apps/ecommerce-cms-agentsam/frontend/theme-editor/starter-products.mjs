/**
 * Original, dependency-free vector illustrations for reusable starter themes.
 * These are display samples, never catalog records, inventory or checkout items.
 */
const tee=(color,trim,detail='')=>`<path d="M116 99 78 113 38 164 70 195 97 172V305Q97 315 108 315H212Q223 315 223 305V172L250 195 282 164 242 113 204 99Q195 124 160 124T116 99Z" fill="${color}"/><path d="M118 100Q123 132 160 132T202 100" fill="none" stroke="${trim}" stroke-width="10" stroke-linecap="round"/><path d="m40 163 31 29m178 0 31-29" stroke="${trim}" stroke-width="9" stroke-linecap="round"/><path d="M99 270q61 25 122-7v42q0 10-10 10H108q-10 0-10-10z" fill="#000" opacity=".05"/>${detail}`;
const illustrations=[
  {id:'tee-coral',name:'Sample coral tee',price:'$19.00',alt:'Illustration of a coral short sleeve shirt',
    art:tee('#cc7770','#e6bc76')},
  {id:'tee-teal',name:'Sample pocket tee',price:'$24.00',alt:'Illustration of a teal pocket shirt',
    art:tee('#378e91','#65b1af','<path d="M175 161h32v37q-16 17-32 0z" fill="#65b1af"/><path d="M98 253h124m-124 16h124" stroke="#215f66" stroke-width="7"/>')},
  {id:'tee-slate',name:'Sample graphic tee',price:'$22.00',alt:'Illustration of a slate shirt with a sunrise graphic',
    art:tee('#7c8591','#4c5560','<circle cx="160" cy="209" r="36" fill="#e6a090"/><path d="M120 211h80m-80 13h80m-80 13h80" stroke="#7c8591" stroke-width="7"/>')},
  {id:'tote-sand',name:'Sample everyday tote',price:'$28.00',alt:'Illustration of a sand canvas tote bag',
    art:'<path d="M95 151h130l13 151q1 13-13 13H95q-14 0-13-13z" fill="#d4bb96"/><path d="M127 166v-44q0-39 33-39t33 39v44" fill="none" stroke="#ae9068" stroke-width="13"/><path d="M137 225h46v42h-46z" fill="#b29470"/>'},
];
export const STARTER_PRODUCT_ILLUSTRATIONS=Object.freeze(illustrations.map(({art,...p})=>{
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 400" role="img" aria-label="${p.alt}"><rect width="320" height="400" fill="#eef0f3"/>${art}</svg>`;
  return Object.freeze({...p,svg,image_url:'data:image/svg+xml,'+encodeURIComponent(svg),sample:true,purchasable:false});
}));
