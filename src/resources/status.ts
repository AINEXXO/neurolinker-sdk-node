import { buildUrl, fetchJson } from "../http.js";

export class StatusResource {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutS: number
  ) {}

  async request(requestId: string): Promise<Record<string, unknown>> {
    const url = buildUrl(this.baseUrl, `/v1/request-status/${requestId}`);
    return await fetchJson({ url, method: "GET", token: this.token, timeoutS: this.timeoutS });
  }

  async document(documentId: string): Promise<Record<string, unknown>> {
    const url = buildUrl(this.baseUrl, `/v1/document-status/${documentId}`);
    return await fetchJson({ url, method: "GET", token: this.token, timeoutS: this.timeoutS });
  }
}