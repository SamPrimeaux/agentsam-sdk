# @inneranimalmedia/copro-storage

Local-first project persistence for CoPro.

The package starts with memory and browser local-storage adapters. The contract is intentionally small so IndexedDB/OPFS/native/remote stores can replace the implementation without changing the project model.

## Browser source-media durability

Use `BrowserIndexedDbMediaStore` to persist original video/audio/image `Blob` or
`File` bytes separately from the serializable `copro.project.v1` editing
document. `save(assetId, file)` resolves only after the IndexedDB transaction
commits; `loadMany(assetIds)` returns source records on project reopen.

This is a browser-local persistence adapter, **not** remote/cloud backup or
permissioned multi-tenant storage. Exports containing only the CoPro document
do not embed the original source bytes. Hosts may use OPFS/native or
permissioned remote storage behind the same media-identity boundary.
