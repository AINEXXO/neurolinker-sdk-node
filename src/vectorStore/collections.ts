import { buildUrl, fetchJson } from "../http.js";
import { parseOrThrow } from "../validation.js";
import {
  CollectionSchema,
  CollectionSchemaInput,
  VectorDBConfig,
  VectorDBConfigInput,
  toCollectionSchemaPayload,
  toVectorDBConfigPayload,
} from "./models.js";

export class CollectionsResource {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutS: number,
  ) {}

  async create(args: {
    collection: CollectionSchemaInput;
    vectorDbConfig: VectorDBConfigInput;
    database?: string;
  }): Promise<Record<string, unknown>> {
    const collection = parseOrThrow(CollectionSchema, args.collection, "collection");
    const vectorDbConfig = parseOrThrow(VectorDBConfig, args.vectorDbConfig, "vectorDbConfig");

    const payload = {
      collection: toCollectionSchemaPayload(collection),
      vector_db_config: toVectorDBConfigPayload(vectorDbConfig),
      database: args.database ?? "",
    };

    return await fetchJson({
      url: buildUrl(this.baseUrl, "/v1/vector-store/collections"),
      method: "POST",
      token: this.token,
      timeoutS: this.timeoutS,
      body: payload,
    });
  }
}
