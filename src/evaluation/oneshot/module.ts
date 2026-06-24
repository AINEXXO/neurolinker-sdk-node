import { JobsResource } from "./jobs.js";
import { ResultsResource } from "./results.js";

export class OneshotModule {
  public readonly jobs: JobsResource;

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
    this._results = new ResultsResource(args.baseUrl, args.token, args.timeoutS);
  }

  /**
   * POST /v1/eval/oneshot/results then download the parsed `result.json`
   * (`{ eval_uid, rows, summary }`). Raises if the result isn't ready — call
   * `jobs.wait` first.
   */
  async results(evalUid: string): Promise<Record<string, unknown>> {
    return await this._results.results(evalUid);
  }
}
