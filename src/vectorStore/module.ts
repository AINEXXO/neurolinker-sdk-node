import { CollectionsResource } from "./collections.js";
import { JobsResource } from "./jobs.js";

export class VectorStoreModule {
  public readonly collections: CollectionsResource;
  public readonly jobs: JobsResource;

  constructor(args: {
    baseUrl: string;
    token: string;
    timeoutS: number;
    pollIntervalS: number;
    pollMaxIntervalS: number;
  }) {
    this.collections = new CollectionsResource(args.baseUrl, args.token, args.timeoutS);
    this.jobs = new JobsResource(
      args.baseUrl,
      args.token,
      args.timeoutS,
      args.pollIntervalS,
      args.pollMaxIntervalS,
    );
  }
}
