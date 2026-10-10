import { defineSamOperation } from '../../define.js';

/**
 * Portable authoring operations. The compiler is an explicitly installed Theme
 * Tools adapter. All privileged reads/writes go through the host's existing CMS.
 * No FNF paths, hardcoded tenant or second revision/publishing authority.
 */
export function createAuthoringOperations({compiler,repository,resolveTrustedContext,authorize}={}) {
  for (const name of ['compileHtmlAuthoring','compileScopedStyles','compileSourcePatch']) {
    if (typeof compiler?.[name]!=='function') throw new Error('sam_authoring_compiler_missing:'+name);
  }
  if (typeof repository?.getSource!=='function' || typeof repository?.saveDraftStyles!=='function' ||
      typeof repository?.saveSourceDraft!=='function' || typeof resolveTrustedContext!=='function' ||
      typeof authorize!=='function') throw new Error('sam_authoring_requires_authorized_cms_adapter');

  const principalFor=async (action, ctx, input)=>{
    const principal=await resolveTrustedContext(ctx);
    if (!principal?.accountId || !principal?.actorId) throw new Error('sam_authoring_trusted_principal_required');
    if (!input?.artifactId || typeof input.artifactId!=='string') throw new Error('sam_authoring_artifact_id_required');
    if (await authorize({principal,action,artifactId:input.artifactId,pageId:input.pageId,sectionId:input.sectionId})!==true) {
      throw new Error('sam_authoring_access_denied');
    }
    return principal;
  };
  const read=async(principal,input)=>{
    const record=await repository.getSource({principal,artifactId:input.artifactId});
    if (!record || typeof record.source!=='string' || !Number.isInteger(record.revision) || !record.contentHash) {
      throw new Error('sam_authoring_source_unavailable');
    }
    return record;
  };
  const compile=(record,input)=>compiler.compileHtmlAuthoring({
    html:record.source,filename:record.filename||input.artifactId,
    scope:input.scope,fragment:record.fragment??false
  });
  const requireExpected=(input,record)=>{
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision!==record.revision ||
        typeof input.expectedHash!=='string' || input.expectedHash!==record.contentHash) {
      throw new Error('sam_authoring_stale_revision');
    }
  };
  const op=(id,action,capability,handler,write=false)=>defineSamOperation({
    id,module:'authoring',action,summary:'Authorized component '+action+' through the installed source compiler and existing CMS.',
    purpose:'Portable and scoped component authoring without another CMS authority.',
    execution:{lanes:['local','remote','sandbox'],model:'never',network:'optional',sideEffects:write?'cms_draft':'none'},
    risk:write?'write':'read_only',capabilities:[capability],status:'experimental',handler
  });

  return [
    op('sam.authoring.inspect','inspect','cms.artifact.read',async(input={},ctx={})=>{
      const principal=await principalFor('read',ctx,input);
      const record=await read(principal,input);
      const compiled=compile(record,input);
      return {artifactId:input.artifactId,revision:record.revision,contentHash:record.contentHash,
        schema:compiled.schema,scope:compiled.scope,bindings:compiled.bindings,diagnostics:compiled.diagnostics};
    }),
    op('sam.authoring.previewStyles','previewStyles','cms.section.read',async(input={},ctx={})=>{
      const principal=await principalFor('read',ctx,input);
      const record=await read(principal,input);
      requireExpected(input,record);
      const compiled=compile(record,input);
      const compiledCss=compiler.compileScopedStyles({compiled,edits:input.edits||[]});
      return {artifactId:input.artifactId,revision:record.revision,contentHash:record.contentHash,
        annotatedHtml:compiled.annotatedHtml,css:compiledCss.css,bindings:compiled.bindings};
    }),
    op('sam.authoring.saveDraftStyles','saveDraftStyles','cms.section.write',async(input={},ctx={})=>{
      const principal=await principalFor('write',ctx,input);
      const record=await read(principal,input);
      requireExpected(input,record);
      if (typeof input.pageId!=='string'||!input.pageId||typeof input.sectionId!=='string'||!input.sectionId) {
        throw new Error('sam_authoring_page_and_section_required');
      }
      const compiled=compile(record,input);
      const compiledCss=compiler.compileScopedStyles({compiled,edits:input.edits||[]});
      // The host adapter must atomically check expected CMS revision and update
      // cms_page_sections through cms_revisions. No raw SQL or publication here.
      const saved=await repository.saveDraftStyles({principal,pageId:input.pageId,sectionId:input.sectionId,
        artifactId:input.artifactId,scope:compiled.scope,edits:input.edits||[],css:compiledCss.css,
        expectedRevision:input.expectedRevision,expectedHash:input.expectedHash,expectedCmsRevision:input.expectedCmsRevision});
      if (!saved || saved.ok!==true || !saved.revisionId) throw new Error('sam_authoring_draft_write_unconfirmed');
      return {saved:true,revisionId:saved.revisionId,published:false,artifactId:input.artifactId};
    },true),
    op('sam.authoring.proposeSourcePatch','proposeSourcePatch','cms.artifact.read',async(input={},ctx={})=>{
      const principal=await principalFor('read',ctx,input);
      const record=await read(principal,input);
      requireExpected(input,record);
      const result=compiler.compileSourcePatch({source:record.source,patches:input.patches});
      return {artifactId:input.artifactId,baseRevision:record.revision,contentHash:record.contentHash,
        proposedSource:result.source,patches:result.patches,published:false};
    }),
    op('sam.authoring.saveSourceDraft','saveSourceDraft','cms.artifact.write',async(input={},ctx={})=>{
      const principal=await principalFor('write',ctx,input);
      const record=await read(principal,input);
      requireExpected(input,record);
      if (input.approved!==true) throw new Error('sam_authoring_source_patch_review_required');
      const result=compiler.compileSourcePatch({source:record.source,patches:input.patches});
      // Immutable versioned R2 artifact and CMS revision are enforced by adapter.
      // The operation never executes JS or publishes to live.
      const saved=await repository.saveSourceDraft({principal,artifactId:input.artifactId,
        source:result.source,patches:result.patches,
        expectedRevision:input.expectedRevision,expectedHash:input.expectedHash});
      if (!saved || saved.ok!==true || !saved.revisionId || !saved.artifactId) {
        throw new Error('sam_authoring_source_write_unconfirmed');
      }
      return {saved:true,published:false,revisionId:saved.revisionId,artifactId:saved.artifactId};
    },true)
  ];
}
