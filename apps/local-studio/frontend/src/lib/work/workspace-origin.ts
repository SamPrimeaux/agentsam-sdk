/** Never bootstrap an authorized PTY/filesystem capability from a remote address. */
export function trustedLoopbackRuntimeOrigin(baseUrl: string): string | null {
  try {
    const url=new URL(baseUrl);
    if(url.protocol!=="http:" || !["127.0.0.1","localhost","[::1]"].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash || url.pathname!=="/")return null;
    return url.origin;
  }catch{return null}
}
