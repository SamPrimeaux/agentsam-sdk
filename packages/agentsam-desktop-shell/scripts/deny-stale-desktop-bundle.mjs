#!/usr/bin/env node
// A native installer must never be produced using a previously staged creative application.
console.error('[desktop-release] bundle:shell-only is disabled: it could package stale CAD, MovieMode, Ecommerce CMS, or SamSketch assets. Run npm run bundle or npm run bundle:app to rebuild and verify all included applications.');
process.exitCode = 1;
