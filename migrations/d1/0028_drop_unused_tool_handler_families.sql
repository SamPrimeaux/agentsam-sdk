-- No runtime readers or writers depend on agentsam_tool_handler_families.
-- Handler ownership is represented by agentsam_tools.handler_key and the
-- owning plugin's transport/plugin_kind; do not recreate a second registry.
DROP TABLE IF EXISTS agentsam_tool_handler_families;
