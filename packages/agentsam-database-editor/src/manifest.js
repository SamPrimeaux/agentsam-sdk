/** Runtime export of agentsam.app.json for Local Studio EmptyState. */
export const DATABASE_EDITOR_APP = Object.freeze({
  schema: 'agentsam.app.v1',
  id: 'database-editor',
  name: 'AgentSam Database Editor',
  display_name: 'Database Editor',
  package: '@inneranimalmedia/agentsam-database-editor',
  icon: 'database',
  install: {
    supported: true,
    command: 'agentsam app install database-editor',
    curl: 'curl -fsSL https://agentsam.inneranimalmedia.com/install | bash -s -- --app-id database-editor',
  },
  preview: {
    supported: true,
    route: '/database',
  },
  routes: {
    home: '/database',
    connections: '/database/connections',
    vectors: '/database/vectors',
  },
  capabilities: [
    'database.inspect',
    'database.query',
    'database.edit',
    'vectors.inspect',
  ],
  empty_state: {
    title: 'No databases connected',
    description:
      'Open a local SQLite database or connect a hosted database. Vectors are optional.',
    primary_label: 'Open local database',
    secondary_label: 'Connect database',
  },
});
