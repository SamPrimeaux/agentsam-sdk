import {StudioGlyph} from './StudioCommands';

export interface InspectorFamily<Id extends string> {
  id: Id;
  label: string;
  group: string;
  glyph:string;
}

export function InspectorPicker<Id extends string>({families, value, onChange, label = 'Properties panel'}: {
  families: readonly InspectorFamily<Id>[];
  value: Id;
  onChange(value: Id): void;
  label?: string;
}) {
  const current = families.find(family => family.id === value);
  const groups = [...new Set(families.map(family => family.group))];
  return <label className="studio-inspector-picker">
    {current && <StudioGlyph name={current.glyph} size={16}/>}
    <select aria-label={label} value={value} onChange={event => {
      const next = families.find(family => family.id === event.currentTarget.value);
      if (next) onChange(next.id);
    }}>
      {groups.map(group => <optgroup key={group} label={group}>
        {families.filter(family => family.group === group).map(family =>
          <option key={family.id} value={family.id}>{family.label}</option>)}
      </optgroup>)}
    </select>
  </label>;
}
