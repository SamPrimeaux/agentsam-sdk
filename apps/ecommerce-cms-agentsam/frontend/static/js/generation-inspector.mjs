import { applyHoisted, hoistSettings } from './settings-hoist.mjs';
import {settingCssValue} from './generated-settings-schema.mjs';
import {nsForms} from './generation-namespace.mjs';

const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function fieldMarkup(field) {
  const key=escape(field.key),id='te-field-generated-'+key,label=escape(field.label||field.key),value=escape(field.value);
  const prefix=`<div class="te-field" data-field-key="${key}"><label for="${id}">${label}</label>`;
  if(field.type==='boolean')return prefix+`<button id="${id}" type="button" class="te-switch" role="switch" data-generated-setting="${key}" data-setting-type="boolean" aria-checked="${field.value?'true':'false'}"></button></div>`;
  if(field.type==='select'||field.type==='alignment'||field.type==='font-role'||field.type==='typography-preset'){
    const choices=field.options|| (field.type==='alignment'?['start','center','end','stretch','left','right','justify'].map(item=>({value:item,label:item})):[]);
    if(choices.length)return prefix+`<select id="${id}" data-generated-setting="${key}" data-setting-type="${field.type}">`+
      choices.map(item=>`<option value="${escape(item.value)}" ${item.value===field.value?'selected':''}>${escape(item.label||item.value)}</option>`).join('')+'</select></div>';
  }
  if(['textarea','richtext'].includes(field.type))return prefix+`<textarea id="${id}" data-generated-setting="${key}" data-setting-type="${field.type}">${escape(field.value)}</textarea></div>`;
  if(field.type==='range')return prefix+`<div class="te-range-control"><input id="${id}" type="range" min="${field.min??0}" max="${field.max??100}" step="${field.step??1}" value="${value}" data-generated-setting="${key}" data-setting-type="range" data-range-field="${key}"></div></div>`;
 if(field.type==='color'&&/^#[0-9a-f]{6}$/i.test(field.value))return prefix+`<div class="te-color-control"><input id="${id}" type="color" value="${value}" data-generated-setting="${key}" data-setting-type="color" data-color-field="${key}"></div></div>`;
  const inputType=['number','spacing'].includes(field.type)?'number':field.type==='link'?'url':'text';
  const bounds=inputType==='number'?` min="${field.min??0}" max="${field.max??10000}" step="${field.step??1}"`:'';
  return prefix+`<input id="${id}" type="${inputType}" value="${value}" data-generated-setting="${key}" data-setting-type="${field.type}"${bounds}></div>`;
}

export function renderGeneratedSettings(body, values, schema) {
  const hoisted=hoistSettings(values);
  const render=(items,kind)=>Object.entries(items).map(([key,value])=>{
    const declared=schema?.[key]||{};
    const legacyType=key==='motion'?'boolean':key==='background'?'color':typeof value==='boolean'?'boolean':'range';
    return fieldMarkup({key,value,type:declared.type||legacyType,label:declared.label||key,
      options:declared.options,min:declared.min,max:declared.max,step:declared.step});
  }).join('');
  const editorFields=render(hoisted.editor,'editor');
  const generatedFields=render(hoisted.generated,'generated');
  body.innerHTML=(editorFields?'<section data-settings-group="editor"><h3>Editor</h3>'+editorFields+'</section>':'')+
    '<section data-settings-group="generated"><h3>Generated settings</h3>'+generatedFields+'</section>';
  return hoisted;
}

/** Preview + host-owned persistence. Passing a callback is intentionally
 * opt-in; no generated inspector can write to arbitrary remote endpoints. */
export function bindGeneratedSettings(body,wrapper,transport,schema={}) {
  function apply(key,value){
    const field=schema[key]||{type:typeof value==='boolean'?'boolean':'range'};
    if(field.binding==='style' && wrapper?.style){
      const instance=wrapper.getAttribute?.('data-agentsam-block');
      if(instance){
        let cssValue=settingCssValue(value,field);
        wrapper.style.setProperty(nsForms(instance).cssVarPrefix+'setting-'+key,cssValue);
      }
    }
    // Legacy preview tokens remain for accepted existing theme-editor fields.
    applyHoisted(wrapper,{[key]:value});
    if(transport && typeof transport.onChange==='function')transport.onChange(key,value);
  }
  // Hydrate visual variables on editor reload without writing a draft.
  for(const [key,field] of Object.entries(schema||{}))if(field.binding==='style'&&Object.hasOwn(schema,key)){
    const instance=wrapper?.getAttribute?.('data-agentsam-block');
    if(instance&&wrapper.style){
      let value=settingCssValue(field.value??(body.querySelector('[data-generated-setting="'+key+'"]')?.value),field);
      wrapper.style.setProperty(nsForms(instance).cssVarPrefix+'setting-'+key,value);
    }
  }
  body.querySelectorAll('[data-generated-setting]').forEach(input=>{
    const key=input.dataset.generatedSetting;
    const convert=raw=>['number','range','spacing'].includes(input.dataset.settingType)?Number(raw):raw;
    if(input.dataset.settingType==='boolean')input.addEventListener('click',()=>{
      const next=input.getAttribute('aria-checked')!=='true';input.setAttribute('aria-checked',String(next));apply(key,next);
    });
    else input.addEventListener(['select','media','video','model3d','product','collection','variant'].includes(input.dataset.settingType)?'change':'input',()=>apply(key,convert(input.value)));
  });
  return transport;
}

export function insertGeneratingNode(tree) {
  const node=tree.ownerDocument.createElement('div');
  node.className='te-tree-section';node.setAttribute('data-generating','true');
  node.innerHTML='<div class="te-tree-row"><span class="te-tree-row__name">Generating...</span></div>';
  tree.prepend(node);return node;
}
export function removeGeneratingNode(tree) {tree.querySelectorAll('[data-generating]').forEach(node=>node.remove());}
