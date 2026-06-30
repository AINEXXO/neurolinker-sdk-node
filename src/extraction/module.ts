import { waitForTerminalStatus } from "../polling.js";
import { DocumentsResource } from "./documents.js";
import { DocumentUpload, EnrichmentMode, ExtractResource } from "./extract.js";
import { extractStatus, extractionTimeoutSuffix } from "./helpers.js";
import { StatusResource } from "./status.js";
import { TasksResource } from "./tasks.js";
import { ZipResource } from "./zip.js";

export class ExtractionModule {
  public readonly status: StatusResource;
  public readonly documents: DocumentsResource;

  private readonly _extract: ExtractResource;
  private readonly _tasks: TasksResource;
  private readonly _zip: ZipResource;

  private readonly timeoutS: number;
  private readonly pollIntervalS: number;
  private readonly pollMaxIntervalS: number;

  constructor(args: {
    baseUrl: string;
    token: string;
    timeoutS: number;
    pollIntervalS: number;
    pollMaxIntervalS: number;
  }) {
    this.timeoutS = args.timeoutS;
    this.pollIntervalS = args.pollIntervalS;
    this.pollMaxIntervalS = args.pollMaxIntervalS;

    this._extract = new ExtractResource(args.baseUrl, args.token, args.timeoutS);
    this._tasks = new TasksResource(args.baseUrl, args.token, args.timeoutS);
    this._zip = new ZipResource(args.baseUrl, args.token, args.timeoutS);
    this.status = new StatusResource(args.baseUrl, args.token, args.timeoutS);
    this.documents = new DocumentsResource(args.baseUrl, args.token, args.timeoutS);
  }

  async extract(args: {
    documents?: DocumentUpload[];
    urls?: string[];
    alias?: string;
    description?: string;
    enrichmentMode?: EnrichmentMode;
  }): Promise<Record<string, unknown>> {
    return await this._extract.extract(args);
  }

  async extractFields(args: {
    jsonSchema: Record<string, unknown>;
    documents?: DocumentUpload[];
    urls?: string[];
    alias?: string;
    description?: string;
  }): Promise<Record<string, unknown>> {
    return await this._extract.extractFields(args);
  }

  async extractFieldsFromMarkdown(args: {
    jsonSchema: Record<string, unknown>;
    documentIds: string[];
    alias?: string;
    description?: string;
  }): Promise<Record<string, unknown>> {
    return await this._extract.extractFieldsFromMarkdown(args);
  }

  async generateSchema(args: { description: string }): Promise<Record<string, unknown>> {
    return await this._extract.generateSchema(args);
  }

  async listTasks(): Promise<Record<string, unknown>> {
    return await this._tasks.list();
  }

  async makeZip(args: {
    jobUid: string;
    documentUid?: string;
    localImages?: boolean;
    contentTypes?: string[];
  }): Promise<Record<string, unknown>> {
    return await this._zip.makeZip(args);
  }

  async waitForRequest(
    requestUid: string,
    opts?: {
      timeoutS?: number;
      pollIntervalS?: number;
      pollMaxIntervalS?: number;
    },
  ): Promise<Record<string, unknown>> {
    return await waitForTerminalStatus<Record<string, unknown>>({
      fetchStatus: () => this.status.request(requestUid),
      extractStatus,
      timeoutS: opts?.timeoutS ?? this.timeoutS,
      pollIntervalS: opts?.pollIntervalS ?? this.pollIntervalS,
      pollMaxIntervalS: opts?.pollMaxIntervalS ?? this.pollMaxIntervalS,
      identifier: `request ${requestUid}`,
      timeoutContext: extractionTimeoutSuffix,
    });
  }
}
