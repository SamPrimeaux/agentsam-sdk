import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const source = JSON.parse(readFileSync(path.join(publicDir, "source-assets-manifest.json"), "utf8"));
const stlDir = path.join(publicDir, "stl");
const delivered = readdirSync(stlDir).filter((name) => name.endsWith(".stl.gz"));
if (source.sourceParts !== 47 || delivered.length !== 47 || source.parts.length !== 47) {
  throw new Error("SamSketch requires all 47 source STL parts; inventory or packaged geometry is incomplete.");
}
const inventorySource = readFileSync(path.join(root, "src/source-parts.generated.ts"), "utf8");
const match = inventorySource.match(/export const sourcePartCatalog: SourcePartDefinition\[\] = ([\s\S]*);\s*$/);
if (!match) throw new Error("Unable to read the generated source-part inventory.");
const parts = JSON.parse(match[1]);
if (parts.length !== 47) throw new Error("Expected 47 generated source-part inventory records.");
for (const part of parts) {
  if (!existsSync(path.join(stlDir, part.id + ".stl.gz"))) throw new Error("Missing compressed source geometry: " + part.id);
  if (part.preview && !existsSync(path.join(publicDir, part.preview))) throw new Error("Missing source preview: " + part.preview);
}
const templateSource = readFileSync(path.join(root, "src/templates.ts"), "utf8");
const namesMatch = templateSource.match(/const authoredNames=\[([\s\S]*?)\] as const;/);
if (!namesMatch) throw new Error("Unable to read authored composition catalog.");
const compositions = [...namesMatch[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
if (compositions.length !== 20) throw new Error("Expected 20 authored compositions.");
for (const id of compositions) {
  if (!existsSync(path.join(publicDir, "web", id + ".webp"))) throw new Error("Missing authored composition preview: web/" + id + ".webp");
}
for (const record of source.parts) {
  const file = path.join(publicDir, record.deliveryPath);
  if (!existsSync(file) || statSync(file).size !== record.deliveryBytes) throw new Error("Missing or changed source asset: " + record.deliveryPath);
}
console.log("SamSketch assets verified: 20 compositions, 47 source parts, " + source.previews + " authored previews.");
