import { buildUrl, fetchJson } from "../http.js";

export enum ContentType {
  TEXT = "text",
  FORMULA = "formula",
  TABLES = "tables",
  IMAGES = "images",
}

export enum SummaryType {
  PAGE = "page",
  SECTION = "section",
}

function normalizeContentTypes(contentTypes?: Array<ContentType | string>): string[] | undefined {
  if (!contentTypes || contentTypes.length === 0) return undefined;
  return contentTypes.map((ct) => (typeof ct === "string" ? ct : ct as ContentType).valueOf());
}

export class DocumentsResource {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutS: number
  ) {}

  private async post(path: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const url = buildUrl(this.baseUrl, path);
    return await fetchJson({ url, method: "POST", token: this.token, timeoutS: this.timeoutS, body: payload });
  }

  async markdown(documentIds: string[], args?: { contentTypes?: Array<ContentType | string> }) {
    const payload: Record<string, unknown> = { document_ids: documentIds };
    const normalized = normalizeContentTypes(args?.contentTypes);
    if (normalized) payload.content_types = normalized;
    return await this.post("/v1/documents/markdown", payload);
  }

  async json(documentIds: string[], args?: { contentTypes?: Array<ContentType | string> }) {
    const payload: Record<string, unknown> = { document_ids: documentIds };
    const normalized = normalizeContentTypes(args?.contentTypes);
    if (normalized) payload.content_types = normalized;
    return await this.post("/v1/documents/json", payload);
  }

  async images(documentIds: string[]) {
    return await this.post("/v1/documents/images", { document_ids: documentIds });
  }

  async pageSummaries(documentIds: string[]) {
    return await this.post("/v1/documents/page-summaries", { document_ids: documentIds });
  }

  async sectionSummaries(documentIds: string[]) {
    return await this.post("/v1/documents/section-summaries", { document_ids: documentIds });
  }

  async documentSummary(documentIds: string[], args: { summaryType: SummaryType | string }) {
    const st = typeof args.summaryType === "string" ? args.summaryType : (args.summaryType as SummaryType).valueOf();
    return await this.post("/v1/documents/document-summary", {
      document_ids: documentIds,
      summary_type: st,
    });
  }
}