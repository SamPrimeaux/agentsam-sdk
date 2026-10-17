/** One declared settings vocabulary for generated section/block acceptance and
 * merchant inspector. Settings values never define their own public API. */
export const SETTING_TYPES = Object.freeze([
  'text','textarea','richtext','number','range','boolean','select','color',
  'media','video','model3d','link','font-role','typography-preset','product','collection',
  'variant','alignment','spacing',
]);
const TYPES = new Set(SETTING_TYPES);
const TYPE_ALIASES = Object.freeze({rich_text:'richtext','rich-text':'richtext',font_role:'font-role',typography_preset:'typography-preset'});
const UNITS = new Set(['','px','%','rem','em','ms','s','deg','fr']);
export const normalizeSettingType = type => TYPE_ALIASES[type]||type;
const FIELD = /^[a-z][a-zA-Z0-9_]{0,39}$/;
const VISUAL = new Set(['range','color','font-role','typography-preset','alignment','spacing']);
const SAFE_STYLE = new Set(['number','range','spacing','color','alignment','select','font-role','typography-preset','boolean']);
const REF = /^(?:[a-zA-Z0-9_-]{1,128})$/;
const COLORS = /^(?:#[\da-fA-F]{3,8}|var\(--[a-zA-Z0-9-]+\))$/;
const ALIGN = new Set(['start','center','end','stretch','left','right','justify']);

function validFieldValue(field,value) {
  if(value==null)return false;
  switch(field.type){
    case 'boolean': return typeof value==='boolean';
    case 'number':case 'range':case 'spacing':
      return typeof value==='number'&&Number.isFinite(value)&&
       (field.min==null||value>=field.min)&&(field.max==null||value<=field.max)&&
       (field.step==null||Math.abs((value-(field.min??0))/field.step-Math.round((value-(field.min??0))/field.step))<1e-7);
    case 'color':return typeof value==='string'&&COLORS.test(value);
    case 'select':return field.options.some(o=>o.value===value);
    case 'alignment':return typeof value==='string'&&ALIGN.has(value);
    case 'media':case 'video':case 'model3d':case 'product':case 'collection':case 'variant':
      return typeof value==='string'&&REF.test(value);
    case 'link':return typeof value==='string'&&value.length<=2000&&
      (/^\/(?!\/)/.test(value)||/^#[-\w]+$/.test(value)||/^https:\/\//.test(value)||/^mailto:/.test(value));
    case 'font-role':case 'typography-preset':
      return typeof value==='string'&&REF.test(value);
    default: return typeof value==='string'&&value.length <= (field.maxLength??(field.type==='richtext'?8000:2000));
  }
}
export function normalizeSettingFields(declared,settings) {
  if(!declared||typeof declared!=='object'||Array.isArray(declared)||!Object.keys(declared).length)
    throw Error('Generated components require a declared typed definition.settings schema');
  if(!settings||typeof settings!=='object'||Array.isArray(settings))throw Error('Instance settings must be an object');
  for(const key of Object.keys(settings))if(!Object.hasOwn(declared,key))throw Error('Undeclared instance setting: '+key);
  const fields={}, values={};
  for(const [key,input] of Object.entries(declared)){
    if(!FIELD.test(key)||!input||typeof input!=='object'||Array.isArray(input)||!TYPES.has(normalizeSettingType(input.type)))
      throw Error('Invalid declared generated setting schema: '+key);
    const type=normalizeSettingType(input.type);
    const field={type,label:typeof input.label==='string'?input.label.slice(0,80):key};
    if(input.description!=null)field.description=String(input.description).slice(0,300);
    if(input.min!=null||input.max!=null||input.step!=null){
      if(!['number','range','spacing'].includes(type))throw Error('Numeric bounds are incompatible with '+key);
      for(const prop of ['min','max','step'])if(input[prop]!=null){
        if(typeof input[prop]!=='number'||!Number.isFinite(input[prop])||(prop==='step'&&input[prop]<=0))throw Error('Invalid numeric '+prop+': '+key);
        field[prop]=input[prop];
      }
      if(field.min!=null&&field.max!=null&&field.min>field.max)throw Error('Invalid numeric range: '+key);
    }
    if(input.unit != null){
      const unit=String(input.unit);
      if(!UNITS.has(unit)||!['number','range','spacing'].includes(type))throw Error('Invalid numeric unit: '+key);
      field.unit=unit;
    }
    if(input.maxLength!=null){if(!Number.isSafeInteger(input.maxLength)||input.maxLength<1||input.maxLength>8000)throw Error('Invalid maxLength: '+key);field.maxLength=input.maxLength;}
    if(type==='select'){
      if(!Array.isArray(input.options)||input.options.length<1||input.options.length>60)throw Error('Select requires options: '+key);
      field.options=input.options.map(option=>{
        const value=typeof option==='string'?option:option?.value;
        if(typeof value!=='string'||!REF.test(value))throw Error('Invalid select option: '+key);
        return {value,label:String(option?.label||value).slice(0,80)};
      });
    }
    const binding=input.binding|| (VISUAL.has(type)?'style':'content');
    if(!['content','style'].includes(binding))throw Error('Unknown setting binding: '+key);
    if(binding==='style'&&!SAFE_STYLE.has(type))throw Error('Unsafe style setting type: '+key);
    field.binding=binding;
    if(input.default!==undefined) {
      if(!validFieldValue(field,input.default))throw Error('Invalid declared default: '+key);
      field.default=input.default;
    }
    const value=Object.hasOwn(settings,key)?settings[key]:input.default;
    if(!validFieldValue(field,value))throw Error('Invalid instance value for '+key+' ('+type+')');
    values[key]=value;fields[key]=field;
  }
  return {fields,settings:values};
}

export function settingCssValue(value,field) {
  if(typeof value==='number')return String(value)+(field.unit ?? (field.type==='spacing'?'px':''));
  if(field.type==='font-role')return `var(--font-${value})`;
  if(field.type==='typography-preset')return `var(--typography-${value})`;
  return String(value);
}
