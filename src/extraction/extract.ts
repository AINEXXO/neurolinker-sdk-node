import { NeuroLinkerConfigError } from "../errors.js";
import { buildUrl, fetchJson, fetchMultipart } from "../http.js";

export type DocumentUpload = { filename: string; content: Buffer };
export type EnrichmentMode = "base" | "turbo";

const VALID_ENRICHMENT_MODES = new Set<EnrichmentMode>(["base", "turbo"]);

interface FormPayloadFields {
  urls?: string[];
  alias?: string;
  description?: string;
  jsonSchema?: Record<string, unknown>;
  enrichmentMode?: EnrichmentMode;
}

function validateSubmitModes(args: {
  hasDocs: boolean;
  hasUrls: boolean;
  methodLabel: string;
}): void {
  if (args.hasDocs && args.hasUrls) {
    throw new NeuroLinkerConfigError(
      `Invalid ${args.methodLabel} call: provide either 'documents' or 'urls', not both.`,
    );
  }
  if (!args.hasDocs && !args.hasUrls) {
    throw new NeuroLinkerConfigError(
      `Invalid ${args.methodLabel} call: you must provide either 'documents' or 'urls'.`,
    );
  }
}

function validateJsonSchema(jsonSchema: unknown): asserts jsonSchema is Record<string, unknown> {
  if (
    !jsonSchema ||
    typeof jsonSchema !== "object" ||
    Array.isArray(jsonSchema)
  ) {
    throw new NeuroLinkerConfigError(
      `json_schema must be a plain object conforming to JSON Schema Draft 7 (supported subset). Got: ${
        Array.isArray(jsonSchema) ? "array" : typeof jsonSchema
      }`,
    );
  }
  if (Object.keys(jsonSchema).length === 0) {
    throw new NeuroLinkerConfigError("json_schema cannot be empty.");
  }
}

function validateEnrichmentMode(
  enrichmentMode: string | undefined,
): asserts enrichmentMode is EnrichmentMode | undefined {
  if (enrichmentMode === undefined) return;
  if (!VALID_ENRICHMENT_MODES.has(enrichmentMode as EnrichmentMode)) {
    throw new NeuroLinkerConfigError(
      `enrichmentMode must be one of ${JSON.stringify(Array.from(VALID_ENRICHMENT_MODES))}, got ${JSON.stringify(enrichmentMode)}.`,
    );
  }
}

function encodeFormPayload(fields: FormPayloadFields): string {
  const payload: Record<string, unknown> = {};
  if (fields.urls && fields.urls.length > 0) payload.documents_url = fields.urls;
  if (fields.alias) payload.alias = fields.alias;
  if (fields.description) payload.description = fields.description;
  if (fields.jsonSchema !== undefined) payload.json_schema = fields.jsonSchema;
  if (fields.enrichmentMode !== undefined) payload.enrichment_mode = fields.enrichmentMode;
  return JSON.stringify(payload);
}

function appendDocuments(fd: FormData, documents: DocumentUpload[]): void {
  documents.forEach((doc, idx) => {
    const safeName = doc.filename || `document_${idx}.pdf`;
    const blobPart = new Uint8Array(doc.content);
    const blob = new Blob([blobPart], { type: "application/pdf" });
    fd.append("documents", blob, safeName);
  });
}

export class ExtractResource {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutS: number,
  ) {}

  async extract(args: {
    documents?: DocumentUpload[];
    urls?: string[];
    alias?: string;
    description?: string;
    enrichmentMode?: EnrichmentMode;
  }): Promise<Record<string, unknown>> {
    const hasDocs = !!args.documents && args.documents.length > 0;
    const hasUrls = !!args.urls && args.urls.length > 0;
    validateSubmitModes({ hasDocs, hasUrls, methodLabel: "extract" });
    validateEnrichmentMode(args.enrichmentMode);

    const url = buildUrl(this.baseUrl, "/v1/extract");
    const fd = new FormData();
    fd.set(
      "form",
      encodeFormPayload({
        urls: hasUrls ? args.urls : undefined,
        alias: args.alias,
        description: args.description,
        enrichmentMode: args.enrichmentMode,
      }),
    );
    if (hasDocs) appendDocuments(fd, args.documents!);

    return await fetchMultipart({
      url,
      token: this.token,
      timeoutS: this.timeoutS,
      formData: fd,
    });
  }

  async extractFields(args: {
    jsonSchema: Record<string, unknown>;
    documents?: DocumentUpload[];
    urls?: string[];
    alias?: string;
    description?: string;
  }): Promise<Record<string, unknown>> {
    const hasDocs = !!args.documents && args.documents.length > 0;
    const hasUrls = !!args.urls && args.urls.length > 0;
    validateSubmitModes({ hasDocs, hasUrls, methodLabel: "extractFields" });
    validateJsonSchema(args.jsonSchema);

    const url = buildUrl(this.baseUrl, "/v1/extract-fields");
    const fd = new FormData();

    fd.set(
      "form",
      encodeFormPayload({
        urls: hasUrls ? args.urls : undefined,
        alias: args.alias,
        description: args.description,
        jsonSchema: args.jsonSchema,
      }),
    );

    if (hasDocs) appendDocuments(fd, args.documents!);

    return await fetchMultipart({
      url,
      token: this.token,
      timeoutS: this.timeoutS,
      formData: fd,
    });
  }

  async generateSchema(args: { description: string }): Promise<Record<string, unknown>> {
    if (!args.description || !args.description.trim()) {
      throw new NeuroLinkerConfigError("description must be a non-empty string.");
    }

    const url = buildUrl(this.baseUrl, "/v1/generate-schema");
    return await fetchJson({
      url,
      method: "POST",
      token: this.token,
      timeoutS: this.timeoutS,
      body: { description: args.description },
    });
  }
}
