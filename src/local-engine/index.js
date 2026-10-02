import { assertEngineContract } from './contracts.js';
import { defaultLocalEngines } from './engines.js';

export class LocalEngineRegistry {
  constructor(engines = defaultLocalEngines()) { this.engines = new Map(engines.map((engine) => [engine.id, assertEngineContract(engine)])); }
  register(engine) { this.engines.set(engine.id, assertEngineContract(engine)); return this; }
  get(id) { const engine = this.engines.get(id); if (!engine) throw new Error(`unknown_local_engine:${id}`); return engine; }
  list() { return [...this.engines.values()].map((engine) => engine.id); }
  async discover() { return Promise.all([...this.engines.values()].map((engine) => engine.discover())); }
  async capabilities(request = {}) { return this.get(request.engine_id || request.engineId).capabilities(request); }
}

export function createLocalEngineRegistry(options = {}) { return new LocalEngineRegistry(options.engines || defaultLocalEngines(options)); }
export * from './contracts.js';
export * from './engines.js';
export * from './audit.js';
export * from './assets.js';
export * from './benchmark.js';
