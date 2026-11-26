# File storage v1 — canonical content projection

Status: portable contract and operation service; host integrations pending.

## Ownership

- **Asset authority:** `ContentAsset` (`ast_*`) remains the only logical file/asset identity. `providerRefs` record physical objects; `targetId` resolves an account-authorized physical storage target; variants and content revisions remain canonical.
- **Metadata authority:** an injected `AccountFileMetadata` implementation owned by the host (D1 for hosted, SQLite for native) persists assets, search indexes, usage, revision receipts and trash state. This package creates no competing DB and chooses no binding names.
- **Physical bytes:** `FileByteAdapter` implementations own genuine native filesystem objects, Cloudflare R2 objects, Google Drive objects or other authorized backends. Neither D1 nor SQLite is the default home for large originals. `browser-indexeddb` is explicitly named as a browser storage target, not a native filesystem or an R2 mirror.
- **Storage routing and provider authorization:** there is no universal `connectionId` or storage-target registry. For R2, the host resolves the existing `r2_storage_routes` record (principal + app + purpose) to `r2_buckets`. The bucket row supplies its access mode, binding name and provider-specific OAuth owner/account references; OAuth credentials remain in `user_oauth_tokens`, while Worker bindings are resolved from the host environment. Device and database permissions remain with their existing host authorities.
- **Account preferences:** `user_storage_provider_preferences` records provider preferences; it is not a bucket route or a connection registry. `project_storage` is project-scoped and must not be treated as account-wide routing.
- **Existing asset metadata:** `media_assets` is the provider-neutral media metadata authority; `cms_assets` is site-scoped CMS media; `cms_artifacts` stores immutable implementation artifacts. These are distinct models, not interchangeable file tables.

## Contracts

`FileStorageTarget` identifies account, provider, physical storage kind, active connection, live status and supported operations. An `Asset.providerRefs[]` member with `targetId` identifies an actual provider object at a specific authorized target. `FileRecord` is a view of existing `ContentAsset`, location/permission projections and derivatives; it is **not** another persisted asset model.

`FilePermissions` stores optional file-level policy metadata. The host's mandatory `authorize(operation, asset)` callback **must** validate current authenticated actor, account, grants, provider scopes and permissions, and must not trust fields submitted by clients. Default host authorization is absent, not allow-all. `fileTrash` provides reversible metadata deletion and does not pretend to recover already-purged provider objects.

`createFileStorageService` implements list/search, read, write, copy, move, export, reversible delete and restore on these contracts. Copy/move stream bytes and preserve source bytes until destination write plus account-scoped metadata commit succeeds. Each operation checks actual target and adapter capabilities; operations unavailable on a provider fail explicitly. Export returns a byte stream for the host save/download flow, not a prebuilt download URL.

Metadata changes use `AccountFileMetadata.commit(accountId, expectedRevision, asset, revision)`. Implementations MUST atomically:

1. Require authenticated account equality, using account-scoped DB predicates.
2. Verify existing `fileRevision` (legacy unset means zero), fail on mismatch.
3. Persist updated metadata and revision receipt in the same D1/SQLite transaction.
4. Ensure `list` and `search` query by account, filter trash unless `includeDeleted`, return a trustworthy cursor and total, and never reveal other account records.

An authorization decision or UI's Connected badge is not proof of valid byte access; host adapters perform the actual backend calls using authorized connection state. Remote cloud copies never silently become native local copies.

## Migration / compatibility

Existing `ContentAsset.providerRefs` lacking `targetId` remain readable by legacy content systems; the file service deliberately does **not** guess which customer bucket or device holds them. Hosts must resolve and attach a valid `targetId` using verified connection and provider context before file-level actions. This prevents ambiguous bucket selection and cross-account routing. Existing CoPro IndexedDB media and legacy browser assets remain intact; no automatic destructive migration is run by this package.

## Remaining host implementation gates (Phase 2+)

- Native: bind the Tauri `LocalContentHost` and real writable/streamable file operations. Current desktop base64 `read` has a 32 MB limit; use a bounded streaming transport for large originals.
- Hosted: bind real R2 read/write/list/delete operations using installation-resolved storage roles (for example, runtime-controlled `WEBSITE_ASSETS`); bind Google Drive with authorized OAuth scopes and token refresh, never hardcoded account IDs.
- Metadata: implement the atomic `AccountFileMetadata` port over the correct D1/SQLite schema; durable account permission and revision authorization tests are required.
- UI: wire Settings → Storage to actual account targets and permissions; wire Work/Library grid/list, source search, exports and fallback states. Do not display speculative connected targets.
- Verification: test real original-byte round trips, multi-chunk export, cross-session restore, mobile/browser limitations, cloud auth expiry, move interruption and provider quota failures before declaring the application released.

## Current acceptance evidence

`packages/agentsam-content/tests/file-service.test.ts` tests metadata projection, cross-provider streaming, search, export, reversible trash, scope/authorization errors and failed-destination move behavior using test-only byte stores. Production provider adapters are not claimed by those tests.
