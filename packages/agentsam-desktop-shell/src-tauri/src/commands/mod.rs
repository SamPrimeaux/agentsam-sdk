// Core Agent & Daemon Integration
pub mod agentsamd;
pub mod autorag;

// CAD Engine & Geometry Pipeline
pub mod cad;

// Authentication, Security & Identity
pub mod google_desktop_identity;
pub mod keychain;
pub mod local_identity;

// System, LSP & Local Services
pub mod local_content;
pub mod local_lsp;
pub mod local_node;
pub mod local_provider;
pub mod local_sqlite;
pub mod native_capabilities;
pub mod system;

// Shell Utilities & Desktop Hooks
pub mod deep_link;
pub mod updater;
