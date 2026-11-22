import {icon} from '@inneranimalmedia/agentsam-workbench/studio-icons';
export {icon};
export function iconButton(id:string,glyph:string,label:string,extraClass=""){
 return `<button class="icon-control ${extraClass}" id="${id}" type="button" title="${label}" aria-label="${label}">${icon(glyph)}</button>`;
}
