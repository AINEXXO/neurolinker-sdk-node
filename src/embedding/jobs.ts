import { NeuroLinkerConfigError } from "../errors.js";
import { buildUrl, fetchJson } from "../http.js";
import { waitForTerminalStatus } from "../polling.js";
import { parseOrThrow } from "../validation.js";
import {
  EmbeddingModalities,
  EmbeddingModalitiesInput,
  toEmbeddingModalitiesPayload,
} from "./models.js";

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
    modalities: EmbeddingModalitiesInput;
  }): Promise<Record<string, unknown>> {
    if (!args.bucketUid) {
      throw new NeuroLinkerConfigError("bucketUid must be a non-empty string.");
    }

    const parsed = parseOrThrow(EmbeddingModalities, args.modalities, "modalities");
    const payload = {
      bucket_uid: args.bucketUid,
      modalities: toEmbeddingModalitiesPayload(parsed),
    };

    return await fetchJson({
      url: buildUrl(this.baseUrl, "/v1/embed/jobs"),
      method: "POST",
      token: this.token,
      timeoutS: this.timeoutS,
      body: payload,
    });
  }

  async get(jobUid: string): Promise<Record<string, unknown>> {
    if (!jobUid) {
      throw new NeuroLinkerConfigError("jobUid must be a non-empty string.");
    }
    return await fetchJson({
      url: buildUrl(this.baseUrl, `/v1/embed/jobs/${jobUid}`),
      method: "GET",
      token: this.token,
      timeoutS: this.timeoutS,
    });
  }

  async wait(
    jobUid: string,
    opts?: {
      timeoutS?: number;
      pollIntervalS?: number;
      pollMaxIntervalS?: number;
    },
  ): Promise<Record<string, unknown>> {
    return await waitForTerminalStatus<Record<string, unknown>>({
      fetchStatus: () => this.get(jobUid),
      extractStatus: (r) => {
        const s = (r as Record<string, unknown>).status;
        return typeof s === "string" ? s : undefined;
      },
      timeoutS: opts?.timeoutS ?? this.timeoutS,
      pollIntervalS: opts?.pollIntervalS ?? this.pollIntervalS,
      pollMaxIntervalS: opts?.pollMaxIntervalS ?? this.pollMaxIntervalS,
      identifier: `embedding job ${jobUid}`,
    });
  }
}
