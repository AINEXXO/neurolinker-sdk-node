import { BucketsResource } from "./buckets.js";

export class ManagementModule {
  public readonly buckets: BucketsResource;

  constructor(args: { baseUrl: string; token: string; timeoutS: number }) {
    this.buckets = new BucketsResource(args.baseUrl, args.token, args.timeoutS);
  }
}
