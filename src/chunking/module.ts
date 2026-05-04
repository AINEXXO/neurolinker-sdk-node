import { AnalyzeResource } from "./analyze.js";
import { JobsResource } from "./jobs.js";
import { ResultsResource } from "./results.js";

export class ChunkingModule {
  public readonly jobs: JobsResource;

  private readonly _analyze: AnalyzeResource;
  private readonly _results: ResultsResource;

  constructor(args: {
    baseUrl: string;
    token: string;
    timeoutS: number;
    pollIntervalS: number;
    pollMaxIntervalS: number;
  }) {
    this.jobs = new JobsResource(
      args.baseUrl,
      args.token,
      args.timeoutS,
      args.pollIntervalS,
      args.pollMaxIntervalS,
    );
    this._analyze = new AnalyzeResource(args.baseUrl, args.token, args.timeoutS);
    this._results = new ResultsResource(args.baseUrl, args.token, args.timeoutS);
  }

  async analyze(bucketUid: string): Promise<Record<string, unknown>> {
    return await this._analyze.analyze(bucketUid);
  }

  async results(bucketUid: string): Promise<Record<string, Buffer>> {
    return await this._results.results(bucketUid);
  }
}
