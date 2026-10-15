/**
 * Node-only local SAM execution adapters for CLI/native desktop hosts.
 * Do not import from a browser/Worker bundle: these modules use OS processes.
 * A host must supply trusted identity + its own authorization UI/runtime.
 */
export { createShellSamAdapter, resolveShellSamIdentity } from './shell-host.js';
export { createLocalScriptRuntime, localScriptEnvironment, isLocalBashAvailable } from './adapters/local-script-runtime.js';
export { createLocalScriptStore } from './adapters/local-script-store.js';
