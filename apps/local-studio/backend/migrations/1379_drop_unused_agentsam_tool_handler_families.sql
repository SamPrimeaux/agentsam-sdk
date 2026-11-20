-- agentsam-engine: d1
-- Forward-only cleanup: routing is owned by agentsam_tools.handler_key and
-- plugin transport/plugin_kind, not a parallel handler-family registry.
-- Live inspection: two legacy catalog rows; zero runtime or sqlite schema consumers.
-- This does NOT modify agentsam_tools, plugin installations, or tool ownership.
DROP TABLE IF EXISTS agentsam_tool_handler_families;
