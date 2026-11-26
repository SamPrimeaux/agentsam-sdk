/** Synthetic demo records for the standalone preview only. Never used by a runtime host. */
export const emptyBrandWorkspaceFixture = {
  workspaceId: 'fixture-empty-brand-workspace',
  activeBrandId: null,
  brands: [],
  connections: [],
};

export const sampleBrandWorkspaceFixture = {
  workspaceId: 'fixture-northstar-workspace',
  activeBrandId: 'demo-northstar-goods',
  connections: [
    { id: 'demo-source-website', name: 'Official website', type: 'website', status: 'verified' },
    { id: 'demo-source-brief', name: 'Approved brand brief', type: 'document', status: 'verified' },
  ],
  brands: [
    {
      id: 'demo-northstar-goods',
      name: 'Northstar Goods',
      status: 'approved',
      updated_at: '2026-11-24T16:30:00.000Z',
      assets: [
        { id: 'demo-logo-primary', name: 'Primary wordmark', type: 'logo', format: 'SVG', status: 'approved' },
        { id: 'demo-avatar', name: 'Social avatar', type: 'avatar', format: 'PNG', status: 'approved' },
        { id: 'demo-guidelines', name: 'Brand guidelines', type: 'document', format: 'PDF', status: 'approved' },
      ],
      sources: [
        { id: 'demo-website', name: 'Official website', type: 'website', url: 'https://example.com', status: 'verified' },
        { id: 'demo-brief', name: 'Approved brand brief', type: 'document', path: 'demo/brand-brief.md', status: 'verified' },
      ],
      themes: [
        { id: 'light', name: 'Northstar Light', description: 'Light presentation variant' },
        { id: 'dark', name: 'Northstar Dark', description: 'Dark presentation variant' },
      ],
      contract: {
        schema: 'iam.brand.v1',
        schema_version: 'iam.brand.v1',
        id: 'demo-northstar-goods',
        name: 'Northstar Goods',
        status: 'approved',
        tagline: 'Made for the long way home.',
        purpose: 'Build durable everyday goods for thoughtful journeys.',
        mission: 'Make useful objects with clear purpose and lasting value.',
        positioning: 'A considered, modern goods label with a practical point of view.',
        audience: 'People who value durable, well-designed everyday objects.',
        tone: ['Grounded', 'Warm', 'Direct', 'Quietly confident'],
        visual_system: {
          colors: {
            resolved: {
              canvas: '#F4F1E8',
              ink: '#18241C',
              primary: '#286447',
              accent: '#D5A85B',
              surface: '#FFFFFF',
            },
          },
          typography: { display: 'Northstar Display (demo)', body: 'Northstar Sans (demo)' },
        },
        tokens: {
          color: {
            canvas: '#F4F1E8',
            ink: '#18241C',
            primary: '#286447',
            accent: '#D5A85B',
            surface: '#FFFFFF',
          },
        },
        assets: [
          { id: 'demo-logo-primary', name: 'Primary wordmark', type: 'logo', format: 'SVG', status: 'approved' },
          { id: 'demo-avatar', name: 'Social avatar', type: 'avatar', format: 'PNG', status: 'approved' },
          { id: 'demo-guidelines', name: 'Brand guidelines', type: 'document', format: 'PDF', status: 'approved' },
        ],
        sources: [
          { id: 'demo-website', name: 'Official website', type: 'website', url: 'https://example.com', status: 'verified' },
          { id: 'demo-brief', name: 'Approved brand brief', type: 'document', path: 'demo/brand-brief.md', status: 'verified' },
        ],
        themes: [
          { id: 'light', name: 'Northstar Light', description: 'Light presentation variant' },
          { id: 'dark', name: 'Northstar Dark', description: 'Dark presentation variant' },
        ],
        rules: ['Preserve clear contrast.', 'Do not distort the wordmark.', 'Use the accent color sparingly.'],
        concept: 'A practical, durable identity with a restrained visual system.',
        components: ['Wordmark', 'Product label', 'Social avatar'],
        updated_at: '2026-11-24T16:30:00.000Z',
      },
    },
  ],
};
