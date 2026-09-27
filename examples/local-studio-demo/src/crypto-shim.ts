/**
 * Browser shim for node:crypto's createHash("sha256") used by the
 * machine pass. Synchronous FNV-1a based fallback — fine for a demo;
 * real hosts run the machine pass in a Worker with WebCrypto.
 */
export function createHash(_algo: string) {
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  const chunks: Uint8Array[] = [];
  return {
    update(bytes: Uint8Array) {
      chunks.push(bytes);
      return this;
    },
    digest(_enc: string): string {
      for (const chunk of chunks) {
        for (const byte of chunk) {
          h1 = ((h1 ^ byte) * 0x01000193) >>> 0;
          h2 = ((h2 ^ byte) * 0x01000197) >>> 0;
        }
      }
      const part = (n: number) => n.toString(16).padStart(8, "0");
      return (part(h1) + part(h2)).repeat(4);
    },
  };
}
