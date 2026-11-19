import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const source = new URL("../packages/theme-contract/runtime/portable-sections.css", import.meta.url);
const target = new URL("../backend/cms/portable-styles.compiled.mjs", import.meta.url);
const css = await readFile(source, "utf8");
const digest = createHash("sha256").update(css).digest("hex");
const output = [
  "// GENERATED from packages/theme-contract/runtime/portable-sections.css. Do not edit.",
  `// sha256: ${digest}`,
  `export const PORTABLE_SECTION_STYLES = ${JSON.stringify(css)};`,
  "",
].join("\n");
await writeFile(target, output);
console.log(`[portable styles compiled] sha256 ${digest}`);
