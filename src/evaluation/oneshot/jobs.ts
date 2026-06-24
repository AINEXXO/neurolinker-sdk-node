import { NeuroLinkerConfigError } from "../../errors.js";
import { buildUrl, fetchJson, fetchMultipart } from "../../http.js";
import { waitForTerminalStatus } from "../../polling.js";

const TERMINAL_STATES = new Set(["completed", "failed"]);

/** A one-shot evaluation dataset: a JSONL file passed in memory as bytes. */
export type Dataset = { filename: string; content: Buffer };

function buildDatasetForm(dataset: Dataset): FormData {
  if (!dataset || typeof dataset.filename !== "string" || !(dataset.content instanceof Uint8Array)) {
    throw new NeuroLinkerConfigError("dataset must be a { filename, content: Buffer }.");
  }
  if (!dataset.filename.toLowerCase().endsWith(".jsonl")) {
    throw new NeuroLinkerConfigError("dataset filename must end with '.jsonl'.");
  }
  if (dataset.content.length === 0) {
    throw new NeuroLinkerConfigError("dataset content must be non-empty bytes.");
  }
  // The backend reads a single `file` form field and accepts only `.jsonl`.
  const fd = new FormData();
  const blob = new Blob([new Uint8Array(dataset.content)], { type: "application/x-ndjson" });
  fd.append("file", blob, dataset.filename);
  return fd;
}

export class JobsResource {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutS: number,
    private readonly pollIntervalS: number,
    private readonly pollMaxIntervalS: number,
  ) {}

  /**
   * POST /v1/eval/oneshot/jobs — upload the JSONL dataset and enqueue the job in
   * one shot. Returns the body carrying `eval_uid` + `status`.
   */
  async create(args: { dataset: Dataset }): Promise<Record<string, unknown>> {
    const formData = buildDatasetForm(args.dataset);
    return await fetchMultipart<Record<string, unknown>>({
      url: buildUrl(this.baseUrl, "/v1/eval/oneshot/jobs"),
      token: this.token,
      timeoutS: this.timeoutS,
      formData,
    });
  }

  /**
   * GET /v1/eval/oneshot/jobs/{evalUid} — current status + (on completion) the
   * metric summary and result path.
   */
  async get(evalUid: string): Promise<Record<string, unknown>> {
    if (!evalUid) {
      throw new NeuroLinkerConfigError("evalUid must be a non-empty string.");
    }
    return await fetchJson<Record<string, unknown>>({
      url: buildUrl(this.baseUrl, `/v1/eval/oneshot/jobs/${evalUid}`),
      method: "GET",
      token: this.token,
      timeoutS: this.timeoutS,
    });
  }

  /** Poll `get` until the job reaches a terminal state (completed/failed). */
  async wait(
    evalUid: string,
    opts?: { timeoutS?: number; pollIntervalS?: number; pollMaxIntervalS?: number },
  ): Promise<Record<string, unknown>> {
    return await waitForTerminalStatus<Record<string, unknown>>({
      fetchStatus: () => this.get(evalUid),
      extractStatus: (r) => {
        const s = (r as Record<string, unknown>).status;
        return typeof s === "string" ? s : undefined;
      },
      timeoutS: opts?.timeoutS ?? this.timeoutS,
      pollIntervalS: opts?.pollIntervalS ?? this.pollIntervalS,
      pollMaxIntervalS: opts?.pollMaxIntervalS ?? this.pollMaxIntervalS,
      terminalStates: TERMINAL_STATES,
      identifier: `evaluation job ${evalUid}`,
    });
  }
}
