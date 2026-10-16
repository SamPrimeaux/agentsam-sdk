# @inneranimalmedia/copro-storage

Local-first project persistence for CoPro.

The package starts with memory and browser local-storage adapters. The contract is intentionally small so IndexedDB/OPFS/native/remote stores can replace the implementation without changing the project model.

## Persistent browser source media (IndexedDB)

`BrowserIndexedDbMediaStore` retains user-imported original `File`/`Blob` bytes in the browser's IndexedDB storage. The CoPro project document continues to store stable asset IDs; temporary `blob:` URLs are regenerated from retained bytes upon reopening. This is a browser-local adapter, **not** cross-device synchronization or hosted storage. Browsers may deny storage or exhaust quota; the application must show actionable save/recovery errors and never claim a media source is durable when `put()` fails. Asset bytes are not uploaded in the background. The existing `BrowserLocalStorageProjectStore` remains the authoritative project writer; there is no duplicate project table or schema.
