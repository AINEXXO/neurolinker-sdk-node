import { buildUrl, fetchJson } from "../http.js";

export class TasksResource {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutS: number
  ) {}

  async list(): Promise<Record<string, unknown>> {
    const url = buildUrl(this.baseUrl, "/v1/tasks");
    return await fetchJson({ url, method: "GET", token: this.token, timeoutS: this.timeoutS });
  }
}