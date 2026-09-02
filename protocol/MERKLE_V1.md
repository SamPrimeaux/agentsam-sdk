# AgentSam Merkle format, version 1

This is the SDK's explicit format, not a Git object hash or a claim of compatibility with other Merkle implementations.

All digests are represented as `sha256:` followed by 64 lowercase hexadecimal characters. SHA-256 inputs use a domain prefix followed by payload bytes. `\0` below means one NUL byte, not backslash-plus-zero.

| Node | SHA-256 input |
| --- | --- |
| File | UTF-8 `agentsam-merkle:file:v1\0` + raw file bytes |
| Symlink | UTF-8 `agentsam-merkle:symlink:v1\0` + UTF-8 literal target string |
| Directory | UTF-8 `agentsam-merkle:directory:v1\0` + UTF-8 compact JSON child array |

A directory payload is `[[name,type,hash],...]`, sorted by unsigned UTF-8 bytes of each direct child's name. Types are `file`, `directory`, and `symlink`. JSON uses ECMAScript `JSON.stringify` array/string encoding without whitespace. Each name is one path component; each hash includes the `sha256:` prefix. No locale collation or filename normalization is applied.

Empty non-root directories and ignored entries are omitted. The root is always a directory node, whose path is the empty string. Node paths use `/` between components, are unique, and cannot contain absolute paths, `.`/`..` segments, NUL, backslashes, or drive prefixes. Filenames/targets must round-trip through UTF-8.

A manifest contains `format: "agentsam-merkle"`, `version: 1`, `algorithm: "sha256"`, `rootPath`, `createdAt`, `policy: {include, exclude}`, `rootHash`, `stats`, and a sorted `entries` array. File entries add byte `size`; symlink entries add `target`. Absolute root paths, timestamps, file sizes, and summary stats are metadata outside the root digest. Content hash and size are both recomputed when scanning; loading recomputes summary stats and validates parent relationships and directory hashes. Snapshot loading does not re-read file contents.

The ignore defaults are fixed for version 1 as documented in docs/MERKLE.md. Consumers must compare equivalent policies; an excluded file is outside the integrity claim. A manifest is not signed. Validation checks structure and hash consistency, not baseline authorship. Different line endings or relative names produce different roots even if editors display equivalent text.

## Test vectors

- Empty directory: `sha256:6ce8ca443f3cf6c719c5cb9acc121403addf3f499eefa3db25edacf2c7fe0f94`
- File payload `hello` followed by LF: `sha256:831db02286b8511feabdd6cafb95c311548a91264cb86e4b9cdc56febee5ec72`
- Directory containing only that file as `hello.txt`: `sha256:c63f668abf314a79317d635bb88a31a680d4b8c3549fa5960ea6ce9be930d80f`
