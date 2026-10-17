# @inneranimalmedia/agentsam-workbench

Portable, framework-neutral AgentSam interaction UI for browser hosts.

This package does **not** own the full AgentSam Chat/Work application or the persistent AgentSam Side Assistant. miniAgentSam is a separate dashboard-wide contextual composer that may hand context/results into those larger surfaces.

The package owns:
- contextual resource selection feedback and positioning
- the compact miniAgentSam composer
- capability selection and attachments
- optional voice and generation-preview hooks
- reusable media workbench primitives

The host owns:
- resource discovery
- resource identity
- authorization
- AgentSam transport/runtime
- persistence and mutations

createMiniAgentSam(host) accepts a host contract with send({ prompt, resource, capabilities, attachments, signal, onPhase }). A DOM selection is context only; the server must authorize every resource and operation.

The composer stays compact when its textarea receives focus. Extra tools are revealed only by an explicit user action.

## Package contracts

- agentsam.app.json — canonical package/application contract.
- .agentsam/app.json — compatibility mirror; it must match the canonical manifest.
- agentsam.feature.json — extracted agentsam.mini-composer feature contract.
- package.json — package version and JavaScript export authority.

Do not encode host routes, tenant IDs, customer names, credentials, or resource bindings in this package.

## Exports

- @inneranimalmedia/agentsam-workbench
- @inneranimalmedia/agentsam-workbench/mini
- @inneranimalmedia/agentsam-workbench/composer
- @inneranimalmedia/agentsam-workbench/media
