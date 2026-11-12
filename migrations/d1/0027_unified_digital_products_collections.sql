-- App Store digital products share the same products/cms_collections/cms_collection_items
-- spine as merchandise. All newly registered listings remain DRAFT.
-- No new catalog, no installation entitlements and no other site mutations.
INSERT INTO agentsam_products
 (slug,name,kind,status,description,repository_id,canonical_path,package_name,version,tags,metadata,catalog_visibility)
VALUES
 ('samsketch','SamSketch','app','wired','Scene and shape authoring bundled in AgentSam SDK.','github:samprimeaux/agentsam-sdk','apps/samsketch','@inneranimalmedia/samsketch','2.6.14','["app","design","modeling"]','{"source":"apps/samsketch/package.json","manifest":"apps/samsketch/agentsam.app.json","manifest_version":"0.1.0","package_private":true,"delivery":"bundled_unreleased"}','internal'),
 ('agentsam-canvas','AgentSam Canvas','app','wired','Revisioned private Canvas artboards and CMS handoff inside Local Studio.','github:samprimeaux/agentsam-sdk','apps/local-studio/frontend/src/routes/(apps)/canvas.tsx','@inneranimalmedia/agentsam-local-studio','2.6.14','["app","design","canvas"]','{"source":"apps/local-studio/frontend/src/routes/(apps)/canvas.tsx","document_kind":"design-canvas","delivery":"bundled_not_standalone"}','internal'),
 ('ecommerce-product-studio','Product Studio','app','wired','Light product-design canvas for drafts, artwork, variants and supplier previews.','github:samprimeaux/agentsam-sdk','apps/ecommerce-cms-agentsam/apps/product-studio/agentsam.app.json','@inneranimalmedia/ecommerce-cms-agentsam','2.6.14','["app","commerce","editor"]','{"source":"apps/ecommerce-cms-agentsam/apps/product-studio/agentsam.app.json","role":"embedded-app","delivery":"bundled_not_standalone"}','internal')
ON CONFLICT(slug) DO NOTHING;

INSERT INTO products (slug,title,description,collection,price_cents,status,site_id,product_kind,digital_ref)
SELECT a.slug,a.name,a.description,NULL,0,'draft','app-store','app',a.slug
FROM agentsam_products a
WHERE a.slug IN (
 'agentsam-local-studio','agentsam-ecommerce-cms','cad-creator','samsketch','agentsam-canvas',
 'ecommerce-product-studio','identity-signin-inneranimalmedia','identity-signin-google',
 'identity-signin-github','identity-signin-cloudflare','identity-signin-chatgpt'
)
AND NOT EXISTS (SELECT 1 FROM products p WHERE p.slug=a.slug);

INSERT INTO cms_collections
(id,name,description,slug,kind,allowed_item_types_json,site_id,account_id,status,visibility,sort_order,metadata_json,created_at,updated_at)
SELECT v.id,v.name,v.description,v.slug,'manual','["product"]',s.id,s.account_id,'draft','private',v.sort_order,
'{"schema":"iam.cms.marketplace-collection.v1","curation":"draft","published":false}',
unixepoch(),unixepoch()
FROM cms_sites s
JOIN (
 SELECT 'cmscol_appstore_apps' id,'Applications' name,'Apps and installed workspaces' description,'apps' slug,2 sort_order
 UNION ALL SELECT 'cmscol_appstore_creative','Creative tools','Design, modeling and product creation applications','creative-tools',3
 UNION ALL SELECT 'cmscol_appstore_themes','Themes','Website design systems and storefront themes','themes',4
 UNION ALL SELECT 'cmscol_appstore_plugins','Plugins & integrations','Connected account capabilities and integrations','plugins',5
) v
WHERE s.id='app-store'
AND NOT EXISTS (SELECT 1 FROM cms_collections c WHERE c.site_id=s.id AND c.slug=v.slug);

-- Obsolete references to agentsam_products (prod_*) are invalid here:
-- this shared collection implementation authorizes numeric products.id.
DELETE FROM cms_collection_items
WHERE site_id='app-store' AND item_type='product'
AND item_ref LIKE 'prod_%'
AND collection_id IN
 (SELECT id FROM cms_collections WHERE site_id='app-store' AND slug IN ('embeds','sign-in'))
AND NOT EXISTS (SELECT 1 FROM products p WHERE p.site_id='app-store'
 AND CAST(p.id AS TEXT)=cms_collection_items.item_ref);

WITH membership(collection_slug,product_slug,position) AS (
VALUES
('apps','agentsam-local-studio',10),('apps','agentsam-ecommerce-cms',20),
('apps','cad-creator',30),('apps','samsketch',40),
('apps','agentsam-canvas',50),('apps','ecommerce-product-studio',60),
('creative-tools','agentsam-canvas',10),('creative-tools','cad-creator',20),
('creative-tools','samsketch',30),('creative-tools','ecommerce-product-studio',40),
('plugins','agentsam-brand',10),('plugins','agentsam-campaign',20),
('plugins','completeful-product-studio',30),
('embeds','announcement-bar',10),('embeds','announcement-modal',20),
('embeds','contact-form',30),('embeds','customer-billing',40),
('embeds','newsletter-modal',50),('embeds','newsletter-subscribe',60),
('sign-in','identity-signin-inneranimalmedia',10),('sign-in','identity-signin-google',20),
('sign-in','identity-signin-github',30),('sign-in','identity-signin-cloudflare',40),
('sign-in','identity-signin-chatgpt',50),
('themes','cypress',10),('themes','violet',20),('themes','grove',30),
('themes','ember',40),('themes','forge',50),('themes','harbor',60),
('themes','summit',70),('themes','resolve',80),('themes','iasf',90),
('themes','plain-jane',100),('themes','revise',110)
)
INSERT OR IGNORE INTO cms_collection_items
(account_id,site_id,collection_id,item_type,item_ref,sort_order,status,presentation_json)
SELECT c.account_id,c.site_id,c.id,'product',CAST(p.id AS TEXT),m.position,'active','{}'
FROM membership m
JOIN cms_collections c ON c.site_id='app-store' AND c.slug=m.collection_slug
JOIN products p ON p.site_id=c.site_id AND p.slug=m.product_slug;
