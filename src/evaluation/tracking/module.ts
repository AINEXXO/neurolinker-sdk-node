import { QueriesResource, TracksResource } from "./tracks.js";

export class TrackingModule {
  /** Track CRUD (`.tracks.create` / `.list` / `.setActive`). */
  public readonly tracks: TracksResource;

  private readonly _queries: QueriesResource;

  constructor(args: { baseUrl: string; token: string; timeoutS: number }) {
    this.tracks = new TracksResource(args.baseUrl, args.token, args.timeoutS);
    this._queries = new QueriesResource(args.baseUrl, args.token, args.timeoutS);
  }

  /** Per-query rows a track has accumulated, most recent first. */
  async queries(trackUid: string, opts?: { limit?: number }): Promise<Record<string, unknown>> {
    return await this._queries.list(trackUid, opts);
  }

  /** Drill-down for a single evaluated query. */
  async query(trackUid: string, traceId: string): Promise<Record<string, unknown>> {
    return await this._queries.get(trackUid, traceId);
  }
}
