import { assertContextPack, assertRetrievalQuery, KNOWLEDGE_OPERATIONS } from "./contracts.js";

export class KnowledgeClient {
  constructor({ transport }) {
    if (!transport || typeof transport.request !== "function") {
      throw new TypeError("KnowledgeClient requires a transport.request function");
    }
    this.transport = transport;
  }

  async retrieve(query) {
    const payload = assertRetrievalQuery(query);
    return assertContextPack(await this.transport.request(KNOWLEDGE_OPERATIONS.RETRIEVE, payload));
  }

  async index(sourceId, { incremental = true } = {}) {
    if (!String(sourceId || "").trim()) throw new TypeError("sourceId is required");
    return this.transport.request(KNOWLEDGE_OPERATIONS.INDEX, { source_id: sourceId, incremental });
  }
}
