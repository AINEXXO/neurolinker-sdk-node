import { BucketsResource } from "./buckets.js";
import { SecretsResource } from "./secrets.js";

export class ManagementModule {
  public readonly buckets: BucketsResource;
  public readonly secrets: SecretsResource;

  constructor(args: { baseUrl: string; token: string; timeoutS: number }) {
    this.buckets = new BucketsResource(args.baseUrl, args.token, args.timeoutS);
    this.secrets = new SecretsResource(args.baseUrl, args.token, args.timeoutS);
  }
}
