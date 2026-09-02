/** Compare observed counts, not normalized scores or inferred productivity. */
export function compareObservations(before, after) {
  if (!before || !after) throw new Error('Save at least two repository snapshots before comparing.');
  const delta = (a, b, keys) => Object.fromEntries(keys.map(key => [key, { before: a?.[key] || 0, after: b?.[key] || 0, delta: (b?.[key] || 0) - (a?.[key] || 0) }]));
  const old = new Map(before.data.directories.map(d => [d.path, d])), current = new Map(after.data.directories.map(d => [d.path, d]));
  const directories = [...new Set([...old.keys(), ...current.keys()])].sort().map(path => ({ path, ...delta(old.get(path), current.get(path), ['files', 'lines', 'bytes']) })).filter(d => d.files.delta || d.lines.delta || d.bytes.delta);
  return { before: { id: before.id, at: before.created_at, git: before.data.git }, after: { id: after.id, at: after.created_at, git: after.data.git },
    counts: delta(before.data.summary, after.data.summary, ['file_count', 'source_file_count', 'total_lines', 'total_bytes']), directories,
    note: 'Observed filesystem deltas. Rolling churn and relative stability scores are preserved in snapshots, not treated as interval rework, productivity, or quality.' };
}
