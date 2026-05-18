import { NeuroLinkerConfigError } from "../errors.js";
import { buildUrl, fetchJson } from "../http.js";
import { waitForTerminalStatus } from "../polling.js";
import { parseListOrThrow, parseOrThrow } from "../validation.js";
import {
  FieldMapping,
  FieldMappingInput,
  VectorDBConfig,
  VectorDBConfigInput,
  toFieldMappingPayload,
  toVectorDBConfigPayload,
} from "./models.js";

const TERMINAL_STATES = new Set(["completed", "failed"]);

function buildLoadJobPayload(args: {
  bucketUid: string;
  collectionName: string;
  fieldMappings: FieldMappingInput[];
  vectorDbConfig: VectorDBConfigInput;
  database: string;
}): Record<string, unknown> {
  if (!args.bucketUid) {
    throw new NeuroLinkerConfigError("bucketUid must be a non-empty string.");
  }
  if (!args.collectionName) {
    throw new NeuroLinkerConfigError("collectionName must be a non-empty string.");
  }

  const fieldMappings = parseListOrThrow(FieldMapping, args.fieldMappings, "fieldMappings");
  const vectorDbConfig = parseOrThrow(VectorDBConfig, args.vectorDbConfig, "vectorDbConfig");

  return {
    bucket_uid: args.bucketUid,
    collection_name: args.collectionName,
    field_mappings: fieldMappings.map(toFieldMappingPayload),
    vector_db_config: toVectorDBConfigPayload(vectorDbConfig),
    database: args.database || "",
  };
}

export class JobsResource {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutS: number,
    private readonly pollIntervalS: number,
    private readonly pollMaxIntervalS: number,
  ) {}

  async create(args: {
    bucketUid: string;
    collectionName: string;
    fieldMappings: FieldMappingInput[];
    vectorDbConfig: VectorDBConfigInput;
    database?: string;
  }): Promise<Record<string, unknown>> {
    const payload = buildLoadJobPayload({
      bucketUid: args.bucketUid,
      collectionName: args.collectionName,
      fieldMappings: args.fieldMappings,
      vectorDbConfig: args.vectorDbConfig,
      database: args.database ?? "",
    });

    return await fetchJson({
      url: buildUrl(this.baseUrl, "/v1/vector-store/jobs"),
      method: "POST",
      token: this.token,
      timeoutS: this.timeoutS,
      body: payload,
    });
  }

  async get(bucketUid: string, jobUid: string): Promise<Record<string, unknown>> {
    if (!bucketUid) {
      throw new NeuroLinkerConfigError("bucketUid must be a non-empty string.");
    }
    if (!jobUid) {
      throw new NeuroLinkerConfigError("jobUid must be a non-empty string.");
    }
    return await fetchJson({
      url: buildUrl(this.baseUrl, `/v1/vector-store/jobs/${bucketUid}/${jobUid}`),
      method: "GET",
      token: this.token,
      timeoutS: this.timeoutS,
    });
  }

  async wait(
    bucketUid: string,
    jobUid: string,
    opts?: {
      timeoutS?: number;
      pollIntervalS?: number;
      pollMaxIntervalS?: number;
    },
  ): Promise<Record<string, unknown>> {
    return await waitForTerminalStatus<Record<string, unknown>>({
      fetchStatus: () => this.get(bucketUid, jobUid),
      extractStatus: (r) => {
        const s = (r as Record<string, unknown>).status;
        return typeof s === "string" ? s : undefined;
      },
      timeoutS: opts?.timeoutS ?? this.timeoutS,
      pollIntervalS: opts?.pollIntervalS ?? this.pollIntervalS,
      pollMaxIntervalS: opts?.pollMaxIntervalS ?? this.pollMaxIntervalS,
      terminalStates: TERMINAL_STATES,
      identifier: `vector-load job ${jobUid}`,
    });
  }
}
