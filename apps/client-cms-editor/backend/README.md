# CMS backend bridge

This workspace package is the portable CMS client/backend boundary: HTTP API calls, model mapping, routing, preview messages and storefront URL helpers. It does not own the platform CMS server implementation or identity authority.

The current platform implementation remains `inneranimalmedia/src/core/agentsam/cms/` until it is extracted into reusable `agentsam-cms-*` packages.
