import { buildUrl, fetchJson } from "../http.js";

export class ZipResource {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutS: number
  ) {}

  async makeZip(args: {
    jobUid: string;
    documentUid?: string;
    localImages?: boolean;
    contentTypes?: string[];
  }): Promise<Record<string, unknown>> {
    const url = buildUrl(this.baseUrl, "/v1/mcp/make-zip");

    const body: Record<string, unknown> = {
      request_id: args.jobUid,
      local_images: args.localImages ?? false,
    };
    if (args.documentUid) body.document_id = args.documentUid;
    if (args.contentTypes) body.content_types = args.contentTypes;

    return await fetchJson({ url, method: "POST", token: this.token, timeoutS: this.timeoutS, body });
  }
}