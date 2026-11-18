# Temporary security fork — CVE-2026-112366

Source: official npm `picomatch@4.0.7`, original MIT-licensed files and LICENSE retained.
Patch: [micromatch/picomatch PR #238](https://github.com/micromatch/picomatch/pull/238), commit `44f1922`, `lib/parse.js` only.
Scoped package `@inneranimalmedia/picomatch-redos-patched@4.0.8-iam.1` is **IAM-maintained**, NOT published by or endorsed as official upstream 4.0.8.
Reason: GHSA-fc5q-39xc-vjpf has no released fix as of November 18, 2026.

Safeguard: regression tests verify that leading-quantifier repeated extglobs compile to a safe literal; ordinary globs retain behavior. All active npm lockfiles must resolve `picomatch` to the checksum-pinned IAM security fork built from this checked-in source, instead of a vulnerable registry tarball. Do not mark the original advisory withdrawn, and do not disable npm/OSV security scanning. Replace this temporary fork with an official patched release once it has been audited and released.

The upstream PR #238 explicitly notes limitations on related patterns not covered by its fix; this is a *targeted mitigation*, not a guarantee for all possible ReDoS patterns.
