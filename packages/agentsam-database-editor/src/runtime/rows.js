function clean(value) {
  return value == null ? '' : String(value).trim();
}

function quoteIdent(value) {
  return `"${clean(value).replace(/"/g, '""')}"`;
}

/**
 * Paginated table browser shared by all engines.
 *
 * @param {import('../contracts/adapter.js').DatabaseAdapter} adapter
 * @param {{ engine?: string }} source
 * @param {URLSearchParams | { get: (k: string) => string | null }} params
 */
export async function readTableRows(adapter, source, params) {
  const get = (key) => (typeof params.get === 'function' ? params.get(key) : params[key]);
  const table = clean(get('table'));
  const schema = clean(get('schema')) || undefined;
  if (!table) throw new Error('table_required');
  const page = Math.max(1, Number(get('page') || 1) || 1);
  const limit = Math.min(200, Math.max(1, Number(get('limit') || 50) || 50));
  const offset = (page - 1) * limit;
  const schemaInfo = await adapter.describeTable({ name: table, schema });
  const columns = Array.isArray(schemaInfo.columns) ? schemaInfo.columns : [];
  const sort = clean(get('sort'));
  const dir = clean(get('dir')).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  if (sort && !columns.some((column) => column.name === sort)) {
    throw new Error('invalid_sort_column');
  }

  const filter = clean(get('filter'));
  const engine = String(source?.engine || adapter.dialect || '').toLowerCase();
  if (engine.includes('postgres')) {
    const qualified = `${quoteIdent(schema || 'public')}.${quoteIdent(table)}`;
    const order = sort ? ` ORDER BY ${quoteIdent(sort)} ${dir}` : '';
    const where = filter && columns.length ? " WHERE (" + columns.map(column => "CAST(" + quoteIdent(column.name) + " AS TEXT) ILIKE $1").join(" OR ") + ")" : "";
    const values = where ? ["%" + filter + "%"] : [];
    const [data, count] = await Promise.all([
      adapter.query({
        sql: `SELECT * FROM ${qualified}${where}${order} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        params: [...values, limit, offset],
      }),
      adapter.query({ sql: `SELECT COUNT(*)::bigint AS count FROM ${qualified}${where}`, params: values }),
    ]);
    const total = Number(count.objects?.[0]?.count || 0) || 0;
    return {
      rows: data.objects || [],
      columns,
      page,
      limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  const qualified = quoteIdent(table);
  const order = sort ? ` ORDER BY ${quoteIdent(sort)} ${dir}` : '';
  const where = filter && columns.length ? " WHERE (" + columns.map(column => "CAST(" + quoteIdent(column.name) + " AS TEXT) LIKE ?").join(" OR ") + ")" : "";
  const values = where ? columns.map(() => "%" + filter + "%") : [];
  const [data, count] = await Promise.all([
    adapter.query({
      sql: `SELECT * FROM ${qualified}${where}${order} LIMIT ? OFFSET ?`,
      params: [...values, limit, offset],
    }),
    adapter.query({ sql: `SELECT COUNT(*) AS count FROM ${qualified}${where}`, params: values }),
  ]);
  const total = Number(count.objects?.[0]?.count || 0) || 0;
  return {
    rows: data.objects || [],
    columns,
    page,
    limit,
    total,
    total_pages: Math.max(1, Math.ceil(total / limit)),
  };
}
