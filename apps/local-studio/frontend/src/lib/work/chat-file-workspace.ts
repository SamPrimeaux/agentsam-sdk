/** Conversation attachment -> canonical read-only FileWorkspace adapter.
 * Only resource resolution belongs here; all IDE rendering/preview stays in agentsam-ide.
 */
import { readChatAttachment, isTextChatFile, type ChatAttachmentReference } from '@/lib/content/chat-images';
import type { FileWorkspace, WorkspacePreview, WorkspaceEntry, WorkspaceWriteResult } from '@inneranimalmedia/agentsam-ide/workspace';
import { mediaKindForPath } from '@inneranimalmedia/agentsam-ide/workspace';

type Target = {blobId:string;name:string;mimeType:string;size:number;kind:'image'|'file'};
const readonlyError = () => { throw new Error('This conversation attachment is read only. Save a copy to edit it.'); };
const denied = (): WorkspaceWriteResult => ({ok:false,code:'permission',message:'Conversation attachments are read only. Save a copy to edit.'});

export function createChatFileWorkspace(target: Target, accountId: string): {workspace:FileWorkspace;path:string} {
  if (!accountId || !target.blobId || !target.size) throw new Error('An authorized attachment is required.');
  const path = (target.name.split(/[\\/]/).pop() || 'attachment').replace(/[\u0000-\u001f]/g,'_');
  const ref: ChatAttachmentReference = {
    id:'',name:target.name,mimeType:target.mimeType,size:target.size,kind:target.kind,
    source:{type:'blob',blobId:target.blobId},lifetime:'conversation',
  };
  async function load(requestPath:string):Promise<Blob> {
    if (requestPath!==path) throw new Error('The requested file is not in this conversation attachment.');
    return readChatAttachment(ref,accountId);
  }
  const entry:WorkspaceEntry={path,kind:'file',size:target.size,readonly:true};
  const workspace:FileWorkspace={
    async list(){return [entry];},
    async read(requestPath){
      if (!isTextChatFile(path,target.mimeType)) throw new Error('This binary file is only available as a preview or download.');
      const blob=await load(requestPath);
      if (blob.size>1_000_000) throw new Error('This source file is too large for the text editor.');
      return {path,content:await blob.text(),version:target.blobId,readonly:true,canRename:false,canDelete:false};
    },
    async preview(requestPath):Promise<WorkspacePreview|null>{
      const blob=await load(requestPath);
      const kind=mediaKindForPath(path);
      if (!kind) return {kind:'binary',url:'',contentType:blob.type,size:blob.size,version:target.blobId};
      const url=URL.createObjectURL(blob);
      return {kind,url,contentType:blob.type,size:blob.size,version:target.blobId,release:()=>URL.revokeObjectURL(url)};
    },
    async write(){return denied();},
    async create(){return readonlyError();},
    async rename(){return readonlyError();},
    async delete(){return readonlyError();},
    async search(){return [];},
    async history(){return [];},
    async restore(){return denied();},
    configuration:{readonly:true,manualSave:true,capabilities:{
      create:false,rename:false,delete:false,search:false,history:false,restore:false,
      changes:false,snapshot:false,
    }},
  };
  return {workspace,path};
}
