export function createGeneratedBlockStore(store) {
  return {
    async saveGeneratedBlock(record) {
      const row = {
        id: record.blockId,
        canonical: record.canonical,
        settings: record.settings || {},
        provenance: record.provenance,
      };
      await store.put(row);
      await store.revision({ entityType: "block", entityId: record.blockId, snapshot: row });
      return row;
    },
    loadBlock(id) {
      return store.get(id);
    },
    writeRevision(entityId, snapshot) {
      return store.revision({ entityType: "block", entityId, snapshot });
    },
    listProvenance() {
      return store.list();
    },
  };
}
