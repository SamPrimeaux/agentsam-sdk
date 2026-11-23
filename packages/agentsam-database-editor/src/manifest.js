/** Reusable Database Editor module descriptor; D1 legacy app installations remain compatible. */
export const DATABASE_EDITOR_APP = Object.freeze({
  schema: 'agentsam.package.v1',
  kind: 'module',
  installable: false,
  id: 'database-editor',
  name: 'AgentSam Database Editor',
  display_name: 'Database Editor',
  package: '@inneranimalmedia/agentsam-database-editor',
  icon: 'database',
  install: {
    supported: false,
    authority: 'host-capability',
    note: 'Existing account app installations remain accessible through the host launcher; new standalone installs are not offered.',
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
