-- agentsam-engine: d1
-- Non-destructive v2 package metadata for existing component registry rows.
-- Old source refs and template r2_key columns intentionally remain intact.
-- This migration MUST follow verified R2 publishing of all package manifests.
UPDATE cms_components SET
package_ref='cms-component:platform/choose-a-plan@1.0.0',
artifact_r2_bucket='theme-store',
artifact_r2_key='packages/platform/choose-a-plan/1.0.0/manifest.json',
artifact_sha256='3dac098d5e21bea4640d33d770915dd866401ce3d914805d1e7bc47306fcade9',
verification_json=json_set(verification_json,
 '$.package_schema','inneranimalmedia.cms-component-package.v2',
 '$.manifest_sha256','3dac098d5e21bea4640d33d770915dd866401ce3d914805d1e7bc47306fcade9')
WHERE renderer_key='platform/choose-a-plan'
AND source_ref='r2://theme-store/cms/design-stock/v1/choose-a-plan/7a1c3fc5ca54764b/Main.dc.html';
UPDATE cms_component_templates SET
preview_json=json_set(preview_json,
 '$.package_ref','cms-component:platform/choose-a-plan@1.0.0',
 '$.manifest_key','packages/platform/choose-a-plan/1.0.0/manifest.json',
 '$.manifest_sha256','3dac098d5e21bea4640d33d770915dd866401ce3d914805d1e7bc47306fcade9')
WHERE definition_key='platform/choose-a-plan'
AND r2_bucket='theme-store' AND source_html_r2_key='cms/design-stock/v1/choose-a-plan/7a1c3fc5ca54764b/Main.dc.html';

UPDATE cms_components SET
package_ref='cms-component:platform/start-trial-checkout@1.0.0',
artifact_r2_bucket='theme-store',
artifact_r2_key='packages/platform/start-trial-checkout/1.0.0/manifest.json',
artifact_sha256='76f6066a1b38857deb5f4cd18dbf16256b7c54ab487ffbb4c2e806e7b401399a',
verification_json=json_set(verification_json,
 '$.package_schema','inneranimalmedia.cms-component-package.v2',
 '$.manifest_sha256','76f6066a1b38857deb5f4cd18dbf16256b7c54ab487ffbb4c2e806e7b401399a')
WHERE renderer_key='platform/start-trial-checkout'
AND source_ref='r2://theme-store/cms/design-stock/v1/start-trial-checkout/7c217582d7b4ed82/Checkout.dc.html';
UPDATE cms_component_templates SET
preview_json=json_set(preview_json,
 '$.package_ref','cms-component:platform/start-trial-checkout@1.0.0',
 '$.manifest_key','packages/platform/start-trial-checkout/1.0.0/manifest.json',
 '$.manifest_sha256','76f6066a1b38857deb5f4cd18dbf16256b7c54ab487ffbb4c2e806e7b401399a')
WHERE definition_key='platform/start-trial-checkout'
AND r2_bucket='theme-store' AND source_html_r2_key='cms/design-stock/v1/start-trial-checkout/7c217582d7b4ed82/Checkout.dc.html';

UPDATE cms_components SET
package_ref='cms-component:platform/setup-goals@1.0.0',
artifact_r2_bucket='theme-store',
artifact_r2_key='packages/platform/setup-goals/1.0.0/manifest.json',
artifact_sha256='388b35d48f9bcc430834bb3968e85963d2eec0ae2b92be428bd9408d51ef12e8',
verification_json=json_set(verification_json,
 '$.package_schema','inneranimalmedia.cms-component-package.v2',
 '$.manifest_sha256','388b35d48f9bcc430834bb3968e85963d2eec0ae2b92be428bd9408d51ef12e8')
WHERE renderer_key='platform/setup-goals'
AND source_ref='r2://theme-store/cms/design-stock/v1/setup-goals/70cdfc1642ba8e00/SetupGoals.dc.html';
UPDATE cms_component_templates SET
preview_json=json_set(preview_json,
 '$.package_ref','cms-component:platform/setup-goals@1.0.0',
 '$.manifest_key','packages/platform/setup-goals/1.0.0/manifest.json',
 '$.manifest_sha256','388b35d48f9bcc430834bb3968e85963d2eec0ae2b92be428bd9408d51ef12e8')
WHERE definition_key='platform/setup-goals'
AND r2_bucket='theme-store' AND source_html_r2_key='cms/design-stock/v1/setup-goals/70cdfc1642ba8e00/SetupGoals.dc.html';

UPDATE cms_components SET
package_ref='cms-component:platform/first-run-home@1.0.0',
artifact_r2_bucket='theme-store',
artifact_r2_key='packages/platform/first-run-home/1.0.0/manifest.json',
artifact_sha256='8818fa7932bfc608739cce3c2151bbb1d496967dd9b288a368c388818ed77e58',
verification_json=json_set(verification_json,
 '$.package_schema','inneranimalmedia.cms-component-package.v2',
 '$.manifest_sha256','8818fa7932bfc608739cce3c2151bbb1d496967dd9b288a368c388818ed77e58')
WHERE renderer_key='platform/first-run-home'
AND source_ref='r2://theme-store/cms/design-stock/v1/first-run-home/30f64e2e66882175/WelcomeHome.dc.html';
UPDATE cms_component_templates SET
preview_json=json_set(preview_json,
 '$.package_ref','cms-component:platform/first-run-home@1.0.0',
 '$.manifest_key','packages/platform/first-run-home/1.0.0/manifest.json',
 '$.manifest_sha256','8818fa7932bfc608739cce3c2151bbb1d496967dd9b288a368c388818ed77e58')
WHERE definition_key='platform/first-run-home'
AND r2_bucket='theme-store' AND source_html_r2_key='cms/design-stock/v1/first-run-home/30f64e2e66882175/WelcomeHome.dc.html';

UPDATE cms_components SET
package_ref='cms-component:platform/design-canvas-dark@1.0.0',
artifact_r2_bucket='theme-store',
artifact_r2_key='packages/platform/design-canvas-dark/1.0.0/manifest.json',
artifact_sha256='e283cb0ffb13ecd51c3480b393d72872d2cc367799a4f971a0e7ba154e973be0',
verification_json=json_set(verification_json,
 '$.package_schema','inneranimalmedia.cms-component-package.v2',
 '$.manifest_sha256','e283cb0ffb13ecd51c3480b393d72872d2cc367799a4f971a0e7ba154e973be0')
WHERE renderer_key='platform/design-canvas-dark'
AND source_ref='r2://theme-store/cms/design-stock/v1/design-canvas-dark/9bc0fddfe00ba016/DesignCanvas.dc.html';
UPDATE cms_component_templates SET
preview_json=json_set(preview_json,
 '$.package_ref','cms-component:platform/design-canvas-dark@1.0.0',
 '$.manifest_key','packages/platform/design-canvas-dark/1.0.0/manifest.json',
 '$.manifest_sha256','e283cb0ffb13ecd51c3480b393d72872d2cc367799a4f971a0e7ba154e973be0')
WHERE definition_key='platform/design-canvas-dark'
AND r2_bucket='theme-store' AND source_html_r2_key='cms/design-stock/v1/design-canvas-dark/9bc0fddfe00ba016/DesignCanvas.dc.html';

UPDATE cms_components SET
package_ref='cms-component:platform/design-theme-settings@1.0.0',
artifact_r2_bucket='theme-store',
artifact_r2_key='packages/platform/design-theme-settings/1.0.0/manifest.json',
artifact_sha256='29d829d5f1b7377b976db73ceb2364ea2afae0751133f545aa4444a3025c3e46',
verification_json=json_set(verification_json,
 '$.package_schema','inneranimalmedia.cms-component-package.v2',
 '$.manifest_sha256','29d829d5f1b7377b976db73ceb2364ea2afae0751133f545aa4444a3025c3e46')
WHERE renderer_key='platform/design-theme-settings'
AND source_ref='r2://theme-store/cms/design-stock/v1/design-theme-settings/e996b43749b0539e/DesignCanvasSettings.dc.html';
UPDATE cms_component_templates SET
preview_json=json_set(preview_json,
 '$.package_ref','cms-component:platform/design-theme-settings@1.0.0',
 '$.manifest_key','packages/platform/design-theme-settings/1.0.0/manifest.json',
 '$.manifest_sha256','29d829d5f1b7377b976db73ceb2364ea2afae0751133f545aa4444a3025c3e46')
WHERE definition_key='platform/design-theme-settings'
AND r2_bucket='theme-store' AND source_html_r2_key='cms/design-stock/v1/design-theme-settings/e996b43749b0539e/DesignCanvasSettings.dc.html';

UPDATE cms_components SET
package_ref='cms-component:platform/design-publish-popover@1.0.0',
artifact_r2_bucket='theme-store',
artifact_r2_key='packages/platform/design-publish-popover/1.0.0/manifest.json',
artifact_sha256='6cbf40d2fba8e744103ff748ef084ad421d0fae04d629a2d963a81085557bc82',
verification_json=json_set(verification_json,
 '$.package_schema','inneranimalmedia.cms-component-package.v2',
 '$.manifest_sha256','6cbf40d2fba8e744103ff748ef084ad421d0fae04d629a2d963a81085557bc82')
WHERE renderer_key='platform/design-publish-popover'
AND source_ref='r2://theme-store/cms/design-stock/v1/design-publish-popover/d3aee0d5aefd6410/DesignCanvasPublish.dc.html';
UPDATE cms_component_templates SET
preview_json=json_set(preview_json,
 '$.package_ref','cms-component:platform/design-publish-popover@1.0.0',
 '$.manifest_key','packages/platform/design-publish-popover/1.0.0/manifest.json',
 '$.manifest_sha256','6cbf40d2fba8e744103ff748ef084ad421d0fae04d629a2d963a81085557bc82')
WHERE definition_key='platform/design-publish-popover'
AND r2_bucket='theme-store' AND source_html_r2_key='cms/design-stock/v1/design-publish-popover/d3aee0d5aefd6410/DesignCanvasPublish.dc.html';

UPDATE cms_components SET
package_ref='cms-component:platform/design-jump-to@1.0.0',
artifact_r2_bucket='theme-store',
artifact_r2_key='packages/platform/design-jump-to/1.0.0/manifest.json',
artifact_sha256='a58c39b626fdd45e945f616f2ee11e5bb8f3852326c9010a53c13a46ed03db6a',
verification_json=json_set(verification_json,
 '$.package_schema','inneranimalmedia.cms-component-package.v2',
 '$.manifest_sha256','a58c39b626fdd45e945f616f2ee11e5bb8f3852326c9010a53c13a46ed03db6a')
WHERE renderer_key='platform/design-jump-to'
AND source_ref='r2://theme-store/cms/design-stock/v1/design-jump-to/f92d687b33790563/DesignCanvasJump.dc.html';
UPDATE cms_component_templates SET
preview_json=json_set(preview_json,
 '$.package_ref','cms-component:platform/design-jump-to@1.0.0',
 '$.manifest_key','packages/platform/design-jump-to/1.0.0/manifest.json',
 '$.manifest_sha256','a58c39b626fdd45e945f616f2ee11e5bb8f3852326c9010a53c13a46ed03db6a')
WHERE definition_key='platform/design-jump-to'
AND r2_bucket='theme-store' AND source_html_r2_key='cms/design-stock/v1/design-jump-to/f92d687b33790563/DesignCanvasJump.dc.html';

UPDATE cms_components SET
package_ref='cms-component:platform/design-screen-sizes@1.0.0',
artifact_r2_bucket='theme-store',
artifact_r2_key='packages/platform/design-screen-sizes/1.0.0/manifest.json',
artifact_sha256='c0887bf12904070de451bc94aaf1b96af59d2b92aa89517d0d341b35bf10c718',
verification_json=json_set(verification_json,
 '$.package_schema','inneranimalmedia.cms-component-package.v2',
 '$.manifest_sha256','c0887bf12904070de451bc94aaf1b96af59d2b92aa89517d0d341b35bf10c718')
WHERE renderer_key='platform/design-screen-sizes'
AND source_ref='r2://theme-store/cms/design-stock/v1/design-screen-sizes/8dcaac1c0e39a646/DesignCanvasSizes.dc.html';
UPDATE cms_component_templates SET
preview_json=json_set(preview_json,
 '$.package_ref','cms-component:platform/design-screen-sizes@1.0.0',
 '$.manifest_key','packages/platform/design-screen-sizes/1.0.0/manifest.json',
 '$.manifest_sha256','c0887bf12904070de451bc94aaf1b96af59d2b92aa89517d0d341b35bf10c718')
WHERE definition_key='platform/design-screen-sizes'
AND r2_bucket='theme-store' AND source_html_r2_key='cms/design-stock/v1/design-screen-sizes/8dcaac1c0e39a646/DesignCanvasSizes.dc.html';

UPDATE cms_components SET
package_ref='cms-component:platform/mini-expanded@1.0.0',
artifact_r2_bucket='theme-store',
artifact_r2_key='packages/platform/mini-expanded/1.0.0/manifest.json',
artifact_sha256='db43fd7efa439943fc8d77ede2313b479cca1ec0bad1ec15f62f0509e568e7dd',
verification_json=json_set(verification_json,
 '$.package_schema','inneranimalmedia.cms-component-package.v2',
 '$.manifest_sha256','db43fd7efa439943fc8d77ede2313b479cca1ec0bad1ec15f62f0509e568e7dd')
WHERE renderer_key='platform/mini-expanded'
AND source_ref='r2://theme-store/cms/design-stock/v1/mini-expanded/ad82a3b422bbab6e/MiniAgentSamSettings.dc.html';
UPDATE cms_component_templates SET
preview_json=json_set(preview_json,
 '$.package_ref','cms-component:platform/mini-expanded@1.0.0',
 '$.manifest_key','packages/platform/mini-expanded/1.0.0/manifest.json',
 '$.manifest_sha256','db43fd7efa439943fc8d77ede2313b479cca1ec0bad1ec15f62f0509e568e7dd')
WHERE definition_key='platform/mini-expanded'
AND r2_bucket='theme-store' AND source_html_r2_key='cms/design-stock/v1/mini-expanded/ad82a3b422bbab6e/MiniAgentSamSettings.dc.html';

UPDATE cms_components SET
package_ref='cms-component:platform/mini-compact@1.0.0',
artifact_r2_bucket='theme-store',
artifact_r2_key='packages/platform/mini-compact/1.0.0/manifest.json',
artifact_sha256='e12ac702427b0e37825852675e0ab7870ecddb43b1d7fb49a48fb9a01fcee387',
verification_json=json_set(verification_json,
 '$.package_schema','inneranimalmedia.cms-component-package.v2',
 '$.manifest_sha256','e12ac702427b0e37825852675e0ab7870ecddb43b1d7fb49a48fb9a01fcee387')
WHERE renderer_key='platform/mini-compact'
AND source_ref='r2://theme-store/cms/design-stock/v1/mini-compact/a8b098552ef3c909/MiniAgentSam.dc.html';
UPDATE cms_component_templates SET
preview_json=json_set(preview_json,
 '$.package_ref','cms-component:platform/mini-compact@1.0.0',
 '$.manifest_key','packages/platform/mini-compact/1.0.0/manifest.json',
 '$.manifest_sha256','e12ac702427b0e37825852675e0ab7870ecddb43b1d7fb49a48fb9a01fcee387')
WHERE definition_key='platform/mini-compact'
AND r2_bucket='theme-store' AND source_html_r2_key='cms/design-stock/v1/mini-compact/a8b098552ef3c909/MiniAgentSam.dc.html';

UPDATE cms_components SET
package_ref='cms-component:platform/mini-confirmation@1.0.0',
artifact_r2_bucket='theme-store',
artifact_r2_key='packages/platform/mini-confirmation/1.0.0/manifest.json',
artifact_sha256='f4af68b7d0d96a1a5308d1daa692f8d0e80a107c12afcb1cb7f8deefdc26eb81',
verification_json=json_set(verification_json,
 '$.package_schema','inneranimalmedia.cms-component-package.v2',
 '$.manifest_sha256','f4af68b7d0d96a1a5308d1daa692f8d0e80a107c12afcb1cb7f8deefdc26eb81')
WHERE renderer_key='platform/mini-confirmation'
AND source_ref='r2://theme-store/cms/design-stock/v1/mini-confirmation/2e6608f2849b6235/MiniAgentSamPublish.dc.html';
UPDATE cms_component_templates SET
preview_json=json_set(preview_json,
 '$.package_ref','cms-component:platform/mini-confirmation@1.0.0',
 '$.manifest_key','packages/platform/mini-confirmation/1.0.0/manifest.json',
 '$.manifest_sha256','f4af68b7d0d96a1a5308d1daa692f8d0e80a107c12afcb1cb7f8deefdc26eb81')
WHERE definition_key='platform/mini-confirmation'
AND r2_bucket='theme-store' AND source_html_r2_key='cms/design-stock/v1/mini-confirmation/2e6608f2849b6235/MiniAgentSamPublish.dc.html';

UPDATE cms_components SET
package_ref='cms-component:platform/assistant-workspace@1.0.0',
artifact_r2_bucket='theme-store',
artifact_r2_key='packages/platform/assistant-workspace/1.0.0/manifest.json',
artifact_sha256='72c578a8503c0287613b9f5b0e849f452a695a1c7ba3cf965cddae070e4ef9c1',
verification_json=json_set(verification_json,
 '$.package_schema','inneranimalmedia.cms-component-package.v2',
 '$.manifest_sha256','72c578a8503c0287613b9f5b0e849f452a695a1c7ba3cf965cddae070e4ef9c1')
WHERE renderer_key='platform/assistant-workspace'
AND source_ref='r2://theme-store/cms/design-stock/v1/assistant-workspace/4b76065bfea7c428/SideAssistantWorkspace.dc.html';
UPDATE cms_component_templates SET
preview_json=json_set(preview_json,
 '$.package_ref','cms-component:platform/assistant-workspace@1.0.0',
 '$.manifest_key','packages/platform/assistant-workspace/1.0.0/manifest.json',
 '$.manifest_sha256','72c578a8503c0287613b9f5b0e849f452a695a1c7ba3cf965cddae070e4ef9c1')
WHERE definition_key='platform/assistant-workspace'
AND r2_bucket='theme-store' AND source_html_r2_key='cms/design-stock/v1/assistant-workspace/4b76065bfea7c428/SideAssistantWorkspace.dc.html';

UPDATE cms_components SET
package_ref='cms-component:platform/workspace-setup@1.0.0',
artifact_r2_bucket='theme-store',
artifact_r2_key='packages/platform/workspace-setup/1.0.0/manifest.json',
artifact_sha256='62159a90285d3b90c0eeba4194d929c20ebdb3bfd62a7f14417022ab694ed17f',
verification_json=json_set(verification_json,
 '$.package_schema','inneranimalmedia.cms-component-package.v2',
 '$.manifest_sha256','62159a90285d3b90c0eeba4194d929c20ebdb3bfd62a7f14417022ab694ed17f')
WHERE renderer_key='platform/workspace-setup'
AND source_ref='r2://theme-store/cms/design-stock/v1/workspace-setup/f61eff3a89145f13/Onboarding.dc.html';
UPDATE cms_component_templates SET
preview_json=json_set(preview_json,
 '$.package_ref','cms-component:platform/workspace-setup@1.0.0',
 '$.manifest_key','packages/platform/workspace-setup/1.0.0/manifest.json',
 '$.manifest_sha256','62159a90285d3b90c0eeba4194d929c20ebdb3bfd62a7f14417022ab694ed17f')
WHERE definition_key='platform/workspace-setup'
AND r2_bucket='theme-store' AND source_html_r2_key='cms/design-stock/v1/workspace-setup/f61eff3a89145f13/Onboarding.dc.html';

UPDATE cms_components SET
package_ref='cms-component:platform/style-spec-bw@1.0.0',
artifact_r2_bucket='theme-store',
artifact_r2_key='packages/platform/style-spec-bw/1.0.0/manifest.json',
artifact_sha256='a6228f0617a3d2403f65a29c859d4bad24af740465e73974209ff7701e638069',
verification_json=json_set(verification_json,
 '$.package_schema','inneranimalmedia.cms-component-package.v2',
 '$.manifest_sha256','a6228f0617a3d2403f65a29c859d4bad24af740465e73974209ff7701e638069')
WHERE renderer_key='platform/style-spec-bw'
AND source_ref='r2://theme-store/cms/design-stock/v1/style-spec-bw/b9d3a8ab28e58742/StyleSpec.dc.html';
UPDATE cms_component_templates SET
preview_json=json_set(preview_json,
 '$.package_ref','cms-component:platform/style-spec-bw@1.0.0',
 '$.manifest_key','packages/platform/style-spec-bw/1.0.0/manifest.json',
 '$.manifest_sha256','a6228f0617a3d2403f65a29c859d4bad24af740465e73974209ff7701e638069')
WHERE definition_key='platform/style-spec-bw'
AND r2_bucket='theme-store' AND source_html_r2_key='cms/design-stock/v1/style-spec-bw/b9d3a8ab28e58742/StyleSpec.dc.html';
