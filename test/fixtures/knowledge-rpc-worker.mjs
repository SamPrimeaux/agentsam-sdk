process.once('message', payload => {
  const generation = payload?.request?.generation_id || null;
  const delay = generation === 'slow' ? 180 : 20;
  setTimeout(() => {
    if (generation === 'fail') {
      process.send?.({ ok: false, error: 'fixture knowledge failure' });
    } else {
      process.send?.({ ok: true, result: {
        operation: payload?.request?.operation || null,
        repository_id: payload?.config?.repository_id || null,
        generation_id: generation,
      } });
    }
    setTimeout(() => process.exit(0), 5);
  }, delay);
});
