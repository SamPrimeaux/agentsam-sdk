import { templateCatalog } from "./templates";
import { sourcePartCatalog } from "./source-parts.generated";

export type InventoryKind = "composition" | "source-part";
export type ModelInventoryEntry = {
  key: string;
  id: string;
  sku: string;
  name: string;
  kind: InventoryKind;
  category: string;
  preview: string | null;
  sourcePaths: string[];
  sourceCount: number;
};

function initialSku(key: string): number {
  let hash = 2166136261;
  for (const character of key) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return 100 + ((hash >>> 0) % 900);
}

/** Stable, SKU-shaped display identifiers. They are metadata, never file identities. */
function assignSkus(keys: string[]): Map<string, string> {
  const assigned = new Map<string, string>();
  const used = new Set<number>();
  for (const key of [...keys].sort((a, b) => a.localeCompare(b))) {
    let number = initialSku(key);
    while (used.has(number)) number = number >= 999 ? 100 : number + 1;
    used.add(number);
    assigned.set(key, "AB-" + String(number).padStart(3, "0"));
  }
  return assigned;
}

const rawEntries: Omit<ModelInventoryEntry, "sku">[] = [
  ...templateCatalog.map((template) => ({
    key: "composition:" + template.id,
    id: template.id,
    name: template.name,
    kind: "composition" as const,
    category: template.category,
    preview: template.preview,
    sourcePaths: template.parts.map((part) => "stl/" + part + ".stl"),
    sourceCount: template.parts.length,
  })),
  ...sourcePartCatalog.map((part) => ({
    key: "part:" + part.id,
    id: part.id,
    name: part.name,
    kind: "source-part" as const,
    category: "Source STL",
    preview: part.preview,
    sourcePaths: [part.sourcePath],
    sourceCount: 1,
  })),
];

const skuMap = assignSkus(rawEntries.map((entry) => entry.key));
export const modelInventory: ModelInventoryEntry[] = rawEntries.map((entry) => ({
  ...entry,
  sku: skuMap.get(entry.key)!,
}));
export const compositionInventory = modelInventory.filter((entry) => entry.kind === "composition");
export const sourcePartInventory = modelInventory.filter((entry) => entry.kind === "source-part");
export function findInventoryEntry(key: string): ModelInventoryEntry | undefined {
  return modelInventory.find((entry) => entry.key === key);
}
export function modelLabel(ref: string): string {
  if (ref.startsWith("part:")) {
    return sourcePartInventory.find((entry) => entry.id === ref.slice(5))?.name || ref.slice(5);
  }
  return compositionInventory.find((entry) => entry.id === ref)?.name || ref;
}
