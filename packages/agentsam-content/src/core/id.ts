const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

function randomBase36(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export function newAssetId(): string {
  return `ast_${Date.now().toString(36)}${randomBase36(10)}`;
}

export function newRevisionId(): string {
  return `rev_${Date.now().toString(36)}${randomBase36(8)}`;
}

export function newJobId(): string {
  return `job_${Date.now().toString(36)}${randomBase36(8)}`;
}

export function newBatchId(seq?: number): string {
  return seq !== undefined
    ? `import_${String(seq).padStart(4, "0")}`
    : `import_${randomBase36(6)}`;
}
