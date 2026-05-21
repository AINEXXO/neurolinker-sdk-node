import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import {
  NeuroLinker,
  NeuroLinkerAPIError,
  NeuroLinkerConfigError,
} from "../../src/index.js";

const BASE_URL = "https://mock.neurolinker.test";
const TOKEN = "nl_mock";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeClient(): NeuroLinker {
  return new NeuroLinker({ token: TOKEN, baseUrl: BASE_URL, timeoutS: 5 });
}

describe("extraction.extract — mocks", () => {
  it("URLs mode: includes alias, description and enrichment_mode in multipart form", async () => {
    let captured: { url?: string; body?: string } = {};
    server.use(
      http.post(`${BASE_URL}/v1/extract`, async ({ request }) => {
        captured.url = request.url;
        captured.body = await request.text();
        return HttpResponse.json({ request_uid: "req-1", status: "submitted" });
      }),
    );

    const client = makeClient();
    const resp = await client.extraction.extract({
      urls: ["https://example.com/report.pdf"],
      alias: "test-alias",
      description: "test desc",
      enrichmentMode: "turbo",
    });

    const body = decodeURIComponent(captured.body!);
    expect(captured.url).toBe(`${BASE_URL}/v1/extract`);
    expect(body).toContain("documents_url");
    expect(body).toContain("https://example.com/report.pdf");
    expect(body).toContain("test-alias");
    expect(body).toContain("test desc");
    expect(body).toContain("enrichment_mode");
    expect(body).toContain("turbo");
    expect((resp as any).request_uid).toBe("req-1");
  });

  it("documents mode: keeps multipart upload and can send enrichment_mode without documents_url", async () => {
    let body = "";
    server.use(
      http.post(`${BASE_URL}/v1/extract`, async ({ request }) => {
        body = await request.text();
        return HttpResponse.json({ request_uid: "req-2", status: "submitted" });
      }),
    );

    const client = makeClient();
    const resp = await client.extraction.extract({
      documents: [{ filename: "report.pdf", content: Buffer.from("%PDF-fake-bytes%") }],
      alias: "batch-2026",
      enrichmentMode: "base",
    });

    expect(body).toContain("report.pdf");
    expect(body).toContain("batch-2026");
    expect(body).toContain("enrichment_mode");
    expect(body).toContain("base");
    expect(body).not.toContain("documents_url");
    expect((resp as any).request_uid).toBe("req-2");
  });

  it("rejects invalid enrichmentMode", async () => {
    const client = makeClient();
    await expect(
      client.extraction.extract({
        urls: ["https://example.com/report.pdf"],
        enrichmentMode: "fast" as never,
      }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
  });

  it("propagates non-2xx as NeuroLinkerAPIError", async () => {
    server.use(
      http.post(`${BASE_URL}/v1/extract`, () =>
        HttpResponse.json({ detail: "bad" }, { status: 400 }),
      ),
    );

    const client = makeClient();
    await expect(
      client.extraction.extract({ urls: ["https://example.com/report.pdf"] }),
    ).rejects.toBeInstanceOf(NeuroLinkerAPIError);
  });
});
