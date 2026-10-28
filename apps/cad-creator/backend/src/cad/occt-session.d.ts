declare module '@inneranimalmedia/agentsam-occt/session' {
 export function createOcctSession(config:{binary:string;timeoutMs?:number}):{
  request(input:Record<string,unknown>):Promise<any>;
  close():void;
 };
}
