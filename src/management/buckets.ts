import { NeuroLinkerConfigError } from "../errors.js";
import { buildUrl, fetchJson, fetchVoid } from "../http.js";

export interface BucketSource {
  requestUid: string;
  docUids?: string[];
}

function validateSources(sources: unknown): asserts sources is BucketSource[] {
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new NeuroLinkerConfigError("sources must be a non-empty list.");
  }
  sources.forEach((src, idx) => {
    if (!src || typeof src !== "object" || Array.isArray(src)) {
      throw new NeuroLinkerConfigError(
        `sources[${idx}] must be an object with 'requestUid' (and optional 'docUids').`,
      );
    }
    const requestUid = (src as Record<string, unknown>).requestUid;
    if (typeof requestUid !== "string" || !requestUid) {
      throw new NeuroLinkerConfigError(
        `sources[${idx}].requestUid must be a non-empty string.`,
      );
    }
  });
}

function toSourcePayload(s: BucketSource): Record<string, unknown> {
  const out: Record<string, unknown> = { request_uid: s.requestUid };
  if (s.docUids !== undefined) out.doc_uids = s.docUids;
  return out;
}

export class BucketsResource {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutS: number,
  ) {}

  async create(args: { name: string }): Promise<Record<string, unknown>> {
    if (!args.name) {
      throw new NeuroLinkerConfigError("name must be a non-empty string.");
    }
    return await fetchJson({
      url: buildUrl(this.baseUrl, "/v1/management/buckets"),
      method: "POST",
      token: this.token,
      timeoutS: this.timeoutS,
      body: { name: args.name },
    });
  }

  async addSources(
    bucketUid: string,
    args: { sources: BucketSource[] },
  ): Promise<void> {
    if (!bucketUid) {
      throw new NeuroLinkerConfigError("bucketUid must be a non-empty string.");
    }
    validateSources(args.sources);

    return await fetchVoid({
      url: buildUrl(this.baseUrl, `/v1/management/buckets/${bucketUid}/sources`),
      method: "POST",
      token: this.token,
      timeoutS: this.timeoutS,
      body: { sources: args.sources.map(toSourcePayload) },
    });
  }

  async list(): Promise<Record<string, unknown>> {
    return await fetchJson({
      url: buildUrl(this.baseUrl, "/v1/management/buckets"),
      method: "GET",
      token: this.token,
      timeoutS: this.timeoutS,
    });
  }

  async get(bucketUid: string): Promise<Record<string, unknown>> {
    if (!bucketUid) {
      throw new NeuroLinkerConfigError("bucketUid must be a non-empty string.");
    }
    return await fetchJson({
      url: buildUrl(this.baseUrl, `/v1/management/buckets/${bucketUid}`),
      method: "GET",
      token: this.token,
      timeoutS: this.timeoutS,
    });
  }

  async delete(bucketUid: string): Promise<void> {
    if (!bucketUid) {
      throw new NeuroLinkerConfigError("bucketUid must be a non-empty string.");
    }
    return await fetchVoid({
      url: buildUrl(this.baseUrl, `/v1/management/buckets/${bucketUid}`),
      method: "DELETE",
      token: this.token,
      timeoutS: this.timeoutS,
    });
  }
}
