import type { LspMessage } from './contract.js';
export declare const LANGUAGE_EXECUTABLES: Readonly<Record<string,{name:string;args:string[]}>>;
export declare function resolveLanguageServerBinary(name:string,env?:Record<string,string|undefined>):string|null;
export declare class LspHost {
  constructor(opts:{root:string;spawnProcess?:Function;maxSessions?:number;maxMessages?:number});
  listAvailable():string[];
  capabilities():Record<string,{installed:boolean;binary:string}>;
  start(language:string):{ok:boolean;session_id?:string;language?:string;transport?:string;error?:string;server?:string};
  send(id:string,message:LspMessage):{ok:boolean;error?:string};
  poll(id:string,after?:number):{ok:boolean;session_id?:string;running?:boolean;error?:string|null;cursor?:number;messages?:Array<{seq:number;message:LspMessage}>};
  stop(id:string):{ok:boolean;error?:string};
  close():void;
}
