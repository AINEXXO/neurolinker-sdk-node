import { JobsResource } from "./jobs.js";
import { ModelsResource } from "./modelsApi.js";
import { ResultsResource } from "./results.js";

export class EmbeddingModule {
  public readonly jobs: JobsResource;

  private readonly _models: ModelsResource;
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
    this._models = new ModelsResource(args.baseUrl, args.token, args.timeoutS);
    this._results = new ResultsResource(args.baseUrl, args.token, args.timeoutS);
  }

  async listModels(): Promise<Record<string, unknown>> {
    return await this._models.list();
  }

  async results(bucketUid: string): Promise<Record<string, Buffer>> {
    return await this._results.results(bucketUid);
  }
}
