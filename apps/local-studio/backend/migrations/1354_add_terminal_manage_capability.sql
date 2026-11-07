-- Enrolling and managing terminal connections is a distinct capability from executing commands.
INSERT OR IGNORE INTO agentsam_capabilities (capability_key, domain, verb, description, is_mutating, is_active)
VALUES ('terminal.manage', 'terminal', 'manage', 'Enroll and manage terminal connections and instances', 1, 1);
