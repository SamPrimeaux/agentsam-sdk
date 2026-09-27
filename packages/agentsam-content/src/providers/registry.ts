import type { ContentProviderName } from "../core/source.js";
import type { ContentProvider, ProviderCapability } from "./types.js";

export class ProviderRegistry {
  private providers = new Map<ContentProviderName, ContentProvider>();

  register(provider: ContentProvider): this {
    this.providers.set(provider.name, provider);
    return this;
  }

  get(name: ContentProviderName): ContentProvider {
    const p = this.providers.get(name);
    if (!p) throw new Error(`Unknown content provider: ${String(name)}`);
    return p;
  }

  has(name: ContentProviderName): boolean {
    return this.providers.has(name);
  }

  all(): ContentProvider[] {
    return [...this.providers.values()];
  }

  withCapability(cap: ProviderCapability): ContentProvider[] {
    return this.all().filter((p) => p.capabilities.includes(cap));
  }

  names(): ContentProviderName[] {
    return [...this.providers.keys()];
  }
}

export function createProviderRegistry(providers: ContentProvider[] = []): ProviderRegistry {
  const registry = new ProviderRegistry();
  for (const p of providers) registry.register(p);
  return registry;
}
