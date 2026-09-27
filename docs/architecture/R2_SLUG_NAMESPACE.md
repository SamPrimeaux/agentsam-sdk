# AgentSam R2 layout — slug-keyed customer namespaces (not account_id)
#
# Path identity = brand.slug (UNIQUE in D1). account_id lives inside manifest.json
# as ownership data for auth checks — never as a directory segment.
#
# {slug}/
#   brand/identity.json
#   brand/assets/{asset_key}/{version}/   ← brand_asset / brand_asset_variant
#   site/public/…  site/draft/…
#   frontend/dist/
#   backend/
#   manifest.json                         ← account_id, oauth defaults, included_apps
#
# Platform chrome (not a customer):
#   _platform/shared/…
#
# Product surface for non-git customers:
#   agentsam scaffold new <slug>
#     → provisions R2 prefix + Worker + D1 rows from an npm-packaged app scaffold
#     → customers never see the monorepo
