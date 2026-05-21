import { buildUrl, fetchJson } from "../http.js";

export class ModelsResource {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutS: number,
  ) {}

  async list(): Promise<Record<string, unknown>> {
    return await fetchJson({
      url: buildUrl(this.baseUrl, "/v1/embed/models"),
      method: "GET",
      token: this.token,
      timeoutS: this.timeoutS,
    });
  }
}
