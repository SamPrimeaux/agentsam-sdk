#!/usr/bin/env node
if (process.env.CI || process.env.AGENTSAM_SDK_SKIP_POSTINSTALL) process.exit(0);

console.log(`
  @inneranimalmedia/agentsam-sdk — auth portal preview (local, 1:1 IAM HTML):
    npx agentsam identity preview --open
    npm run preview:auth-portal
`);
