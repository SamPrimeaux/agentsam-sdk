-- agentsam-engine: d1
-- Correct source-vs-shipped capability metadata. The standalone Wizard v3 web
-- runtime has one Cathedral arena; the Robotics Workcell is still being ported
-- from SamPrimeaux/WizardChess3D. Franka is a separate MeauxChess live visual.
UPDATE agentsam_plugins
SET description = 'Play 3D Gothic Cathedral chess with offline AI, local two-player, FEN/PGN and server-authoritative online rooms. Original MeauxChess models and Franka have a separate opt-in visual preview.',
    capabilities_json = '["games.play","chess.single-player-ai","chess.local-two-player","chess.multiplayer","chess.offline-pwa","chess.pgn-fen"]',
    metadata_json = json_set(
      metadata_json,
      '$.arenas', json('["cathedral"]'),
      '$.robotics_workcell_status', 'pending_canonical_v3_integration',
      '$.baroque_visual_preview', 'opt_in',
      '$.franka_visual_preview', 'visual_only_opt_in'
    ),
    updated_at = unixepoch()
WHERE plugin_key = 'inneranimalmedia-wizard-chess-3d'
  AND provider_key = 'inneranimalmedia';

UPDATE agentsam_products
SET description = 'Standalone Gothic Cathedral 3D chess with AI, local two-player and authoritative online rooms; Baroque original GLBs and the Franka visual are being integrated as opt-in previews.',
    metadata = json_set(metadata, '$.robotics_workcell_status', 'pending_canonical_v3_integration'),
    updated_at = unixepoch()
WHERE slug = 'wizard-chess-3d'
  AND kind = 'app';
