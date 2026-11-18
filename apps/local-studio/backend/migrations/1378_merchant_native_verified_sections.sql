-- agentsam-engine: d1
-- Register SIX existing native merchant renderers, no new CMS tables and no instance rewrites.
-- Uses @inneranimalmedia/ecommerce-cms-agentsam bundled portable-sections.js.

-- Sticky curtain hero
INSERT OR IGNORE INTO cms_definitions
(id,account_id,definition_key,kind,label,description,category,origin,version,settings_schema_json,allowed_blocks_json,max_blocks,metadata_json,status)
SELECT 'cmsd_native_revise_sticky_curtain',(SELECT account_id FROM cms_definitions WHERE id='cmsd_store_global_header' LIMIT 1),
'revise/sticky-curtain','section','Sticky curtain hero','Editable native merchant storefront component.','Hero','built_in','1',
'{"eyebrow":{"label":"Eyebrow","type":"text"},"headline":{"label":"Headline","type":"text"},"subheadline":{"label":"Description","type":"textarea"},"imageUrl":{"label":"Background / side image","type":"media"},"ctaPrimary.label":{"label":"Button text","type":"text"},"ctaPrimary.href":{"label":"Button link","type":"link"},"ctaPrimary.openInNewTab":{"label":"Open in new tab","type":"boolean"}}','["button"]',4,'{"source":"merchant-native","rendererKey":"revise/sticky-curtain","implementationClass":"native","runtimeOwner":"ThemePortableSections"}','active'
WHERE EXISTS (SELECT 1 FROM cms_definitions WHERE id='cmsd_store_global_header');
INSERT OR IGNORE INTO cms_components
(id,definition_id,renderer_key,delivery_mode,source_ref,capabilities_json,compatibility_json,verification_json,implementation_status)
SELECT 'cmp_native_revise_sticky_curtain','cmsd_native_revise_sticky_curtain','revise/sticky-curtain','bundled',
'apps/ecommerce-cms-agentsam/packages/theme-contract/runtime/portable-sections.js',
'{"edit":true,"blocks":true,"preview":true,"storefront":true}','{"site_editor":true,"theme_project":true,"portable_renderer":"ThemePortableSections"}','{"source":"bundled-native","runtime":"ThemePortableSections","validation":"native-default-content-and-output","requires_provider":false}','verified'
WHERE EXISTS (SELECT 1 FROM cms_definitions WHERE id='cmsd_native_revise_sticky_curtain');
INSERT OR IGNORE INTO cms_component_templates
(sku,template_name,template_type,category,label,item_type,status,is_system,slug,definition_id,
definition_key,definition_version,template_data,editor_schema_json,compatibility_json,
responsive_schema_json,data_bindings_json,preview_json,tags,sort_order)
SELECT 'SKU-NATIVE-REV-HERO','Sticky curtain hero','section','Hero','Sticky curtain hero',
'section','active',1,'revise-sticky-curtain','cmsd_native_revise_sticky_curtain','revise/sticky-curtain','1',
'{"renderer_key":"revise/sticky-curtain","implementation_class":"native","default_content":{"eyebrow":"New collection","headline":"Your headline","subheadline":"Describe your story.","imageUrl":"","ctaPrimary":{"label":"Explore","href":"/shop","openInNewTab":false},"button1":{"label":"Explore","href":"/shop","variant":"solid"},"__editor":{"templateKey":"portable","themePreset":"revise/sticky-curtain","visibility":{"enabled":true},"blocks":[{"id":"button1","templateKey":"button","enabled":true}]}}}','{"fields":[{"key":"eyebrow","label":"Eyebrow","type":"text"},{"key":"headline","label":"Headline","type":"text"},{"key":"subheadline","label":"Description","type":"textarea"},{"key":"imageUrl","label":"Background / side image","type":"media"},{"key":"ctaPrimary.label","label":"Button text","type":"text"},{"key":"ctaPrimary.href","label":"Button link","type":"link"},{"key":"ctaPrimary.openInNewTab","label":"Open in new tab","type":"boolean"}],"blocks":[{"key":"button","label":"Button","category":"Basic","definitionKey":"button","repeatable":true,"min":0,"max":4,"fields":[{"key":"label","label":"Label","type":"text"},{"key":"href","label":"Link","type":"link"},{"key":"variant","label":"Style","type":"select","options":[{"label":"Solid","value":"solid"},{"label":"Outline","value":"outline"},{"label":"Text","value":"text"}]}],"defaultContent":{"label":"Explore","href":"/shop","variant":"solid"}}],"settings":[]}','{"site_editor":true,"theme_project":true,"portable_renderer":"ThemePortableSections"}',
'{"mobile_first":true}','{}','{"renderer_key":"revise/sticky-curtain","native_preview":true}',
'["merchant","native","verified"]',10
WHERE EXISTS (SELECT 1 FROM cms_components WHERE definition_id='cmsd_native_revise_sticky_curtain');

-- Wardrobe rail
INSERT OR IGNORE INTO cms_definitions
(id,account_id,definition_key,kind,label,description,category,origin,version,settings_schema_json,allowed_blocks_json,max_blocks,metadata_json,status)
SELECT 'cmsd_native_revise_wardrobe_rail',(SELECT account_id FROM cms_definitions WHERE id='cmsd_store_global_header' LIMIT 1),
'revise/wardrobe-rail','section','Wardrobe rail','Editable native merchant storefront component.','Collections','built_in','1',
'{"title":{"label":"Heading","type":"text"}}','["collection-card"]',12,'{"source":"merchant-native","rendererKey":"revise/wardrobe-rail","implementationClass":"native","runtimeOwner":"ThemePortableSections"}','active'
WHERE EXISTS (SELECT 1 FROM cms_definitions WHERE id='cmsd_store_global_header');
INSERT OR IGNORE INTO cms_components
(id,definition_id,renderer_key,delivery_mode,source_ref,capabilities_json,compatibility_json,verification_json,implementation_status)
SELECT 'cmp_native_revise_wardrobe_rail','cmsd_native_revise_wardrobe_rail','revise/wardrobe-rail','bundled',
'apps/ecommerce-cms-agentsam/packages/theme-contract/runtime/portable-sections.js',
'{"edit":true,"blocks":true,"preview":true,"storefront":true}','{"site_editor":true,"theme_project":true,"portable_renderer":"ThemePortableSections"}','{"source":"bundled-native","runtime":"ThemePortableSections","validation":"native-default-content-and-output","requires_provider":false}','verified'
WHERE EXISTS (SELECT 1 FROM cms_definitions WHERE id='cmsd_native_revise_wardrobe_rail');
INSERT OR IGNORE INTO cms_component_templates
(sku,template_name,template_type,category,label,item_type,status,is_system,slug,definition_id,
definition_key,definition_version,template_data,editor_schema_json,compatibility_json,
responsive_schema_json,data_bindings_json,preview_json,tags,sort_order)
SELECT 'SKU-NATIVE-REV-RAIL','Wardrobe rail','section','Collections','Wardrobe rail',
'section','active',1,'revise-wardrobe-rail','cmsd_native_revise_wardrobe_rail','revise/wardrobe-rail','1',
'{"renderer_key":"revise/wardrobe-rail","implementation_class":"native","default_content":{"title":"Shop collections","card1":{"name":"Collection one","imageUrl":"","href":"/shop"},"card2":{"name":"Collection two","imageUrl":"","href":"/shop"},"__editor":{"templateKey":"portable","themePreset":"revise/wardrobe-rail","visibility":{"enabled":true},"blocks":[{"id":"card1","templateKey":"collection-card","enabled":true},{"id":"card2","templateKey":"collection-card","enabled":true}]}}}','{"fields":[{"key":"title","label":"Heading","type":"text"}],"blocks":[{"key":"collection-card","label":"Collection","repeatable":true,"min":0,"max":12,"fields":[{"key":"name","label":"Name","type":"text"},{"key":"imageUrl","label":"Image","type":"media"},{"key":"href","label":"Link","type":"link"}],"defaultContent":{"name":"New collection","imageUrl":"","href":"/shop"}}],"settings":[]}','{"site_editor":true,"theme_project":true,"portable_renderer":"ThemePortableSections"}',
'{"mobile_first":true}','{}','{"renderer_key":"revise/wardrobe-rail","native_preview":true}',
'["merchant","native","verified"]',20
WHERE EXISTS (SELECT 1 FROM cms_components WHERE definition_id='cmsd_native_revise_wardrobe_rail');

-- Editorial statement
INSERT OR IGNORE INTO cms_definitions
(id,account_id,definition_key,kind,label,description,category,origin,version,settings_schema_json,allowed_blocks_json,max_blocks,metadata_json,status)
SELECT 'cmsd_native_revise_editorial_statement',(SELECT account_id FROM cms_definitions WHERE id='cmsd_store_global_header' LIMIT 1),
'revise/editorial-statement','section','Editorial statement','Editable native merchant storefront component.','Storytelling','built_in','1',
'{"title":{"label":"Heading","type":"text"},"body":{"label":"Body","type":"textarea"}}','[]',0,'{"source":"merchant-native","rendererKey":"revise/editorial-statement","implementationClass":"native","runtimeOwner":"ThemePortableSections"}','active'
WHERE EXISTS (SELECT 1 FROM cms_definitions WHERE id='cmsd_store_global_header');
INSERT OR IGNORE INTO cms_components
(id,definition_id,renderer_key,delivery_mode,source_ref,capabilities_json,compatibility_json,verification_json,implementation_status)
SELECT 'cmp_native_revise_editorial_statement','cmsd_native_revise_editorial_statement','revise/editorial-statement','bundled',
'apps/ecommerce-cms-agentsam/packages/theme-contract/runtime/portable-sections.js',
'{"edit":true,"blocks":false,"preview":true,"storefront":true}','{"site_editor":true,"theme_project":true,"portable_renderer":"ThemePortableSections"}','{"source":"bundled-native","runtime":"ThemePortableSections","validation":"native-default-content-and-output","requires_provider":false}','verified'
WHERE EXISTS (SELECT 1 FROM cms_definitions WHERE id='cmsd_native_revise_editorial_statement');
INSERT OR IGNORE INTO cms_component_templates
(sku,template_name,template_type,category,label,item_type,status,is_system,slug,definition_id,
definition_key,definition_version,template_data,editor_schema_json,compatibility_json,
responsive_schema_json,data_bindings_json,preview_json,tags,sort_order)
SELECT 'SKU-NATIVE-REV-EDITORIAL','Editorial statement','section','Storytelling','Editorial statement',
'section','active',1,'revise-editorial-statement','cmsd_native_revise_editorial_statement','revise/editorial-statement','1',
'{"renderer_key":"revise/editorial-statement","implementation_class":"native","default_content":{"title":"Tell your story","body":"Introduce your point of view.","__editor":{"templateKey":"portable","themePreset":"revise/editorial-statement","visibility":{"enabled":true}}}}','{"fields":[{"key":"title","label":"Heading","type":"text"},{"key":"body","label":"Body","type":"textarea"}],"blocks":[],"settings":[]}','{"site_editor":true,"theme_project":true,"portable_renderer":"ThemePortableSections"}',
'{"mobile_first":true}','{}','{"renderer_key":"revise/editorial-statement","native_preview":true}',
'["merchant","native","verified"]',30
WHERE EXISTS (SELECT 1 FROM cms_components WHERE definition_id='cmsd_native_revise_editorial_statement');

-- FAQ accordion
INSERT OR IGNORE INTO cms_definitions
(id,account_id,definition_key,kind,label,description,category,origin,version,settings_schema_json,allowed_blocks_json,max_blocks,metadata_json,status)
SELECT 'cmsd_native_revise_faq',(SELECT account_id FROM cms_definitions WHERE id='cmsd_store_global_header' LIMIT 1),
'revise/faq','section','FAQ accordion','Editable native merchant storefront component.','FAQ','built_in','1',
'{"title":{"label":"Heading","type":"text"}}','["faq-item"]',16,'{"source":"merchant-native","rendererKey":"revise/faq","implementationClass":"native","runtimeOwner":"ThemePortableSections"}','active'
WHERE EXISTS (SELECT 1 FROM cms_definitions WHERE id='cmsd_store_global_header');
INSERT OR IGNORE INTO cms_components
(id,definition_id,renderer_key,delivery_mode,source_ref,capabilities_json,compatibility_json,verification_json,implementation_status)
SELECT 'cmp_native_revise_faq','cmsd_native_revise_faq','revise/faq','bundled',
'apps/ecommerce-cms-agentsam/packages/theme-contract/runtime/portable-sections.js',
'{"edit":true,"blocks":true,"preview":true,"storefront":true}','{"site_editor":true,"theme_project":true,"portable_renderer":"ThemePortableSections"}','{"source":"bundled-native","runtime":"ThemePortableSections","validation":"native-default-content-and-output","requires_provider":false}','verified'
WHERE EXISTS (SELECT 1 FROM cms_definitions WHERE id='cmsd_native_revise_faq');
INSERT OR IGNORE INTO cms_component_templates
(sku,template_name,template_type,category,label,item_type,status,is_system,slug,definition_id,
definition_key,definition_version,template_data,editor_schema_json,compatibility_json,
responsive_schema_json,data_bindings_json,preview_json,tags,sort_order)
SELECT 'SKU-NATIVE-REV-FAQ','FAQ accordion','section','FAQ','FAQ accordion',
'section','active',1,'revise-faq','cmsd_native_revise_faq','revise/faq','1',
'{"renderer_key":"revise/faq","implementation_class":"native","default_content":{"title":"Frequently asked questions","card1":{"question":"Question one","answer":"Add your answer."},"__editor":{"templateKey":"portable","themePreset":"revise/faq","visibility":{"enabled":true},"blocks":[{"id":"card1","templateKey":"faq-item","enabled":true}]}}}','{"fields":[{"key":"title","label":"Heading","type":"text"}],"blocks":[{"key":"faq-item","label":"Question","repeatable":true,"min":0,"max":16,"fields":[{"key":"question","label":"Question","type":"text"},{"key":"answer","label":"Answer","type":"textarea"}],"defaultContent":{"question":"Your question","answer":"Your answer."}}],"settings":[]}','{"site_editor":true,"theme_project":true,"portable_renderer":"ThemePortableSections"}',
'{"mobile_first":true}','{}','{"renderer_key":"revise/faq","native_preview":true}',
'["merchant","native","verified"]',40
WHERE EXISTS (SELECT 1 FROM cms_components WHERE definition_id='cmsd_native_revise_faq');

-- Testimonial cards
INSERT OR IGNORE INTO cms_definitions
(id,account_id,definition_key,kind,label,description,category,origin,version,settings_schema_json,allowed_blocks_json,max_blocks,metadata_json,status)
SELECT 'cmsd_native_revise_testimonials',(SELECT account_id FROM cms_definitions WHERE id='cmsd_store_global_header' LIMIT 1),
'revise/testimonials','section','Testimonial cards','Editable native merchant storefront component.','Social proof','built_in','1',
'{"title":{"label":"Heading","type":"text"}}','["detail-card"]',12,'{"source":"merchant-native","rendererKey":"revise/testimonials","implementationClass":"native","runtimeOwner":"ThemePortableSections"}','active'
WHERE EXISTS (SELECT 1 FROM cms_definitions WHERE id='cmsd_store_global_header');
INSERT OR IGNORE INTO cms_components
(id,definition_id,renderer_key,delivery_mode,source_ref,capabilities_json,compatibility_json,verification_json,implementation_status)
SELECT 'cmp_native_revise_testimonials','cmsd_native_revise_testimonials','revise/testimonials','bundled',
'apps/ecommerce-cms-agentsam/packages/theme-contract/runtime/portable-sections.js',
'{"edit":true,"blocks":true,"preview":true,"storefront":true}','{"site_editor":true,"theme_project":true,"portable_renderer":"ThemePortableSections"}','{"source":"bundled-native","runtime":"ThemePortableSections","validation":"native-default-content-and-output","requires_provider":false}','verified'
WHERE EXISTS (SELECT 1 FROM cms_definitions WHERE id='cmsd_native_revise_testimonials');
INSERT OR IGNORE INTO cms_component_templates
(sku,template_name,template_type,category,label,item_type,status,is_system,slug,definition_id,
definition_key,definition_version,template_data,editor_schema_json,compatibility_json,
responsive_schema_json,data_bindings_json,preview_json,tags,sort_order)
SELECT 'SKU-NATIVE-REV-TESTIMONIALS','Testimonial cards','section','Social proof','Testimonial cards',
'section','active',1,'revise-testimonials','cmsd_native_revise_testimonials','revise/testimonials','1',
'{"renderer_key":"revise/testimonials","implementation_class":"native","default_content":{"title":"What people are saying","card1":{"name":"Customer","description":"Add a real customer testimonial."},"__editor":{"templateKey":"portable","themePreset":"revise/testimonials","visibility":{"enabled":true},"blocks":[{"id":"card1","templateKey":"detail-card","enabled":true}]}}}','{"fields":[{"key":"title","label":"Heading","type":"text"}],"blocks":[{"key":"detail-card","label":"Item","repeatable":true,"min":0,"max":12,"fields":[{"key":"name","label":"Heading","type":"text"},{"key":"description","label":"Description","type":"textarea"}],"defaultContent":{"name":"New item","description":"Edit this description."}}],"settings":[]}','{"site_editor":true,"theme_project":true,"portable_renderer":"ThemePortableSections"}',
'{"mobile_first":true}','{}','{"renderer_key":"revise/testimonials","native_preview":true}',
'["merchant","native","verified"]',50
WHERE EXISTS (SELECT 1 FROM cms_components WHERE definition_id='cmsd_native_revise_testimonials');

-- Trust row
INSERT OR IGNORE INTO cms_definitions
(id,account_id,definition_key,kind,label,description,category,origin,version,settings_schema_json,allowed_blocks_json,max_blocks,metadata_json,status)
SELECT 'cmsd_native_revise_trust_row',(SELECT account_id FROM cms_definitions WHERE id='cmsd_store_global_header' LIMIT 1),
'revise/trust-row','section','Trust row','Editable native merchant storefront component.','Social proof','built_in','1',
'{"title":{"label":"Heading","type":"text"}}','["detail-card"]',12,'{"source":"merchant-native","rendererKey":"revise/trust-row","implementationClass":"native","runtimeOwner":"ThemePortableSections"}','active'
WHERE EXISTS (SELECT 1 FROM cms_definitions WHERE id='cmsd_store_global_header');
INSERT OR IGNORE INTO cms_components
(id,definition_id,renderer_key,delivery_mode,source_ref,capabilities_json,compatibility_json,verification_json,implementation_status)
SELECT 'cmp_native_revise_trust_row','cmsd_native_revise_trust_row','revise/trust-row','bundled',
'apps/ecommerce-cms-agentsam/packages/theme-contract/runtime/portable-sections.js',
'{"edit":true,"blocks":true,"preview":true,"storefront":true}','{"site_editor":true,"theme_project":true,"portable_renderer":"ThemePortableSections"}','{"source":"bundled-native","runtime":"ThemePortableSections","validation":"native-default-content-and-output","requires_provider":false}','verified'
WHERE EXISTS (SELECT 1 FROM cms_definitions WHERE id='cmsd_native_revise_trust_row');
INSERT OR IGNORE INTO cms_component_templates
(sku,template_name,template_type,category,label,item_type,status,is_system,slug,definition_id,
definition_key,definition_version,template_data,editor_schema_json,compatibility_json,
responsive_schema_json,data_bindings_json,preview_json,tags,sort_order)
SELECT 'SKU-NATIVE-REV-TRUST','Trust row','section','Social proof','Trust row',
'section','active',1,'revise-trust-row','cmsd_native_revise_trust_row','revise/trust-row','1',
'{"renderer_key":"revise/trust-row","implementation_class":"native","default_content":{"title":"Why shop with us","card1":{"name":"Your promise","description":"Explain a benefit."},"__editor":{"templateKey":"portable","themePreset":"revise/trust-row","visibility":{"enabled":true},"blocks":[{"id":"card1","templateKey":"detail-card","enabled":true}]}}}','{"fields":[{"key":"title","label":"Heading","type":"text"}],"blocks":[{"key":"detail-card","label":"Item","repeatable":true,"min":0,"max":12,"fields":[{"key":"name","label":"Heading","type":"text"},{"key":"description","label":"Description","type":"textarea"}],"defaultContent":{"name":"New item","description":"Edit this description."}}],"settings":[]}','{"site_editor":true,"theme_project":true,"portable_renderer":"ThemePortableSections"}',
'{"mobile_first":true}','{}','{"renderer_key":"revise/trust-row","native_preview":true}',
'["merchant","native","verified"]',60
WHERE EXISTS (SELECT 1 FROM cms_components WHERE definition_id='cmsd_native_revise_trust_row');
