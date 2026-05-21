import { NeuroLinkerConfigError } from "../errors.js";
import { buildUrl, fetchJson } from "../http.js";
import { waitForTerminalStatus } from "../polling.js";
import { parseListOrThrow } from "../validation.js";
import { Content, contentToPayload, type ContentInput } from "./models.js";

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
    embeddings: ContentInput[];
  }): Promise<Record<string, unknown>> {
    if (!args.bucketUid) {
      throw new NeuroLinkerConfigError("bucketUid must be a non-empty string.");
    }

    const parsed = parseListOrThrow(Content, args.embeddings, "embeddings");
    const payload: Record<string, unknown> = {
      bucket_uid: args.bucketUid,
      embeddings: parsed.map(contentToPayload),
    };

    return await fetchJson({
      url: buildUrl(this.baseUrl, "/v1/embed/jobs"),
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
      url: buildUrl(this.baseUrl, `/v1/embed/jobs/${bucketUid}/${jobUid}`),
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
      identifier: `embedding job ${jobUid}`,
    });
  }
}
