import { NeuroLinkerConfigError } from "../errors.js";
import { buildUrl, fetchMultipart } from "../http.js";

export type DocumentUpload = { filename: string; content: Buffer };

export class ExtractResource {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutS: number
  ) {}

  async extract(args: {
    documents?: DocumentUpload[];
    urls?: string[];
    alias?: string;
    description?: string;
  }): Promise<Record<string, unknown>> {
    const hasDocs = !!args.documents && args.documents.length > 0;
    const hasUrls = !!args.urls && args.urls.length > 0;

    if (hasDocs && hasUrls) {
      throw new NeuroLinkerConfigError("Invalid extract call: provide either 'documents' or 'urls', not both.");
    }
    if (!hasDocs && !hasUrls) {
      throw new NeuroLinkerConfigError("Invalid extract call: you must provide either 'documents' or 'urls'.");
    }

    const url = buildUrl(this.baseUrl, "/v1/extract");

    // Build multipart form-data matching backend expectations:
    // - field "form" contains JSON string
    // - field "documents" contains file(s) if uploading
    const fd = new FormData();

    if (hasDocs) {
      // Documents mode: backend expects form="{}"
      fd.set("form", "{}");

        for (const doc of args.documents!) {
        // Convert Node Buffer to a DOM-friendly BlobPart (Uint8Array).
        const blobPart = new Uint8Array(doc.content);
        const blob = new Blob([blobPart], { type: "application/pdf" });

        // Multiple files must reuse the same field name: "documents"
        fd.append("documents", blob, doc.filename || "document.pdf");
        }

      return await fetchMultipart({ url, token: this.token, timeoutS: this.timeoutS, formData: fd });
    }

    // URLs mode: backend expects documents=[], and form JSON with documents_url + optional fields
    const payload: Record<string, unknown> = {
      documents_url: args.urls,
    };
    if (args.alias) payload.alias = args.alias;
    if (args.description) payload.description = args.description;

    fd.set("form", JSON.stringify(payload));

    // Ensure documents is an empty list: we simply do not attach any file.
    return await fetchMultipart({ url, token: this.token, timeoutS: this.timeoutS, formData: fd });
  }
}