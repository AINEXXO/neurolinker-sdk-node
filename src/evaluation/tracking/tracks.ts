import { NeuroLinkerConfigError } from "../../errors.js";
import { buildUrl, fetchJson } from "../../http.js";

export class TracksResource {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutS: number,
  ) {}

  /**
   * POST /v1/eval/tracks — create a track (a long-lived container for continuous
   * evaluation of a production RAG). Returns the body carrying `track_uid` (keep
   * it: it's what you pass to `instrument`).
   */
  async create(args: { name: string }): Promise<Record<string, unknown>> {
    if (!args.name) {
      throw new NeuroLinkerConfigError("name must be a non-empty string.");
    }
    return await fetchJson<Record<string, unknown>>({
      url: buildUrl(this.baseUrl, "/v1/eval/tracks"),
      method: "POST",
      token: this.token,
      timeoutS: this.timeoutS,
      body: { name: args.name },
    });
  }

  /** GET /v1/eval/tracks — all the caller's tracks (active + disabled), each
   * carrying its `active` flag. */
  async list(): Promise<Record<string, unknown>> {
    return await fetchJson<Record<string, unknown>>({
      url: buildUrl(this.baseUrl, "/v1/eval/tracks"),
      method: "GET",
      token: this.token,
      timeoutS: this.timeoutS,
    });
  }

  /**
   * PATCH /v1/eval/tracks/{trackUid} — enable/disable a track. While disabled,
   * ingest refuses its traces and the evaluator skips it; the historical records
   * stay readable.
   */
  async setActive(trackUid: string, args: { active: boolean }): Promise<Record<string, unknown>> {
    if (!trackUid) {
      throw new NeuroLinkerConfigError("trackUid must be a non-empty string.");
    }
    return await fetchJson<Record<string, unknown>>({
      url: buildUrl(this.baseUrl, `/v1/eval/tracks/${trackUid}`),
      method: "PATCH",
      token: this.token,
      timeoutS: this.timeoutS,
      body: { active: args.active },
    });
  }
}

export class QueriesResource {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutS: number,
  ) {}

  /** GET /v1/eval/tracks/{trackUid}/queries — per-query rows, most recent first. */
  async list(trackUid: string, opts?: { limit?: number }): Promise<Record<string, unknown>> {
    if (!trackUid) {
      throw new NeuroLinkerConfigError("trackUid must be a non-empty string.");
    }
    const limit = opts?.limit ?? 100;
    return await fetchJson<Record<string, unknown>>({
      url: buildUrl(this.baseUrl, `/v1/eval/tracks/${trackUid}/queries?limit=${limit}`),
      method: "GET",
      token: this.token,
      timeoutS: this.timeoutS,
    });
  }

  /** GET /v1/eval/tracks/{trackUid}/queries/{traceId} — drill-down for one query. */
  async get(trackUid: string, traceId: string): Promise<Record<string, unknown>> {
    if (!trackUid || !traceId) {
      throw new NeuroLinkerConfigError("trackUid and traceId must be non-empty.");
    }
    return await fetchJson<Record<string, unknown>>({
      url: buildUrl(this.baseUrl, `/v1/eval/tracks/${trackUid}/queries/${traceId}`),
      method: "GET",
      token: this.token,
      timeoutS: this.timeoutS,
    });
  }
}
