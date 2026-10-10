import type { CmsRepository, CmsIdentity, CmsDocument } from './index.js';
export type NodeSqliteCmsRepository = CmsRepository & {
  close:()=>void;
  digest:(value:unknown)=>string;
  getPublication:(identity:CmsIdentity,pageId:string,version?:number|null)=>{document:CmsDocument;version:number;digest:string}|null;
};
export declare function createNodeSqliteCmsRepository(options:{filename:string}):Promise<NodeSqliteCmsRepository>;
