import { NeuroLinkerConfigError } from "../errors.js";
import { buildUrl, fetchJson } from "../http.js";

export class AnalyzeResource {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutS: number,
  ) {}

  async analyze(bucketUid: string): Promise<Record<string, unknown>> {
    if (!bucketUid) {
      throw new NeuroLinkerConfigError("bucketUid must be a non-empty string.");
    }
    return await fetchJson({
      url: buildUrl(this.baseUrl, "/v1/chunk/analyze"),
      method: "POST",
      token: this.token,
      timeoutS: this.timeoutS,
      body: { bucket_uid: bucketUid },
    });
  }
}
