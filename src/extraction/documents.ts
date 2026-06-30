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

function normalizeContentTypes(
  contentTypes?: Array<ContentType | string>,
): string[] | undefined {
  if (!contentTypes || contentTypes.length === 0) return undefined;
  return contentTypes.map((ct) => (typeof ct === "string" ? ct : (ct as ContentType).valueOf()));
}

export class DocumentsResource {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutS: number,
  ) {}

  private async post(
    path: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const url = buildUrl(this.baseUrl, path);
    return await fetchJson({
      url,
      method: "POST",
      token: this.token,
      timeoutS: this.timeoutS,
      body: payload,
    });
  }

  async markdown(
    documentIds: string[],
    args?: { contentTypes?: Array<ContentType | string> },
  ): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = { document_ids: documentIds };
    const normalized = normalizeContentTypes(args?.contentTypes);
    if (normalized) payload.content_types = normalized;
    return await this.post("/v1/documents/markdown", payload);
  }

  async json(
    documentIds: string[],
    args?: { contentTypes?: Array<ContentType | string> },
  ): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = { document_ids: documentIds };
    const normalized = normalizeContentTypes(args?.contentTypes);
    if (normalized) payload.content_types = normalized;
    return await this.post("/v1/documents/json", payload);
  }

  async images(documentIds: string[]): Promise<Record<string, unknown>> {
    return await this.post("/v1/documents/images", { document_ids: documentIds });
  }

  async pageSummaries(documentIds: string[]): Promise<Record<string, unknown>> {
    return await this.post("/v1/documents/page-summaries", { document_ids: documentIds });
  }

  async sectionSummaries(documentIds: string[]): Promise<Record<string, unknown>> {
    return await this.post("/v1/documents/section-summaries", { document_ids: documentIds });
  }

  async documentSummary(
    documentIds: string[],
    args: { summaryType: SummaryType | string },
  ): Promise<Record<string, unknown>> {
    const st =
      typeof args.summaryType === "string"
        ? args.summaryType
        : (args.summaryType as SummaryType).valueOf();
    return await this.post("/v1/documents/document-summary", {
      document_ids: documentIds,
      summary_type: st,
    });
  }

  async fields(documentIds: string[]): Promise<Record<string, unknown>> {
    return await this.post("/v1/documents/fields", { document_ids: documentIds });
  }

  /**
   * POST /v1/documents/scalars
   *
   * Retrieves the extracted scalar fields for documents processed through
   * markdown field extraction. Pass the new `document_uid` values from the
   * submit response's `document_map`. Returns `content: null` for documents
   * whose extraction did not complete.
   */
  async scalars(documentIds: string[]): Promise<Record<string, unknown>> {
    return await this.post("/v1/documents/scalars", { document_ids: documentIds });
  }
}
