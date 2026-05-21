import { NeuroLinkerConfigError } from "../errors.js";
import {
  buildUrl,
  extractSignedFiles,
  fetchJson,
  fetchSignedFiles,
} from "../http.js";

export class ResultsResource {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutS: number,
  ) {}

  async results(bucketUid: string): Promise<Record<string, Buffer>> {
    if (!bucketUid) {
      throw new NeuroLinkerConfigError("bucketUid must be a non-empty string.");
    }

    const body = await fetchJson<Record<string, unknown>>({
      url: buildUrl(this.baseUrl, "/v1/embed/results"),
      method: "POST",
      token: this.token,
      timeoutS: this.timeoutS,
      body: { bucket_uid: bucketUid },
    });

    const files = extractSignedFiles(body);
    return await fetchSignedFiles({ files, timeoutS: this.timeoutS });
  }
}
