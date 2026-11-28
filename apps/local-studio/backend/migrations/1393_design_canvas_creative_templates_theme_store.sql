-- Move Design Canvas creative stock from the generic IAM assets bucket into the canonical platform theme-store bucket.
-- All 55 destination objects were fetched back and SHA-256 verified before this migration was authored.
-- studio_templates remains the single creative catalog; no second template registry is introduced.

UPDATE studio_templates
   SET payload_bucket_id = 'r2_platform_theme_store',
       payload_r2_key = CASE id
  WHEN 'tpl_dc_image_advertisement_v1' THEN 'templates/creative/design-canvas/image-generation/v1/advertisement_v1.json'
  WHEN 'tpl_dc_image_app_icon_system_v1' THEN 'templates/creative/design-canvas/image-generation/v1/app_icon_system_v1.json'
  WHEN 'tpl_dc_image_app_mockup_v1' THEN 'templates/creative/design-canvas/image-generation/v1/app_mockup_v1.json'
  WHEN 'tpl_dc_image_blueprint_poster_v1' THEN 'templates/creative/design-canvas/image-generation/v1/blueprint_poster_v1.json'
  WHEN 'tpl_dc_image_book_cover_v1' THEN 'templates/creative/design-canvas/image-generation/v1/book_cover_v1.json'
  WHEN 'tpl_dc_image_designer_toy_v1' THEN 'templates/creative/design-canvas/image-generation/v1/designer_toy_v1.json'
  WHEN 'tpl_dc_image_educational_cutaway_v1' THEN 'templates/creative/design-canvas/image-generation/v1/educational_cutaway_v1.json'
  WHEN 'tpl_dc_image_flyer_v1' THEN 'templates/creative/design-canvas/image-generation/v1/flyer_v1.json'
  WHEN 'tpl_dc_image_headshot_v1' THEN 'templates/creative/design-canvas/image-generation/v1/headshot_v1.json'
  WHEN 'tpl_dc_image_icon_set_v1' THEN 'templates/creative/design-canvas/image-generation/v1/icon_set_v1.json'
  WHEN 'tpl_dc_image_illustration_v1' THEN 'templates/creative/design-canvas/image-generation/v1/illustration_v1.json'
  WHEN 'tpl_dc_image_infographic_v1' THEN 'templates/creative/design-canvas/image-generation/v1/infographic_v1.json'
  WHEN 'tpl_dc_image_interior_design_v1' THEN 'templates/creative/design-canvas/image-generation/v1/interior_design_v1.json'
  WHEN 'tpl_dc_image_logo_options_v1' THEN 'templates/creative/design-canvas/image-generation/v1/logo_options_v1.json'
  WHEN 'tpl_dc_image_merchandise_v1' THEN 'templates/creative/design-canvas/image-generation/v1/merchandise_v1.json'
  WHEN 'tpl_dc_image_packaging_v1' THEN 'templates/creative/design-canvas/image-generation/v1/packaging_v1.json'
  WHEN 'tpl_dc_image_poster_v1' THEN 'templates/creative/design-canvas/image-generation/v1/poster_v1.json'
  WHEN 'tpl_dc_image_product_photograph_v1' THEN 'templates/creative/design-canvas/image-generation/v1/product_photograph_v1.json'
  WHEN 'tpl_dc_image_thumbnail_v1' THEN 'templates/creative/design-canvas/image-generation/v1/thumbnail_v1.json'
  WHEN 'tpl_dc_image_typeface_logo_system_v1' THEN 'templates/creative/design-canvas/image-generation/v1/typeface_logo_system_v1.json'
  WHEN 'tpl_dc_image_website_mockup_v1' THEN 'templates/creative/design-canvas/image-generation/v1/website_mockup_v1.json'
  WHEN 'tpl_dc_app_icon_system_deck_v1' THEN 'templates/creative/design-canvas/presentations/app-icon-system/v1/presentation.json'
  WHEN 'tpl_dc_brand_guidelines_deck_v1' THEN 'templates/creative/design-canvas/presentations/brand-guidelines/v1/presentation.json'
  WHEN 'tpl_dc_navigation_ownership_map_v1' THEN 'templates/creative/design-canvas/presentations/navigation-ownership-interaction-map/v1/presentation.json'
  WHEN 'tpl_dc_photography_portfolio_deck_v1' THEN 'templates/creative/design-canvas/presentations/photography-portfolio/v1/presentation.json'
  WHEN 'tpl_dc_typeface_logo_system_deck_v1' THEN 'templates/creative/design-canvas/presentations/typeface-logo-system/v1/presentation.json'
  WHEN 'tpl_dc_app_icon_colorways_slide_v1' THEN 'templates/creative/design-canvas/slides/app-icon-system/v1/02-color-system.json'
  WHEN 'tpl_dc_app_icon_master_slide_v1' THEN 'templates/creative/design-canvas/slides/app-icon-system/v1/01-master-geometry.json'
  WHEN 'tpl_dc_brand_color_palette_v1' THEN 'templates/creative/design-canvas/slides/brand-guidelines/v1/03-color-palette.json'
  WHEN 'tpl_dc_brand_cover_v1' THEN 'templates/creative/design-canvas/slides/brand-guidelines/v1/01-brand-cover.json'
  WHEN 'tpl_dc_brand_iconography_v1' THEN 'templates/creative/design-canvas/slides/brand-guidelines/v1/05-iconography.json'
  WHEN 'tpl_dc_brand_logo_system_v1' THEN 'templates/creative/design-canvas/slides/brand-guidelines/v1/02-logo-system.json'
  WHEN 'tpl_dc_brand_photo_gallery_v1' THEN 'templates/creative/design-canvas/slides/brand-guidelines/v2/06-photo-gallery.json'
  WHEN 'tpl_dc_brand_typography_v1' THEN 'templates/creative/design-canvas/slides/brand-guidelines/v1/04-typography.json'
  WHEN 'tpl_dc_navigation_acceptance_gate_v1' THEN 'templates/creative/design-canvas/slides/navigation-ownership-interaction-map/v1/06-acceptance-gate.json'
  WHEN 'tpl_dc_navigation_component_ownership_v1' THEN 'templates/creative/design-canvas/slides/navigation-ownership-interaction-map/v1/02-component-ownership.json'
  WHEN 'tpl_dc_navigation_decision_log_v1' THEN 'templates/creative/design-canvas/slides/navigation-ownership-interaction-map/v1/05-decision-log.json'
  WHEN 'tpl_dc_navigation_interaction_flow_v1' THEN 'templates/creative/design-canvas/slides/navigation-ownership-interaction-map/v1/03-interaction-flow.json'
  WHEN 'tpl_dc_navigation_responsive_comparison_v1' THEN 'templates/creative/design-canvas/slides/navigation-ownership-interaction-map/v1/04-responsive-comparison.json'
  WHEN 'tpl_dc_navigation_surface_profile_v1' THEN 'templates/creative/design-canvas/slides/navigation-ownership-interaction-map/v1/01-surface-profile.json'
  WHEN 'tpl_dc_photo_editorial_text_image_v1' THEN 'templates/creative/design-canvas/slides/photography-portfolio/v1/05-editorial-text-image.json'
  WHEN 'tpl_dc_photo_image_left_editorial_v1' THEN 'templates/creative/design-canvas/slides/photography-portfolio/v1/04-image-left-editorial.json'
  WHEN 'tpl_dc_photo_portfolio_cover_v1' THEN 'templates/creative/design-canvas/slides/photography-portfolio/v1/01-portfolio-cover.json'
  WHEN 'tpl_dc_photo_portrait_gallery_v1' THEN 'templates/creative/design-canvas/slides/photography-portfolio/v1/03-portrait-gallery.json'
  WHEN 'tpl_dc_photo_section_agenda_v1' THEN 'templates/creative/design-canvas/slides/photography-portfolio/v1/02-section-agenda.json'
  WHEN 'tpl_dc_photo_shoot_schedule_v1' THEN 'templates/creative/design-canvas/slides/photography-portfolio/v1/06-photoshoot-schedule.json'
  WHEN 'tpl_dc_typeface_logo_applications_slide_v1' THEN 'templates/creative/design-canvas/slides/typeface-logo-system/v1/02-logotype-applications.json'
  WHEN 'tpl_dc_typeface_logo_specimen_slide_v1' THEN 'templates/creative/design-canvas/slides/typeface-logo-system/v1/01-letterform-system.json'
  ELSE payload_r2_key END,
       payload_sha256 = CASE id
  WHEN 'tpl_dc_image_advertisement_v1' THEN 'f185f480a1199fb4450c527298ed02935080f85ffd7301226ea1dccae2fe9b73'
  WHEN 'tpl_dc_image_app_icon_system_v1' THEN '9576867728363d2799a3aecf1d70aa1b9fbbfca2d367f92a8e28e7941d95f09c'
  WHEN 'tpl_dc_image_app_mockup_v1' THEN '6382ef6f5d64cd4d33ce2a9aba4e47d5a3a53701216715aa38e4947dd115a4fc'
  WHEN 'tpl_dc_image_blueprint_poster_v1' THEN '4f0ee899c3587f9dea87f807a3a82ecd6f26f9a6a43ce29992776be3dde31369'
  WHEN 'tpl_dc_image_book_cover_v1' THEN '2a36e2160230286247298b3199f406c6ae8c3153213351572a0f57b707d80748'
  WHEN 'tpl_dc_image_designer_toy_v1' THEN 'cdb3f09e0588efec1ee1503beffb18f8d63315f0e07f4af6eed3d2d25adbbfeb'
  WHEN 'tpl_dc_image_educational_cutaway_v1' THEN '69afa3699297af90888e373476d81045b366ea4f9ba4f8f06791c65a7816c1c6'
  WHEN 'tpl_dc_image_flyer_v1' THEN '77a2d36c5cc9c5b97e7de632f4e4b3b31e7d53653370568a6d099ab74a68e0e4'
  WHEN 'tpl_dc_image_headshot_v1' THEN 'ff6d67aa638489901a54e2ff08113c7d54dc144b48924a0977c7e1d4ad128703'
  WHEN 'tpl_dc_image_icon_set_v1' THEN '869cbc14500167f45efad48ff92b694f55cc15ffa5ff536f2fae43a3898e1ca6'
  WHEN 'tpl_dc_image_illustration_v1' THEN '4b13c3ccfea4cbd5f84475f2cecf43872cad73fc3bd5031a0357c0f0005f78bd'
  WHEN 'tpl_dc_image_infographic_v1' THEN '5ea50acc959c8bd63ab0a9c9b1b1c33e3bb5e31d079d6a5948ad4c2b467368a5'
  WHEN 'tpl_dc_image_interior_design_v1' THEN 'b28229315897b0ce3ab84fd2626dfbd06fefe2578afeedc677fd409c231ae4bf'
  WHEN 'tpl_dc_image_logo_options_v1' THEN '6a82ec9c67050640bc6d70ad6de1fe6032f101f93587a6c5676a5b1f06769fd1'
  WHEN 'tpl_dc_image_merchandise_v1' THEN '68c117e275ae1f1c1b0e0734738af2b893e1898775eba939308bff8efdee14b9'
  WHEN 'tpl_dc_image_packaging_v1' THEN '08a213a58292caf6e64a7a7ef38b47a2432ebb62f0d76d4df670b4cc6f5b81e0'
  WHEN 'tpl_dc_image_poster_v1' THEN 'd69976c875f7e75c71ad093b18f0c723d3392251daef57ed16a53ac451eaae93'
  WHEN 'tpl_dc_image_product_photograph_v1' THEN 'bd13b5a17fd3a0fd92b3b80aacadf932a3900031b28aaa625eea8a10c231b175'
  WHEN 'tpl_dc_image_thumbnail_v1' THEN 'c979fb0d4f1ea380f5f88c8570a4724a6c03d19915916c64c4597cd1aacea518'
  WHEN 'tpl_dc_image_typeface_logo_system_v1' THEN 'caa8b4a902eed17b43b3456c2f414118c83ae1512e686d98a5d42bf45d4954be'
  WHEN 'tpl_dc_image_website_mockup_v1' THEN '34d70896874174c65742a4ce2ec44ea3c3bd47c38549da6ee22dbdd74b73bc3c'
  WHEN 'tpl_dc_app_icon_system_deck_v1' THEN '7c4d5fa998025692b47ee38114275ebf81daf307b385685ced86778beb6eef50'
  WHEN 'tpl_dc_brand_guidelines_deck_v1' THEN 'e50daec2bee901a15f8500722402c044fdaa666d96aaf6c78a395d05e8809deb'
  WHEN 'tpl_dc_navigation_ownership_map_v1' THEN '2e83ced22099b405de4c02691a588645fb8301167a78dfbd0094eaaae1f456a7'
  WHEN 'tpl_dc_photography_portfolio_deck_v1' THEN 'fac28c4d9144cbf9b857c4b15f5bd42334c623fd08a6df3e442dfcd7b0cc364c'
  WHEN 'tpl_dc_typeface_logo_system_deck_v1' THEN 'f389633843f07082471af4f92038605a3511e346bd3b570747c12bb24994b646'
  WHEN 'tpl_dc_app_icon_colorways_slide_v1' THEN '1013e6612ff8a260152cedb244f35679f7ba613830b7a52b2b086e2b9dacad6a'
  WHEN 'tpl_dc_app_icon_master_slide_v1' THEN 'b35ca14882fc6a8b755f4e08746b9f3283de023ea88f786ca798df21c1539c06'
  WHEN 'tpl_dc_brand_color_palette_v1' THEN 'f43a5a7637eeb2a3c3076c946242915791f5b3dff1bca37e346285d44c8f8efd'
  WHEN 'tpl_dc_brand_cover_v1' THEN 'b9b3940ee99b43685126119b0f3e74e434142f81ce290116b02922d05ce04429'
  WHEN 'tpl_dc_brand_iconography_v1' THEN '36b418edd7a04ebd62218a97f316a60c5e5540c2c9734b1e03951263a0aef04c'
  WHEN 'tpl_dc_brand_logo_system_v1' THEN 'b780cd3e547b9d67206c08c8643606b2e89d8b69600a510f0f7ae51c2cbe8862'
  WHEN 'tpl_dc_brand_photo_gallery_v1' THEN '9ec45d9812909020ef1de8022b8976fce8a56a3c2cb9b0e3d3a231d4c9604033'
  WHEN 'tpl_dc_brand_typography_v1' THEN 'a350cc0b15ad87d91d6a7c3349230ec83eeec311e1ee37a3ace83ea529cace0d'
  WHEN 'tpl_dc_navigation_acceptance_gate_v1' THEN '3ab1a84f1c1f12336efe12244486a60254579f73a061b4a461d076de9a01875b'
  WHEN 'tpl_dc_navigation_component_ownership_v1' THEN '3d43f034b505d76cb6aa0d64551d8c499a3c828dc2c6ad87d76b60b0f33e6ee5'
  WHEN 'tpl_dc_navigation_decision_log_v1' THEN '25afddcef17c7aa724411a56c64eca3f05f2353f74ce0bce30e15e3347d05f42'
  WHEN 'tpl_dc_navigation_interaction_flow_v1' THEN 'f105e41c2e82d3a675c16b86c0472177c4205799a8f414998ca93b3202fa44b5'
  WHEN 'tpl_dc_navigation_responsive_comparison_v1' THEN 'f24c3c08459da22eae60c0b4ee376d97deae40de1e3d34697b9d29adcbccea9f'
  WHEN 'tpl_dc_navigation_surface_profile_v1' THEN '1c766fcd937d8bada232360de0b2ab31b9177097a7cc6e66e991362b6c9c0065'
  WHEN 'tpl_dc_photo_editorial_text_image_v1' THEN '004bdd4fa0f37b9f9a87f2ed43f9d4192805c2756e63e1187f0e342ae681adcf'
  WHEN 'tpl_dc_photo_image_left_editorial_v1' THEN '9e54f851d45d3a34a6b13f2fbcc6d98e2840abe9fa6adf81b7cc013b37789f76'
  WHEN 'tpl_dc_photo_portfolio_cover_v1' THEN '3b7354934f20529a0f179fbf7381106cd80fcd750ec2e4680bc11e6e535be4d7'
  WHEN 'tpl_dc_photo_portrait_gallery_v1' THEN 'fa6996f3358ee3561494b31aaa92e03ac9d3b5d38bee573bc2d19073369531be'
  WHEN 'tpl_dc_photo_section_agenda_v1' THEN '7c68e1fc12302ddc9edadb1e7d87124935cb9e097437a2d88ce3fa6f608eb187'
  WHEN 'tpl_dc_photo_shoot_schedule_v1' THEN '91a24176eee42a539e4bc8cc1219397c0307958b5ee69bb75de8c16d5d29f0e0'
  WHEN 'tpl_dc_typeface_logo_applications_slide_v1' THEN '039a56cd1a86de7802bbea1dd9230ba09e913bc620d8d6ce4f1c328fafe7fe00'
  WHEN 'tpl_dc_typeface_logo_specimen_slide_v1' THEN 'db3d960189ef66ed96e98ee70691cd3a62f5a72eeb233ea710cc6a380a5fa7ef'
  ELSE payload_sha256 END,
       updated_at = unixepoch()
 WHERE app_id = 'design-canvas'
   AND id IN ('tpl_dc_image_advertisement_v1', 'tpl_dc_image_app_icon_system_v1', 'tpl_dc_image_app_mockup_v1', 'tpl_dc_image_blueprint_poster_v1', 'tpl_dc_image_book_cover_v1', 'tpl_dc_image_designer_toy_v1', 'tpl_dc_image_educational_cutaway_v1', 'tpl_dc_image_flyer_v1', 'tpl_dc_image_headshot_v1', 'tpl_dc_image_icon_set_v1', 'tpl_dc_image_illustration_v1', 'tpl_dc_image_infographic_v1', 'tpl_dc_image_interior_design_v1', 'tpl_dc_image_logo_options_v1', 'tpl_dc_image_merchandise_v1', 'tpl_dc_image_packaging_v1', 'tpl_dc_image_poster_v1', 'tpl_dc_image_product_photograph_v1', 'tpl_dc_image_thumbnail_v1', 'tpl_dc_image_typeface_logo_system_v1', 'tpl_dc_image_website_mockup_v1', 'tpl_dc_app_icon_system_deck_v1', 'tpl_dc_brand_guidelines_deck_v1', 'tpl_dc_navigation_ownership_map_v1', 'tpl_dc_photography_portfolio_deck_v1', 'tpl_dc_typeface_logo_system_deck_v1', 'tpl_dc_app_icon_colorways_slide_v1', 'tpl_dc_app_icon_master_slide_v1', 'tpl_dc_brand_color_palette_v1', 'tpl_dc_brand_cover_v1', 'tpl_dc_brand_iconography_v1', 'tpl_dc_brand_logo_system_v1', 'tpl_dc_brand_photo_gallery_v1', 'tpl_dc_brand_typography_v1', 'tpl_dc_navigation_acceptance_gate_v1', 'tpl_dc_navigation_component_ownership_v1', 'tpl_dc_navigation_decision_log_v1', 'tpl_dc_navigation_interaction_flow_v1', 'tpl_dc_navigation_responsive_comparison_v1', 'tpl_dc_navigation_surface_profile_v1', 'tpl_dc_photo_editorial_text_image_v1', 'tpl_dc_photo_image_left_editorial_v1', 'tpl_dc_photo_portfolio_cover_v1', 'tpl_dc_photo_portrait_gallery_v1', 'tpl_dc_photo_section_agenda_v1', 'tpl_dc_photo_shoot_schedule_v1', 'tpl_dc_typeface_logo_applications_slide_v1', 'tpl_dc_typeface_logo_specimen_slide_v1');

UPDATE studio_templates
   SET preview_bucket_id = 'r2_platform_theme_store',
       preview_r2_key = 'previews/templates/creative/design-canvas/presentations/navigation-ownership-interaction-map/v1/cover.png',
       updated_at = unixepoch()
 WHERE id = 'tpl_dc_navigation_ownership_map_v1' AND app_id = 'design-canvas';

INSERT OR IGNORE INTO studio_templates (
  id, sku, app_id, resource_kind, pack_slug, pack_title, category, title, description, use_case,
  tags_json, specs_json, payload_bucket_id, payload_r2_key, payload_sha256, payload_schema_uri,
  preview_bucket_id, preview_r2_key, renderer_key, compatible_apps_json, source_refs_json, version, status, sort_order
) VALUES (
  'tpl_dc_page_todo_v1', 'DC-PAGE-TO-DO-LIST', 'design-canvas', 'page_template', 'productivity-starters', 'Productivity Starters', 'productivity', 'To-do List', 'An editable task list with an empty checklist and an AgentSam handoff for context-aware task discovery.', 'Start a living to-do list. Ask AgentSam to find relevant tasks without inventing work or overwriting your edits.', '["design-canvas","pages","page-starter","productivity","checklist"]', '{"document_type":"page","document_engine":"PageDocument","template_role":"page","scaffold":{"editable":true,"stock_images":false}}', 'r2_platform_theme_store', 'templates/creative/design-canvas/pages/to-do-list/v1/page.json', 'fa5049fa01b00d20f6243d70b4eac8b8f188f9903f35da3a30c317614bc390f6', 'https://schemas.inneranimalmedia.com/design-canvas/page-document/v1.schema.json', 'r2_platform_theme_store', 'previews/templates/creative/design-canvas/pages/to-do-list/v1/preview.svg', 'design-canvas.page', '["design-canvas"]', '[]', 1, 'active', 1
);

INSERT OR IGNORE INTO studio_templates (
  id, sku, app_id, resource_kind, pack_slug, pack_title, category, title, description, use_case,
  tags_json, specs_json, payload_bucket_id, payload_r2_key, payload_sha256, payload_schema_uri,
  preview_bucket_id, preview_r2_key, renderer_key, compatible_apps_json, source_refs_json, version, status, sort_order
) VALUES (
  'tpl_dc_document_project_brief_v1', 'DC-DOCUMENT-PROJECT-BRIEF', 'design-canvas', 'document_template', 'productivity-starters', 'Productivity Starters', 'productivity', 'Project Brief', 'A structured, editable project brief with sections for overview, goals, audience, scope, constraints and open questions.', 'Develop a concise, reusable brief for a product, project or initiative.', '["design-canvas","documents","document-starter","productivity","project-brief"]', '{"document_type":"document","document_engine":"TextDocument","template_role":"document","scaffold":{"editable":true,"stock_images":false}}', 'r2_platform_theme_store', 'templates/creative/design-canvas/documents/project-brief/v1/document.json', '3aec9ee104aae176ac4dddad77119a820defa25a69def77ddf06fd26c1db8b9c', 'https://schemas.inneranimalmedia.com/design-canvas/document/v1.schema.json', 'r2_platform_theme_store', 'previews/templates/creative/design-canvas/documents/project-brief/v1/preview.svg', 'design-canvas.document', '["design-canvas"]', '[]', 1, 'active', 1
);

INSERT OR IGNORE INTO studio_templates (
  id, sku, app_id, resource_kind, pack_slug, pack_title, category, title, description, use_case,
  tags_json, specs_json, payload_bucket_id, payload_r2_key, payload_sha256, payload_schema_uri,
  preview_bucket_id, preview_r2_key, renderer_key, compatible_apps_json, source_refs_json, version, status, sort_order
) VALUES (
  'tpl_dc_spreadsheet_project_tracker_v1', 'DC-SPREADSHEET-PROJECT-TRACKER', 'design-canvas', 'spreadsheet_template', 'productivity-starters', 'Productivity Starters', 'productivity', 'Project Tracker', 'An editable project tracker with task, owner, status, priority, due date and notes columns.', 'Track project work in a structured sheet, add rows and columns, edit cells and calculate summary metrics.', '["design-canvas","sheets","spreadsheet-starter","productivity","project-tracker"]', '{"document_type":"spreadsheet","document_engine":"SpreadsheetDocument","template_role":"spreadsheet","sheet_count":1,"column_count":6,"scaffold":{"editable":true}}', 'r2_platform_theme_store', 'templates/creative/design-canvas/spreadsheets/project-tracker/v1/spreadsheet.json', '1b7047a0a7c2171c58be887cfa48c3c175f82031d55bcfa50a935133040119e1', 'https://schemas.inneranimalmedia.com/design-canvas/spreadsheet/v1.schema.json', 'r2_platform_theme_store', 'previews/templates/creative/design-canvas/spreadsheets/project-tracker/v1/preview.svg', 'design-canvas.spreadsheet', '["design-canvas"]', '[]', 1, 'active', 1
);

-- Move the existing cached object records with their template rows. This also repairs the stale Photo Gallery v1 cache key to the catalog's v2 payload.
UPDATE r2_objects
   SET bucket_id = 'r2_platform_theme_store',
       object_key = (SELECT s.payload_r2_key FROM studio_templates s WHERE s.id = json_extract(r2_objects.metadata_json, '$.studio_template_id')),
       content_type = 'application/json',
       file_size = CASE json_extract(metadata_json, '$.studio_template_id')
         WHEN 'tpl_dc_image_advertisement_v1' THEN 763
         WHEN 'tpl_dc_image_app_icon_system_v1' THEN 2565
         WHEN 'tpl_dc_image_app_mockup_v1' THEN 1402
         WHEN 'tpl_dc_image_blueprint_poster_v1' THEN 700
         WHEN 'tpl_dc_image_book_cover_v1' THEN 760
         WHEN 'tpl_dc_image_designer_toy_v1' THEN 852
         WHEN 'tpl_dc_image_educational_cutaway_v1' THEN 585
         WHEN 'tpl_dc_image_flyer_v1' THEN 740
         WHEN 'tpl_dc_image_headshot_v1' THEN 689
         WHEN 'tpl_dc_image_icon_set_v1' THEN 1161
         WHEN 'tpl_dc_image_illustration_v1' THEN 624
         WHEN 'tpl_dc_image_infographic_v1' THEN 643
         WHEN 'tpl_dc_image_interior_design_v1' THEN 689
         WHEN 'tpl_dc_image_logo_options_v1' THEN 1224
         WHEN 'tpl_dc_image_merchandise_v1' THEN 731
         WHEN 'tpl_dc_image_packaging_v1' THEN 805
         WHEN 'tpl_dc_image_poster_v1' THEN 694
         WHEN 'tpl_dc_image_product_photograph_v1' THEN 730
         WHEN 'tpl_dc_image_thumbnail_v1' THEN 691
         WHEN 'tpl_dc_image_typeface_logo_system_v1' THEN 2658
         WHEN 'tpl_dc_image_website_mockup_v1' THEN 714
         WHEN 'tpl_dc_app_icon_system_deck_v1' THEN 13951
         WHEN 'tpl_dc_brand_guidelines_deck_v1' THEN 20936
         WHEN 'tpl_dc_navigation_ownership_map_v1' THEN 45198
         WHEN 'tpl_dc_photography_portfolio_deck_v1' THEN 16498
         WHEN 'tpl_dc_typeface_logo_system_deck_v1' THEN 11495
         WHEN 'tpl_dc_app_icon_colorways_slide_v1' THEN 7950
         WHEN 'tpl_dc_app_icon_master_slide_v1' THEN 6038
         WHEN 'tpl_dc_brand_color_palette_v1' THEN 3469
         WHEN 'tpl_dc_brand_cover_v1' THEN 2927
         WHEN 'tpl_dc_brand_iconography_v1' THEN 4192
         WHEN 'tpl_dc_brand_logo_system_v1' THEN 3553
         WHEN 'tpl_dc_brand_photo_gallery_v1' THEN 1406
         WHEN 'tpl_dc_brand_typography_v1' THEN 3695
         WHEN 'tpl_dc_navigation_acceptance_gate_v1' THEN 9182
         WHEN 'tpl_dc_navigation_component_ownership_v1' THEN 8210
         WHEN 'tpl_dc_navigation_decision_log_v1' THEN 5606
         WHEN 'tpl_dc_navigation_interaction_flow_v1' THEN 8649
         WHEN 'tpl_dc_navigation_responsive_comparison_v1' THEN 5868
         WHEN 'tpl_dc_navigation_surface_profile_v1' THEN 5721
         WHEN 'tpl_dc_photo_editorial_text_image_v1' THEN 1624
         WHEN 'tpl_dc_photo_image_left_editorial_v1' THEN 1828
         WHEN 'tpl_dc_photo_portfolio_cover_v1' THEN 2732
         WHEN 'tpl_dc_photo_portrait_gallery_v1' THEN 2425
         WHEN 'tpl_dc_photo_section_agenda_v1' THEN 3187
         WHEN 'tpl_dc_photo_shoot_schedule_v1' THEN 4887
         WHEN 'tpl_dc_typeface_logo_applications_slide_v1' THEN 3177
         WHEN 'tpl_dc_typeface_logo_specimen_slide_v1' THEN 8355
         WHEN 'tpl_dc_page_todo_v1' THEN 792
         WHEN 'tpl_dc_document_project_brief_v1' THEN 1523
         WHEN 'tpl_dc_spreadsheet_project_tracker_v1' THEN 2135
         ELSE file_size END,
       checksum = CASE json_extract(metadata_json, '$.studio_template_id')
         WHEN 'tpl_dc_image_advertisement_v1' THEN 'f185f480a1199fb4450c527298ed02935080f85ffd7301226ea1dccae2fe9b73'
         WHEN 'tpl_dc_image_app_icon_system_v1' THEN '9576867728363d2799a3aecf1d70aa1b9fbbfca2d367f92a8e28e7941d95f09c'
         WHEN 'tpl_dc_image_app_mockup_v1' THEN '6382ef6f5d64cd4d33ce2a9aba4e47d5a3a53701216715aa38e4947dd115a4fc'
         WHEN 'tpl_dc_image_blueprint_poster_v1' THEN '4f0ee899c3587f9dea87f807a3a82ecd6f26f9a6a43ce29992776be3dde31369'
         WHEN 'tpl_dc_image_book_cover_v1' THEN '2a36e2160230286247298b3199f406c6ae8c3153213351572a0f57b707d80748'
         WHEN 'tpl_dc_image_designer_toy_v1' THEN 'cdb3f09e0588efec1ee1503beffb18f8d63315f0e07f4af6eed3d2d25adbbfeb'
         WHEN 'tpl_dc_image_educational_cutaway_v1' THEN '69afa3699297af90888e373476d81045b366ea4f9ba4f8f06791c65a7816c1c6'
         WHEN 'tpl_dc_image_flyer_v1' THEN '77a2d36c5cc9c5b97e7de632f4e4b3b31e7d53653370568a6d099ab74a68e0e4'
         WHEN 'tpl_dc_image_headshot_v1' THEN 'ff6d67aa638489901a54e2ff08113c7d54dc144b48924a0977c7e1d4ad128703'
         WHEN 'tpl_dc_image_icon_set_v1' THEN '869cbc14500167f45efad48ff92b694f55cc15ffa5ff536f2fae43a3898e1ca6'
         WHEN 'tpl_dc_image_illustration_v1' THEN '4b13c3ccfea4cbd5f84475f2cecf43872cad73fc3bd5031a0357c0f0005f78bd'
         WHEN 'tpl_dc_image_infographic_v1' THEN '5ea50acc959c8bd63ab0a9c9b1b1c33e3bb5e31d079d6a5948ad4c2b467368a5'
         WHEN 'tpl_dc_image_interior_design_v1' THEN 'b28229315897b0ce3ab84fd2626dfbd06fefe2578afeedc677fd409c231ae4bf'
         WHEN 'tpl_dc_image_logo_options_v1' THEN '6a82ec9c67050640bc6d70ad6de1fe6032f101f93587a6c5676a5b1f06769fd1'
         WHEN 'tpl_dc_image_merchandise_v1' THEN '68c117e275ae1f1c1b0e0734738af2b893e1898775eba939308bff8efdee14b9'
         WHEN 'tpl_dc_image_packaging_v1' THEN '08a213a58292caf6e64a7a7ef38b47a2432ebb62f0d76d4df670b4cc6f5b81e0'
         WHEN 'tpl_dc_image_poster_v1' THEN 'd69976c875f7e75c71ad093b18f0c723d3392251daef57ed16a53ac451eaae93'
         WHEN 'tpl_dc_image_product_photograph_v1' THEN 'bd13b5a17fd3a0fd92b3b80aacadf932a3900031b28aaa625eea8a10c231b175'
         WHEN 'tpl_dc_image_thumbnail_v1' THEN 'c979fb0d4f1ea380f5f88c8570a4724a6c03d19915916c64c4597cd1aacea518'
         WHEN 'tpl_dc_image_typeface_logo_system_v1' THEN 'caa8b4a902eed17b43b3456c2f414118c83ae1512e686d98a5d42bf45d4954be'
         WHEN 'tpl_dc_image_website_mockup_v1' THEN '34d70896874174c65742a4ce2ec44ea3c3bd47c38549da6ee22dbdd74b73bc3c'
         WHEN 'tpl_dc_app_icon_system_deck_v1' THEN '7c4d5fa998025692b47ee38114275ebf81daf307b385685ced86778beb6eef50'
         WHEN 'tpl_dc_brand_guidelines_deck_v1' THEN 'e50daec2bee901a15f8500722402c044fdaa666d96aaf6c78a395d05e8809deb'
         WHEN 'tpl_dc_navigation_ownership_map_v1' THEN '2e83ced22099b405de4c02691a588645fb8301167a78dfbd0094eaaae1f456a7'
         WHEN 'tpl_dc_photography_portfolio_deck_v1' THEN 'fac28c4d9144cbf9b857c4b15f5bd42334c623fd08a6df3e442dfcd7b0cc364c'
         WHEN 'tpl_dc_typeface_logo_system_deck_v1' THEN 'f389633843f07082471af4f92038605a3511e346bd3b570747c12bb24994b646'
         WHEN 'tpl_dc_app_icon_colorways_slide_v1' THEN '1013e6612ff8a260152cedb244f35679f7ba613830b7a52b2b086e2b9dacad6a'
         WHEN 'tpl_dc_app_icon_master_slide_v1' THEN 'b35ca14882fc6a8b755f4e08746b9f3283de023ea88f786ca798df21c1539c06'
         WHEN 'tpl_dc_brand_color_palette_v1' THEN 'f43a5a7637eeb2a3c3076c946242915791f5b3dff1bca37e346285d44c8f8efd'
         WHEN 'tpl_dc_brand_cover_v1' THEN 'b9b3940ee99b43685126119b0f3e74e434142f81ce290116b02922d05ce04429'
         WHEN 'tpl_dc_brand_iconography_v1' THEN '36b418edd7a04ebd62218a97f316a60c5e5540c2c9734b1e03951263a0aef04c'
         WHEN 'tpl_dc_brand_logo_system_v1' THEN 'b780cd3e547b9d67206c08c8643606b2e89d8b69600a510f0f7ae51c2cbe8862'
         WHEN 'tpl_dc_brand_photo_gallery_v1' THEN '9ec45d9812909020ef1de8022b8976fce8a56a3c2cb9b0e3d3a231d4c9604033'
         WHEN 'tpl_dc_brand_typography_v1' THEN 'a350cc0b15ad87d91d6a7c3349230ec83eeec311e1ee37a3ace83ea529cace0d'
         WHEN 'tpl_dc_navigation_acceptance_gate_v1' THEN '3ab1a84f1c1f12336efe12244486a60254579f73a061b4a461d076de9a01875b'
         WHEN 'tpl_dc_navigation_component_ownership_v1' THEN '3d43f034b505d76cb6aa0d64551d8c499a3c828dc2c6ad87d76b60b0f33e6ee5'
         WHEN 'tpl_dc_navigation_decision_log_v1' THEN '25afddcef17c7aa724411a56c64eca3f05f2353f74ce0bce30e15e3347d05f42'
         WHEN 'tpl_dc_navigation_interaction_flow_v1' THEN 'f105e41c2e82d3a675c16b86c0472177c4205799a8f414998ca93b3202fa44b5'
         WHEN 'tpl_dc_navigation_responsive_comparison_v1' THEN 'f24c3c08459da22eae60c0b4ee376d97deae40de1e3d34697b9d29adcbccea9f'
         WHEN 'tpl_dc_navigation_surface_profile_v1' THEN '1c766fcd937d8bada232360de0b2ab31b9177097a7cc6e66e991362b6c9c0065'
         WHEN 'tpl_dc_photo_editorial_text_image_v1' THEN '004bdd4fa0f37b9f9a87f2ed43f9d4192805c2756e63e1187f0e342ae681adcf'
         WHEN 'tpl_dc_photo_image_left_editorial_v1' THEN '9e54f851d45d3a34a6b13f2fbcc6d98e2840abe9fa6adf81b7cc013b37789f76'
         WHEN 'tpl_dc_photo_portfolio_cover_v1' THEN '3b7354934f20529a0f179fbf7381106cd80fcd750ec2e4680bc11e6e535be4d7'
         WHEN 'tpl_dc_photo_portrait_gallery_v1' THEN 'fa6996f3358ee3561494b31aaa92e03ac9d3b5d38bee573bc2d19073369531be'
         WHEN 'tpl_dc_photo_section_agenda_v1' THEN '7c68e1fc12302ddc9edadb1e7d87124935cb9e097437a2d88ce3fa6f608eb187'
         WHEN 'tpl_dc_photo_shoot_schedule_v1' THEN '91a24176eee42a539e4bc8cc1219397c0307958b5ee69bb75de8c16d5d29f0e0'
         WHEN 'tpl_dc_typeface_logo_applications_slide_v1' THEN '039a56cd1a86de7802bbea1dd9230ba09e913bc620d8d6ce4f1c328fafe7fe00'
         WHEN 'tpl_dc_typeface_logo_specimen_slide_v1' THEN 'db3d960189ef66ed96e98ee70691cd3a62f5a72eeb233ea710cc6a380a5fa7ef'
         WHEN 'tpl_dc_page_todo_v1' THEN 'fa5049fa01b00d20f6243d70b4eac8b8f188f9903f35da3a30c317614bc390f6'
         WHEN 'tpl_dc_document_project_brief_v1' THEN '3aec9ee104aae176ac4dddad77119a820defa25a69def77ddf06fd26c1db8b9c'
         WHEN 'tpl_dc_spreadsheet_project_tracker_v1' THEN '1b7047a0a7c2171c58be887cfa48c3c175f82031d55bcfa50a935133040119e1'
         ELSE checksum END,
       version = (SELECT 'v' || s.version FROM studio_templates s WHERE s.id = json_extract(r2_objects.metadata_json, '$.studio_template_id')),
       inventory_source = 'catalog_reference',
       verified_at = unixepoch(),
       updated_at = unixepoch()
 WHERE bucket_id = 'r2_inneranimalmedia_assets'
   AND object_key LIKE 'studio-templates/design-canvas/%'
   AND json_valid(metadata_json)
   AND json_extract(metadata_json, '$.app_id') = 'design-canvas'
   AND EXISTS (SELECT 1 FROM studio_templates s WHERE s.id = json_extract(r2_objects.metadata_json, '$.studio_template_id') AND s.app_id = 'design-canvas');

-- Register every verified payload in the cached object inventory. Catalog rows remain authoritative.
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_image_advertisement_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/image-generation/v1/advertisement_v1.json', 'Advertisement template payload', 'application/json', 763, 'f185f480a1199fb4450c527298ed02935080f85ffd7301226ea1dccae2fe9b73', '{"studio_template_id":"tpl_dc_image_advertisement_v1","resource_kind":"image_generation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_image_advertisement_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_image_app_icon_system_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/image-generation/v1/app_icon_system_v1.json', 'App icon system template payload', 'application/json', 2565, '9576867728363d2799a3aecf1d70aa1b9fbbfca2d367f92a8e28e7941d95f09c', '{"studio_template_id":"tpl_dc_image_app_icon_system_v1","resource_kind":"image_generation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_image_app_icon_system_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_image_app_mockup_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/image-generation/v1/app_mockup_v1.json', 'App mockup template payload', 'application/json', 1402, '6382ef6f5d64cd4d33ce2a9aba4e47d5a3a53701216715aa38e4947dd115a4fc', '{"studio_template_id":"tpl_dc_image_app_mockup_v1","resource_kind":"image_generation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_image_app_mockup_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_image_blueprint_poster_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/image-generation/v1/blueprint_poster_v1.json', 'Blueprint poster template payload', 'application/json', 700, '4f0ee899c3587f9dea87f807a3a82ecd6f26f9a6a43ce29992776be3dde31369', '{"studio_template_id":"tpl_dc_image_blueprint_poster_v1","resource_kind":"image_generation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_image_blueprint_poster_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_image_book_cover_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/image-generation/v1/book_cover_v1.json', 'Book cover template payload', 'application/json', 760, '2a36e2160230286247298b3199f406c6ae8c3153213351572a0f57b707d80748', '{"studio_template_id":"tpl_dc_image_book_cover_v1","resource_kind":"image_generation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_image_book_cover_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_image_designer_toy_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/image-generation/v1/designer_toy_v1.json', 'Designer toy template payload', 'application/json', 852, 'cdb3f09e0588efec1ee1503beffb18f8d63315f0e07f4af6eed3d2d25adbbfeb', '{"studio_template_id":"tpl_dc_image_designer_toy_v1","resource_kind":"image_generation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_image_designer_toy_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_image_educational_cutaway_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/image-generation/v1/educational_cutaway_v1.json', 'Educational cutaway template payload', 'application/json', 585, '69afa3699297af90888e373476d81045b366ea4f9ba4f8f06791c65a7816c1c6', '{"studio_template_id":"tpl_dc_image_educational_cutaway_v1","resource_kind":"image_generation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_image_educational_cutaway_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_image_flyer_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/image-generation/v1/flyer_v1.json', 'Flyer template payload', 'application/json', 740, '77a2d36c5cc9c5b97e7de632f4e4b3b31e7d53653370568a6d099ab74a68e0e4', '{"studio_template_id":"tpl_dc_image_flyer_v1","resource_kind":"image_generation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_image_flyer_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_image_headshot_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/image-generation/v1/headshot_v1.json', 'Headshot template payload', 'application/json', 689, 'ff6d67aa638489901a54e2ff08113c7d54dc144b48924a0977c7e1d4ad128703', '{"studio_template_id":"tpl_dc_image_headshot_v1","resource_kind":"image_generation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_image_headshot_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_image_icon_set_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/image-generation/v1/icon_set_v1.json', 'Icon template payload', 'application/json', 1161, '869cbc14500167f45efad48ff92b694f55cc15ffa5ff536f2fae43a3898e1ca6', '{"studio_template_id":"tpl_dc_image_icon_set_v1","resource_kind":"image_generation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_image_icon_set_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_image_illustration_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/image-generation/v1/illustration_v1.json', 'Illustration template payload', 'application/json', 624, '4b13c3ccfea4cbd5f84475f2cecf43872cad73fc3bd5031a0357c0f0005f78bd', '{"studio_template_id":"tpl_dc_image_illustration_v1","resource_kind":"image_generation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_image_illustration_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_image_infographic_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/image-generation/v1/infographic_v1.json', 'Infographic template payload', 'application/json', 643, '5ea50acc959c8bd63ab0a9c9b1b1c33e3bb5e31d079d6a5948ad4c2b467368a5', '{"studio_template_id":"tpl_dc_image_infographic_v1","resource_kind":"image_generation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_image_infographic_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_image_interior_design_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/image-generation/v1/interior_design_v1.json', 'Interior design template payload', 'application/json', 689, 'b28229315897b0ce3ab84fd2626dfbd06fefe2578afeedc677fd409c231ae4bf', '{"studio_template_id":"tpl_dc_image_interior_design_v1","resource_kind":"image_generation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_image_interior_design_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_image_logo_options_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/image-generation/v1/logo_options_v1.json', 'Logo template payload', 'application/json', 1224, '6a82ec9c67050640bc6d70ad6de1fe6032f101f93587a6c5676a5b1f06769fd1', '{"studio_template_id":"tpl_dc_image_logo_options_v1","resource_kind":"image_generation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_image_logo_options_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_image_merchandise_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/image-generation/v1/merchandise_v1.json', 'Merchandise template payload', 'application/json', 731, '68c117e275ae1f1c1b0e0734738af2b893e1898775eba939308bff8efdee14b9', '{"studio_template_id":"tpl_dc_image_merchandise_v1","resource_kind":"image_generation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_image_merchandise_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_image_packaging_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/image-generation/v1/packaging_v1.json', 'Packaging template payload', 'application/json', 805, '08a213a58292caf6e64a7a7ef38b47a2432ebb62f0d76d4df670b4cc6f5b81e0', '{"studio_template_id":"tpl_dc_image_packaging_v1","resource_kind":"image_generation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_image_packaging_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_image_poster_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/image-generation/v1/poster_v1.json', 'Poster template payload', 'application/json', 694, 'd69976c875f7e75c71ad093b18f0c723d3392251daef57ed16a53ac451eaae93', '{"studio_template_id":"tpl_dc_image_poster_v1","resource_kind":"image_generation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_image_poster_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_image_product_photograph_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/image-generation/v1/product_photograph_v1.json', 'Product photo template payload', 'application/json', 730, 'bd13b5a17fd3a0fd92b3b80aacadf932a3900031b28aaa625eea8a10c231b175', '{"studio_template_id":"tpl_dc_image_product_photograph_v1","resource_kind":"image_generation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_image_product_photograph_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_image_thumbnail_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/image-generation/v1/thumbnail_v1.json', 'Thumbnail template payload', 'application/json', 691, 'c979fb0d4f1ea380f5f88c8570a4724a6c03d19915916c64c4597cd1aacea518', '{"studio_template_id":"tpl_dc_image_thumbnail_v1","resource_kind":"image_generation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_image_thumbnail_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_image_typeface_logo_system_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/image-generation/v1/typeface_logo_system_v1.json', 'Typeface and logo specimen template payload', 'application/json', 2658, 'caa8b4a902eed17b43b3456c2f414118c83ae1512e686d98a5d42bf45d4954be', '{"studio_template_id":"tpl_dc_image_typeface_logo_system_v1","resource_kind":"image_generation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_image_typeface_logo_system_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_image_website_mockup_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/image-generation/v1/website_mockup_v1.json', 'Website template payload', 'application/json', 714, '34d70896874174c65742a4ce2ec44ea3c3bd47c38549da6ee22dbdd74b73bc3c', '{"studio_template_id":"tpl_dc_image_website_mockup_v1","resource_kind":"image_generation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_image_website_mockup_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_app_icon_system_deck_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/presentations/app-icon-system/v1/presentation.json', 'App Icon System template payload', 'application/json', 13951, '7c4d5fa998025692b47ee38114275ebf81daf307b385685ced86778beb6eef50', '{"studio_template_id":"tpl_dc_app_icon_system_deck_v1","resource_kind":"presentation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_app_icon_system_deck_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_brand_guidelines_deck_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/presentations/brand-guidelines/v1/presentation.json', 'Brand Guidelines template payload', 'application/json', 20936, 'e50daec2bee901a15f8500722402c044fdaa666d96aaf6c78a395d05e8809deb', '{"studio_template_id":"tpl_dc_brand_guidelines_deck_v1","resource_kind":"presentation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_brand_guidelines_deck_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_navigation_ownership_map_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/presentations/navigation-ownership-interaction-map/v1/presentation.json', 'Navigation Ownership & Interaction Map template payload', 'application/json', 45198, '2e83ced22099b405de4c02691a588645fb8301167a78dfbd0094eaaae1f456a7', '{"studio_template_id":"tpl_dc_navigation_ownership_map_v1","resource_kind":"presentation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_navigation_ownership_map_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_photography_portfolio_deck_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/presentations/photography-portfolio/v1/presentation.json', 'Photography Portfolio template payload', 'application/json', 16498, 'fac28c4d9144cbf9b857c4b15f5bd42334c623fd08a6df3e442dfcd7b0cc364c', '{"studio_template_id":"tpl_dc_photography_portfolio_deck_v1","resource_kind":"presentation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_photography_portfolio_deck_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_typeface_logo_system_deck_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/presentations/typeface-logo-system/v1/presentation.json', 'Typeface & Logo System template payload', 'application/json', 11495, 'f389633843f07082471af4f92038605a3511e346bd3b570747c12bb24994b646', '{"studio_template_id":"tpl_dc_typeface_logo_system_deck_v1","resource_kind":"presentation_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_typeface_logo_system_deck_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_app_icon_colorways_slide_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/slides/app-icon-system/v1/02-color-system.json', 'P Icon Color System template payload', 'application/json', 7950, '1013e6612ff8a260152cedb244f35679f7ba613830b7a52b2b086e2b9dacad6a', '{"studio_template_id":"tpl_dc_app_icon_colorways_slide_v1","resource_kind":"slide_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_app_icon_colorways_slide_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_app_icon_master_slide_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/slides/app-icon-system/v1/01-master-geometry.json', 'Master Geometry template payload', 'application/json', 6038, 'b35ca14882fc6a8b755f4e08746b9f3283de023ea88f786ca798df21c1539c06', '{"studio_template_id":"tpl_dc_app_icon_master_slide_v1","resource_kind":"slide_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_app_icon_master_slide_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_brand_color_palette_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/slides/brand-guidelines/v1/03-color-palette.json', 'Color Palette template payload', 'application/json', 3469, 'f43a5a7637eeb2a3c3076c946242915791f5b3dff1bca37e346285d44c8f8efd', '{"studio_template_id":"tpl_dc_brand_color_palette_v1","resource_kind":"slide_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_brand_color_palette_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_brand_cover_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/slides/brand-guidelines/v1/01-brand-cover.json', 'Brand Cover template payload', 'application/json', 2927, 'b9b3940ee99b43685126119b0f3e74e434142f81ce290116b02922d05ce04429', '{"studio_template_id":"tpl_dc_brand_cover_v1","resource_kind":"slide_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_brand_cover_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_brand_iconography_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/slides/brand-guidelines/v1/05-iconography.json', 'Iconography template payload', 'application/json', 4192, '36b418edd7a04ebd62218a97f316a60c5e5540c2c9734b1e03951263a0aef04c', '{"studio_template_id":"tpl_dc_brand_iconography_v1","resource_kind":"slide_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_brand_iconography_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_brand_logo_system_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/slides/brand-guidelines/v1/02-logo-system.json', 'Logo System template payload', 'application/json', 3553, 'b780cd3e547b9d67206c08c8643606b2e89d8b69600a510f0f7ae51c2cbe8862', '{"studio_template_id":"tpl_dc_brand_logo_system_v1","resource_kind":"slide_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_brand_logo_system_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_brand_photo_gallery_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/slides/brand-guidelines/v2/06-photo-gallery.json', 'Photo Gallery template payload', 'application/json', 1406, '9ec45d9812909020ef1de8022b8976fce8a56a3c2cb9b0e3d3a231d4c9604033', '{"studio_template_id":"tpl_dc_brand_photo_gallery_v1","resource_kind":"slide_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_brand_photo_gallery_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_brand_typography_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/slides/brand-guidelines/v1/04-typography.json', 'Typography template payload', 'application/json', 3695, 'a350cc0b15ad87d91d6a7c3349230ec83eeec311e1ee37a3ace83ea529cace0d', '{"studio_template_id":"tpl_dc_brand_typography_v1","resource_kind":"slide_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_brand_typography_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_navigation_acceptance_gate_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/slides/navigation-ownership-interaction-map/v1/06-acceptance-gate.json', 'Acceptance & Release Gate template payload', 'application/json', 9182, '3ab1a84f1c1f12336efe12244486a60254579f73a061b4a461d076de9a01875b', '{"studio_template_id":"tpl_dc_navigation_acceptance_gate_v1","resource_kind":"slide_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_navigation_acceptance_gate_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_navigation_component_ownership_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/slides/navigation-ownership-interaction-map/v1/02-component-ownership.json', 'Component Ownership Record template payload', 'application/json', 8210, '3d43f034b505d76cb6aa0d64551d8c499a3c828dc2c6ad87d76b60b0f33e6ee5', '{"studio_template_id":"tpl_dc_navigation_component_ownership_v1","resource_kind":"slide_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_navigation_component_ownership_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_navigation_decision_log_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/slides/navigation-ownership-interaction-map/v1/05-decision-log.json', 'Finding, Decision & Action Log template payload', 'application/json', 5606, '25afddcef17c7aa724411a56c64eca3f05f2353f74ce0bce30e15e3347d05f42', '{"studio_template_id":"tpl_dc_navigation_decision_log_v1","resource_kind":"slide_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_navigation_decision_log_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_navigation_interaction_flow_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/slides/navigation-ownership-interaction-map/v1/03-interaction-flow.json', 'Interaction Flow & State Transition template payload', 'application/json', 8649, 'f105e41c2e82d3a675c16b86c0472177c4205799a8f414998ca93b3202fa44b5', '{"studio_template_id":"tpl_dc_navigation_interaction_flow_v1","resource_kind":"slide_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_navigation_interaction_flow_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_navigation_responsive_comparison_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/slides/navigation-ownership-interaction-map/v1/04-responsive-comparison.json', 'Responsive Behavior Comparison template payload', 'application/json', 5868, 'f24c3c08459da22eae60c0b4ee376d97deae40de1e3d34697b9d29adcbccea9f', '{"studio_template_id":"tpl_dc_navigation_responsive_comparison_v1","resource_kind":"slide_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_navigation_responsive_comparison_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_navigation_surface_profile_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/slides/navigation-ownership-interaction-map/v1/01-surface-profile.json', 'Surface Profile template payload', 'application/json', 5721, '1c766fcd937d8bada232360de0b2ab31b9177097a7cc6e66e991362b6c9c0065', '{"studio_template_id":"tpl_dc_navigation_surface_profile_v1","resource_kind":"slide_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_navigation_surface_profile_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_photo_editorial_text_image_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/slides/photography-portfolio/v1/05-editorial-text-image.json', 'Editorial Text and Image template payload', 'application/json', 1624, '004bdd4fa0f37b9f9a87f2ed43f9d4192805c2756e63e1187f0e342ae681adcf', '{"studio_template_id":"tpl_dc_photo_editorial_text_image_v1","resource_kind":"slide_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_photo_editorial_text_image_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_photo_image_left_editorial_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/slides/photography-portfolio/v1/04-image-left-editorial.json', 'Image Left and Editorial template payload', 'application/json', 1828, '9e54f851d45d3a34a6b13f2fbcc6d98e2840abe9fa6adf81b7cc013b37789f76', '{"studio_template_id":"tpl_dc_photo_image_left_editorial_v1","resource_kind":"slide_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_photo_image_left_editorial_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_photo_portfolio_cover_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/slides/photography-portfolio/v1/01-portfolio-cover.json', 'Portfolio Cover template payload', 'application/json', 2732, '3b7354934f20529a0f179fbf7381106cd80fcd750ec2e4680bc11e6e535be4d7', '{"studio_template_id":"tpl_dc_photo_portfolio_cover_v1","resource_kind":"slide_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_photo_portfolio_cover_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_photo_portrait_gallery_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/slides/photography-portfolio/v1/03-portrait-gallery.json', 'Portrait Gallery template payload', 'application/json', 2425, 'fa6996f3358ee3561494b31aaa92e03ac9d3b5d38bee573bc2d19073369531be', '{"studio_template_id":"tpl_dc_photo_portrait_gallery_v1","resource_kind":"slide_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_photo_portrait_gallery_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_photo_section_agenda_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/slides/photography-portfolio/v1/02-section-agenda.json', 'Section Agenda template payload', 'application/json', 3187, '7c68e1fc12302ddc9edadb1e7d87124935cb9e097437a2d88ce3fa6f608eb187', '{"studio_template_id":"tpl_dc_photo_section_agenda_v1","resource_kind":"slide_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_photo_section_agenda_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_photo_shoot_schedule_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/slides/photography-portfolio/v1/06-photoshoot-schedule.json', 'Photoshoot Schedule template payload', 'application/json', 4887, '91a24176eee42a539e4bc8cc1219397c0307958b5ee69bb75de8c16d5d29f0e0', '{"studio_template_id":"tpl_dc_photo_shoot_schedule_v1","resource_kind":"slide_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_photo_shoot_schedule_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_typeface_logo_applications_slide_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/slides/typeface-logo-system/v1/02-logotype-applications.json', 'Logotype Applications template payload', 'application/json', 3177, '039a56cd1a86de7802bbea1dd9230ba09e913bc620d8d6ce4f1c328fafe7fe00', '{"studio_template_id":"tpl_dc_typeface_logo_applications_slide_v1","resource_kind":"slide_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_typeface_logo_applications_slide_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_typeface_logo_specimen_slide_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/slides/typeface-logo-system/v1/01-letterform-system.json', 'Letterform Construction template payload', 'application/json', 8355, 'db3d960189ef66ed96e98ee70691cd3a62f5a72eeb233ea710cc6a380a5fa7ef', '{"studio_template_id":"tpl_dc_typeface_logo_specimen_slide_v1","resource_kind":"slide_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_typeface_logo_specimen_slide_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_page_todo_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/pages/to-do-list/v1/page.json', 'To-do List preview template payload', 'application/json', 792, 'fa5049fa01b00d20f6243d70b4eac8b8f188f9903f35da3a30c317614bc390f6', '{"studio_template_id":"tpl_dc_page_todo_v1","resource_kind":"page_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_page_todo_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_document_project_brief_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/documents/project-brief/v1/document.json', 'Project Brief preview template payload', 'application/json', 1523, '3aec9ee104aae176ac4dddad77119a820defa25a69def77ddf06fd26c1db8b9c', '{"studio_template_id":"tpl_dc_document_project_brief_v1","resource_kind":"document_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_document_project_brief_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_spreadsheet_project_tracker_v1', 'r2_platform_theme_store', 'templates/creative/design-canvas/spreadsheets/project-tracker/v1/spreadsheet.json', 'Project Tracker preview template payload', 'application/json', 2135, '1b7047a0a7c2171c58be887cfa48c3c175f82031d55bcfa50a935133040119e1', '{"studio_template_id":"tpl_dc_spreadsheet_project_tracker_v1","resource_kind":"spreadsheet_template","app_id":"design-canvas","role":"payload"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_spreadsheet_project_tracker_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());

-- Register the four verified previews as separate cached objects.
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_navigation_ownership_map_v1_preview', 'r2_platform_theme_store', 'previews/templates/creative/design-canvas/presentations/navigation-ownership-interaction-map/v1/cover.png', 'Navigation Ownership & Interaction Map template preview', 'image/png', 72795, '969970d320b20886e1d9b54b4af561a328c4e1567eabd3e8701bfd9785abdf36', '{"studio_template_id":"tpl_dc_navigation_ownership_map_v1","resource_kind":"presentation_template","app_id":"design-canvas","role":"preview"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_navigation_ownership_map_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template,preview', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_page_todo_v1_preview', 'r2_platform_theme_store', 'previews/templates/creative/design-canvas/pages/to-do-list/v1/preview.svg', 'To-do List preview template preview', 'image/svg+xml', 1214, 'eddcbf08b41c085afa55e965ab679214f5dd4efc0a88f8f350628657f9e84519', '{"studio_template_id":"tpl_dc_page_todo_v1","resource_kind":"page_template","app_id":"design-canvas","role":"preview"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_page_todo_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template,preview', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_document_project_brief_v1_preview', 'r2_platform_theme_store', 'previews/templates/creative/design-canvas/documents/project-brief/v1/preview.svg', 'Project Brief preview template preview', 'image/svg+xml', 1228, '9a2bab3113038756078918f244234f1b75ce160d20040c072d860a47f869d917', '{"studio_template_id":"tpl_dc_document_project_brief_v1","resource_kind":"document_template","app_id":"design-canvas","role":"preview"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_document_project_brief_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template,preview', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());
INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES ('r2obj_tpl_dc_spreadsheet_project_tracker_v1_preview', 'r2_platform_theme_store', 'previews/templates/creative/design-canvas/spreadsheets/project-tracker/v1/preview.svg', 'Project Tracker preview template preview', 'image/svg+xml', 1179, '8220bbaeaabb2dd713f43b050a3c477dec8616793d3910321e529dba6f113250', '{"studio_template_id":"tpl_dc_spreadsheet_project_tracker_v1","resource_kind":"spreadsheet_template","app_id":"design-canvas","role":"preview"}', '{}', 0, (SELECT 'v' || version FROM studio_templates WHERE id = 'tpl_dc_spreadsheet_project_tracker_v1'), 'STANDARD', 'design-canvas,studio-template,creative-template,preview', 'creative-template', 'agent_sam', 1, 'catalog_reference', unixepoch());

INSERT OR IGNORE INTO asset_relationships (id, source_type, source_id, target_type, target_id, relationship_type, metadata, created_at)
SELECT 'rel_design_canvas_' || s.id || '_uses_payload', 'studio_template', s.id, 'r2_object', 'r2obj_' || s.id, 'uses_payload', json_object('app_id', s.app_id, 'resource_kind', s.resource_kind, 'bucket', 'theme-store'), unixepoch()
  FROM studio_templates s WHERE s.app_id = 'design-canvas' AND s.status = 'active' AND s.payload_bucket_id = 'r2_platform_theme_store';

INSERT OR IGNORE INTO asset_relationships (id, source_type, source_id, target_type, target_id, relationship_type, metadata, created_at)
SELECT 'rel_design_canvas_' || s.id || '_preview_reference', 'studio_template', s.id, 'r2_object', 'r2obj_' || s.id || '_preview', 'preview_reference', json_object('app_id', s.app_id, 'resource_kind', s.resource_kind, 'bucket', 'theme-store'), unixepoch()
  FROM studio_templates s WHERE s.app_id = 'design-canvas' AND s.status = 'active' AND s.preview_bucket_id = 'r2_platform_theme_store' AND s.preview_r2_key IS NOT NULL;

INSERT OR IGNORE INTO r2_storage_routes (id, principal_type, principal_id, app_id, purpose, bucket_id, is_default, status)
VALUES ('route_platform_design_canvas_creative_templates', 'platform', 'platform', 'design-canvas', 'creative-templates', 'r2_platform_theme_store', 1, 'active');

-- This is a verified partial catalog inventory, not a complete R2 bucket scan.
UPDATE r2_buckets
   SET inventory_status = 'partial', last_inventory_at = unixepoch(), updated_at = unixepoch()
 WHERE id = 'r2_platform_theme_store' AND bucket_name = 'theme-store' AND ownership_type = 'platform' AND owner_id = 'platform';

-- Register the schema documents in the existing platform schema bucket and connect each template to its schema.
UPDATE r2_objects
   SET file_size = CASE id
         WHEN 'r2obj_design_canvas_image_schema_v1' THEN 1605
         WHEN 'r2obj_design_canvas_slides_schema_v1' THEN 3131
         ELSE file_size END,
       checksum = CASE id
         WHEN 'r2obj_design_canvas_image_schema_v1' THEN '448780452e24d6b54efba78755716f10e7d6d0a343f016765a716da586c9eabb'
         WHEN 'r2obj_design_canvas_slides_schema_v1' THEN 'a0260388bec8cd37b81ec220fa7ec7af1a73d50a49b974df2745fdcff4e02b8a'
         ELSE checksum END,
       verified_at = unixepoch(),
       updated_at = unixepoch()
 WHERE id IN ('r2obj_design_canvas_image_schema_v1','r2obj_design_canvas_slides_schema_v1');

INSERT OR IGNORE INTO r2_objects (id, bucket_id, object_key, display_name, content_type, file_size, checksum, metadata_json, r2_metadata_json, is_public, version, storage_class, tags, category, uploaded_by, is_active, inventory_source, verified_at)
VALUES
  ('r2obj_design_canvas_page_document_schema_v1','r2_platform_schemas','design-canvas/page-document/v1.schema.json','Design Canvas Page Document Schema v1','application/schema+json',2640,'612e016b1391549fbc4d195fd8bb522a9f5359ea502b84fc19979b3c390e6684','{"schema_id":"agentsam.design-canvas.page-document.v1","app_id":"design-canvas"}','{}',0,'v1','STANDARD','design-canvas,schema','schema','agent_sam',1,'publisher',unixepoch()),
  ('r2obj_design_canvas_document_schema_v1','r2_platform_schemas','design-canvas/document/v1.schema.json','Design Canvas Document Schema v1','application/schema+json',2008,'84970724367908b1a975aba986cae825757b37365300d4bc910ebbe0a4131b53','{"schema_id":"agentsam.design-canvas.document.v1","app_id":"design-canvas"}','{}',0,'v1','STANDARD','design-canvas,schema','schema','agent_sam',1,'publisher',unixepoch()),
  ('r2obj_design_canvas_spreadsheet_schema_v1','r2_platform_schemas','design-canvas/spreadsheet/v1.schema.json','Design Canvas Spreadsheet Schema v1','application/schema+json',1991,'d3d909ba7e7ceaa481e8b2f9c36ce1763fcb3b57011f67c3156c63e904652a38','{"schema_id":"agentsam.design-canvas.spreadsheet.v1","app_id":"design-canvas"}','{}',0,'v1','STANDARD','design-canvas,schema','schema','agent_sam',1,'publisher',unixepoch());

INSERT OR IGNORE INTO asset_relationships (id, source_type, source_id, target_type, target_id, relationship_type, metadata, created_at)
SELECT 'rel_design_canvas_' || s.id || '_schema_definition',
       'studio_template', s.id, 'r2_object',
       CASE s.payload_schema_uri
         WHEN 'https://schemas.inneranimalmedia.com/design-canvas/image-generation-template/v1.schema.json' THEN 'r2obj_design_canvas_image_schema_v1'
         WHEN 'https://schemas.inneranimalmedia.com/design-canvas/slides-document/v1.schema.json' THEN 'r2obj_design_canvas_slides_schema_v1'
         WHEN 'https://schemas.inneranimalmedia.com/design-canvas/page-document/v1.schema.json' THEN 'r2obj_design_canvas_page_document_schema_v1'
         WHEN 'https://schemas.inneranimalmedia.com/design-canvas/document/v1.schema.json' THEN 'r2obj_design_canvas_document_schema_v1'
         WHEN 'https://schemas.inneranimalmedia.com/design-canvas/spreadsheet/v1.schema.json' THEN 'r2obj_design_canvas_spreadsheet_schema_v1'
       END,
       'schema_definition',
       json_object('schema_uri', s.payload_schema_uri, 'bucket', 'inneranimalmedia-schemas'),
       unixepoch()
  FROM studio_templates s
 WHERE s.app_id = 'design-canvas'
   AND s.status = 'active'
   AND s.payload_schema_uri IN (
     'https://schemas.inneranimalmedia.com/design-canvas/image-generation-template/v1.schema.json',
     'https://schemas.inneranimalmedia.com/design-canvas/slides-document/v1.schema.json',
     'https://schemas.inneranimalmedia.com/design-canvas/page-document/v1.schema.json',
     'https://schemas.inneranimalmedia.com/design-canvas/document/v1.schema.json',
     'https://schemas.inneranimalmedia.com/design-canvas/spreadsheet/v1.schema.json'
   );

UPDATE r2_buckets
   SET inventory_status = 'partial', last_inventory_at = unixepoch(), updated_at = unixepoch()
 WHERE id = 'r2_platform_schemas' AND bucket_name = 'inneranimalmedia-schemas' AND ownership_type = 'platform' AND owner_id = 'platform';

-- Legacy source objects are removed separately only after this migration is applied and all catalog references are verified.
