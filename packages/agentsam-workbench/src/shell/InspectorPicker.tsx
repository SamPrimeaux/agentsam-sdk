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
  const current = families.find(family => family.id === value) ?? families[0];
  const groups = [...new Set(families.map(family => family.group))];
  if (!current) return null;
  return <nav className="studio-inspector-picker" aria-label={label}>
    <div className="studio-inspector-groups" role="group" aria-label="Property categories">
      {groups.map(group => <button key={group} type="button"
        aria-pressed={group === current.group}
        onClick={() => {
          if (group === current.group) return;
          const first = families.find(family => family.group === group);
          if (first) onChange(first.id);
        }}>{group}</button>)}
    </div>
    <div className="studio-inspector-families" role="group" aria-label={current.group + ' properties'}>
      {families.filter(family => family.group === current.group).map(family =>
        <button key={family.id} type="button" title={family.label}
          aria-pressed={family.id === current.id} onClick={() => onChange(family.id)}>
          <StudioGlyph name={family.glyph} size={16}/>
          <span>{family.label}</span>
        </button>)}
    </div>
  </nav>;
}
