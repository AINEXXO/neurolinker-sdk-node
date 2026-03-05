/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  DEFAULT_POLL_INTERVAL_S,
  DEFAULT_POLL_MAX_INTERVAL_S,
  DEFAULT_TIMEOUT_S,
  configFromEnv,
} from "./config.js";
import { NeuroLinkerAPIError } from "./errors.js";
import { DocumentsResource } from "./resources/documents.js";
import { ExtractResource } from "./resources/extract.js";
import { StatusResource } from "./resources/status.js";
import { TasksResource } from "./resources/tasks.js";
import { ZipResource } from "./resources/zip.js";

export function extractRequestUid(extractResponse: Record<string, any>): string {
  if (typeof extractResponse.request_uid === "string") return extractResponse.request_uid;

  const data = extractResponse.data;
  if (data && typeof data === "object" && typeof data.request_uid === "string") return data.request_uid;

  throw new Error(`Could not find request_uid in extract response: ${JSON.stringify(extractResponse)}`);
}

export function extractDocumentIds(statusResponse: Record<string, any>): string[] {
  let documents: any = statusResponse.documents;
  if (!documents && statusResponse.data && typeof statusResponse.data === "object") {
    documents = statusResponse.data.documents;
  }
  if (!Array.isArray(documents)) return [];

  const out: string[] = [];
  for (const item of documents) {
    if (!item || typeof item !== "object") continue;
    if (typeof item.document_id === "string") out.push(item.document_id);
    else if (typeof item.id === "string") out.push(item.id);
  }
  return out;
}

export class NeuroLinker {
  public readonly tasks: TasksResource;
  public readonly status: StatusResource;
  public readonly documents: DocumentsResource;
  public readonly extract: ExtractResource;
  public readonly zip: ZipResource;

  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutS: number;
  private readonly pollIntervalS: number;
  private readonly pollMaxIntervalS: number;

  constructor(args: {
    token: string;
    baseUrl?: string;
    timeoutS?: number;
    pollIntervalS?: number;
    pollMaxIntervalS?: number;
  }) {
    this.baseUrl = (args.baseUrl || "https://neurolinker.api.ainexxo.com").replace(/\/+$/, "");
    this.token = args.token;

    this.timeoutS = args.timeoutS ?? DEFAULT_TIMEOUT_S;
    this.pollIntervalS = args.pollIntervalS ?? DEFAULT_POLL_INTERVAL_S;
    this.pollMaxIntervalS = args.pollMaxIntervalS ?? DEFAULT_POLL_MAX_INTERVAL_S;

    this.tasks = new TasksResource(this.baseUrl, this.token, this.timeoutS);
    this.status = new StatusResource(this.baseUrl, this.token, this.timeoutS);
    this.documents = new DocumentsResource(this.baseUrl, this.token, this.timeoutS);
    this.extract = new ExtractResource(this.baseUrl, this.token, this.timeoutS);
    this.zip = new ZipResource(this.baseUrl, this.token, this.timeoutS);
  }

  static fromEnv(overrides?: { timeoutS?: number; pollIntervalS?: number; pollMaxIntervalS?: number }): NeuroLinker {
    const cfg = configFromEnv();
    return new NeuroLinker({
      token: cfg.token,
      baseUrl: cfg.baseUrl,
      timeoutS: overrides?.timeoutS ?? cfg.timeoutS,
      pollIntervalS: overrides?.pollIntervalS ?? cfg.pollIntervalS,
      pollMaxIntervalS: overrides?.pollMaxIntervalS ?? cfg.pollMaxIntervalS,
    });
  }

  static extractRequestUid = extractRequestUid;
  static extractDocumentIds = extractDocumentIds;

  async waitForRequestCompletion(args: {
    requestUid: string;
    timeoutS?: number;
    pollIntervalS?: number;
    pollMaxIntervalS?: number;
  }): Promise<Record<string, any>> {
    const waitTimeoutS = args.timeoutS ?? this.timeoutS;
    let interval = args.pollIntervalS ?? this.pollIntervalS;
    const maxInterval = args.pollMaxIntervalS ?? this.pollMaxIntervalS;

    const deadline = Date.now() + waitTimeoutS * 1000;
    let last: Record<string, any> | undefined;

    while (Date.now() < deadline) {
      try {
        last = await this.status.request(args.requestUid);
      } catch (e: any) {
        // Some deployments may return 404 briefly right after submit (eventual consistency),
        // same behavior handled in Python polling helper/tests.
        if (e instanceof NeuroLinkerAPIError && e.statusCode === 404) {
          await new Promise((r) => setTimeout(r, interval * 1000));
          interval = Math.min(maxInterval, interval * 1.5);
          continue;
        }
        throw e;
      }

      let status = last.status;
      if (!status && last.data && typeof last.data === "object") status = last.data.status;

      if (status === "completed" || status === "failed" || status === "pending") return last;

      await new Promise((r) => setTimeout(r, interval * 1000));
      interval = Math.min(maxInterval, interval * 1.2);
    }

    const jobUrl =
      last?.job_page_url || (last?.data && typeof last.data === "object" ? last.data.job_page_url : undefined);

    throw new Error(
      `Timeout waiting for request ${args.requestUid} after ${waitTimeoutS}s. Last status: ${JSON.stringify(
        last
      )}. Job URL: ${jobUrl}`
    );
  }
}