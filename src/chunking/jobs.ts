import { NeuroLinkerConfigError } from "../errors.js";
import { buildUrl, fetchJson } from "../http.js";
import { waitForTerminalStatus } from "../polling.js";
import { parseOrThrow } from "../validation.js";
import {
  ChunkingConfig,
  ChunkingConfigInput,
  toChunkingPayload,
} from "./models.js";

const TERMINAL_STATES = new Set(["completed", "failed"]);

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
    chunking: ChunkingConfigInput;
  }): Promise<Record<string, unknown>> {
    if (!args.bucketUid) {
      throw new NeuroLinkerConfigError("bucketUid must be a non-empty string.");
    }

    const parsed = parseOrThrow(ChunkingConfig, args.chunking, "chunking config");
    const payload = {
      bucket_uid: args.bucketUid,
      chunking: toChunkingPayload(parsed),
    };

    return await fetchJson({
      url: buildUrl(this.baseUrl, "/v1/chunk/jobs"),
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
      url: buildUrl(this.baseUrl, `/v1/chunk/jobs/${bucketUid}/${jobUid}`),
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
      identifier: `chunking job ${jobUid}`,
    });
  }
}
