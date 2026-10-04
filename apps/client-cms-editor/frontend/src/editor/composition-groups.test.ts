import { describe, expect, it } from 'vitest';
import {
  buildCmsEditorGroups,
  getCmsSectionGroupId,
  type CmsEditorSection,
} from '../../../shared/cms/src/editor-types';

const section = (
  id: string,
  group: string | undefined,
  zone: CmsEditorSection['zone'] = 'BODY',
): CmsEditorSection => ({
  id,
  name: id,
  type: 'section',
  zone,
  visible: true,
  color: '#111115',
  fields: group ? { group_id: group, group_label: group.toUpperCase() } : {},
  blocks: [],
});

describe('CMS composition groups', () => {
  it('groups sections without making pages the authoring primitive', () => {
    const sections = [
      section('hero', 'intro'),
      section('proof', 'intro'),
      section('features', 'content'),
      section('footer', undefined, 'FOOTER'),
    ];

    const groups = buildCmsEditorGroups(sections);

    expect(groups.map((group) => group.id)).toEqual(['intro', 'content', 'footer']);
    expect(groups[0]?.sectionIds).toEqual(['hero', 'proof']);
    expect(groups[1]?.sectionIds).toEqual(['features']);
    expect(groups[2]?.sectionIds).toEqual(['footer']);
    expect(getCmsSectionGroupId(sections[3]!)).toBe('footer');
  });
});
