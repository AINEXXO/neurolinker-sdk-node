import { NeuroLinkerConfigError } from "../../errors.js";
import { buildUrl, fetchJson, fetchSignedFile } from "../../http.js";

const RESULT_FILE = "result.json";

/**
 * Pull the signed `result.json` URL out of a /results response, or throw a clear
 * error when the result isn't available yet (job still running).
 */
function extractResultUrl(body: Record<string, unknown>): string {
  const result = (body.result as Record<string, unknown>) ?? {};
  const files = (result.files as Record<string, unknown>) ?? {};
  const url = files[RESULT_FILE];
  if (typeof url !== "string" || !url) {
    const detail =
      (result.error as string) || (body.message as string) || "result not yet available";
    throw new NeuroLinkerConfigError(
      `Results not available for this evaluation (${detail}). ` +
        "Wait for the job to reach 'completed' (jobs.wait) before fetching results.",
    );
  }
  return url;
}

export class ResultsResource {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutS: number,
  ) {}

  /**
   * POST /v1/eval/oneshot/results then download the signed `result.json`.
   * Returns the parsed JSON: `{ eval_uid, rows: [...], summary: {...} }`. The file
   * bytes transit directly between the client and storage, not through the API.
   */
  async results(evalUid: string): Promise<Record<string, unknown>> {
    if (!evalUid) {
      throw new NeuroLinkerConfigError("evalUid must be a non-empty string.");
    }
    const body = await fetchJson<Record<string, unknown>>({
      url: buildUrl(this.baseUrl, "/v1/eval/oneshot/results"),
      method: "POST",
      token: this.token,
      timeoutS: this.timeoutS,
      body: { eval_uid: evalUid },
    });
    const url = extractResultUrl(body);
    const buf = await fetchSignedFile({ url, filename: RESULT_FILE, timeoutS: this.timeoutS });
    return JSON.parse(buf.toString("utf-8")) as Record<string, unknown>;
  }
}
