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

// Schema aligned with the test PDF (PMSS template). Used as a realistic
// fixture across the URL- and documents-mode tests.
const SAMPLE_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "Main title of the document",
    },
    course_name: {
      type: "string",
      description: "Course this document belongs to",
    },
    section_titles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Section heading" },
        },
      },
    },
  },
  required: ["title"],
};

// ---------------------------------------------------------------------------
// generateSchema
// ---------------------------------------------------------------------------

describe("extraction.generateSchema — mocks", () => {
  it("POSTs {description} JSON to /v1/generate-schema", async () => {
    let captured: { method?: string; url?: string; body?: unknown } = {};
    server.use(
      http.post(`${BASE_URL}/v1/generate-schema`, async ({ request }) => {
        captured.method = request.method;
        captured.url = request.url;
        captured.body = await request.json();
        return HttpResponse.json({ success: true, json_schema: SAMPLE_SCHEMA });
      }),
    );

    const client = makeClient();
    const out = await client.extraction.generateSchema({
      description: "Extract document title and section names from a one-page report",
    });

    expect(captured.method).toBe("POST");
    expect(captured.url).toBe(`${BASE_URL}/v1/generate-schema`);
    expect(captured.body).toEqual({
      description: "Extract document title and section names from a one-page report",
    });
    expect((out as any).json_schema).toEqual(SAMPLE_SCHEMA);
  });

  it("rejects empty / whitespace-only description", async () => {
    const client = makeClient();
    await expect(
      client.extraction.generateSchema({ description: "" }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
    await expect(
      client.extraction.generateSchema({ description: "   " }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
  });

  it("propagates non-2xx as NeuroLinkerAPIError", async () => {
    server.use(
      http.post(`${BASE_URL}/v1/generate-schema`, () =>
        HttpResponse.json(
          { detail: "schema generation failed: empty model output" },
          { status: 400 },
        ),
      ),
    );

    const client = makeClient();
    await expect(
      client.extraction.generateSchema({ description: "anything" }),
    ).rejects.toBeInstanceOf(NeuroLinkerAPIError);
  });
});

// ---------------------------------------------------------------------------
// extractFields
// ---------------------------------------------------------------------------

describe("extraction.extractFields — mocks", () => {
  it("URLs mode: includes json_schema + documents_url in multipart form", async () => {
    let captured: { method?: string; url?: string; body?: string } = {};
    server.use(
      http.post(`${BASE_URL}/v1/extract-fields`, async ({ request }) => {
        captured.method = request.method;
        captured.url = request.url;
        captured.body = await request.text();
        return HttpResponse.json({ request_uid: "req-fields-1", status: "submitted" });
      }),
    );

    const client = makeClient();
    const resp = await client.extraction.extractFields({
      jsonSchema: SAMPLE_SCHEMA,
      urls: ["https://example.com/report.pdf"],
      alias: "test-alias",
      description: "test desc",
    });

    expect(captured.method).toBe("POST");
    expect(captured.url).toBe(`${BASE_URL}/v1/extract-fields`);
    // Body is multipart: scan for needles. The decoded multipart contains a
    // 'form' part with a JSON blob carrying json_schema + documents_url.
    const body = decodeURIComponent(captured.body!);
    expect(body).toContain("json_schema");
    expect(body).toContain("documents_url");
    expect(body).toContain("https://example.com/report.pdf");
    expect(body).toContain("test-alias");
    expect((resp as any).request_uid).toBe("req-fields-1");
  });

  it("documents mode: schema present, no documents_url, file part attached", async () => {
    let captured: { url?: string; body?: string } = {};
    server.use(
      http.post(`${BASE_URL}/v1/extract-fields`, async ({ request }) => {
        captured.url = request.url;
        captured.body = await request.text();
        return HttpResponse.json({ request_uid: "req-docs", status: "submitted" });
      }),
    );

    const client = makeClient();
    const resp = await client.extraction.extractFields({
      jsonSchema: SAMPLE_SCHEMA,
      documents: [{ filename: "report.pdf", content: Buffer.from("%PDF-fake-bytes%") }],
      alias: "batch-2026",
    });

    expect(captured.url).toBe(`${BASE_URL}/v1/extract-fields`);
    const body = captured.body!;
    expect(body).toContain("json_schema");
    expect(body).toContain("batch-2026");
    expect(body).toContain("report.pdf");
    // documents_url must NOT appear in documents mode.
    expect(body).not.toContain("documents_url");
    expect((resp as any).request_uid).toBe("req-docs");
  });

  it("rejects providing both documents and urls", async () => {
    const client = makeClient();
    await expect(
      client.extraction.extractFields({
        jsonSchema: SAMPLE_SCHEMA,
        documents: [{ filename: "a.pdf", content: Buffer.from("x") }],
        urls: ["https://example.com/a.pdf"],
      }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
  });

  it("rejects missing both documents and urls", async () => {
    const client = makeClient();
    await expect(
      client.extraction.extractFields({ jsonSchema: SAMPLE_SCHEMA }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
  });

  it("rejects non-object jsonSchema", async () => {
    const client = makeClient();
    await expect(
      client.extraction.extractFields({
        jsonSchema: "not a dict" as never,
        urls: ["https://example.com/a.pdf"],
      }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
    await expect(
      client.extraction.extractFields({
        jsonSchema: [1, 2, 3] as never,
        urls: ["https://example.com/a.pdf"],
      }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
  });

  it("rejects empty jsonSchema", async () => {
    const client = makeClient();
    await expect(
      client.extraction.extractFields({
        jsonSchema: {},
        urls: ["https://example.com/a.pdf"],
      }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
  });

  it("propagates non-2xx as NeuroLinkerAPIError", async () => {
    server.use(
      http.post(`${BASE_URL}/v1/extract-fields`, () =>
        HttpResponse.json(
          { detail: "json_schema contains unsupported keyword: anyOf at /properties/x" },
          { status: 400 },
        ),
      ),
    );

    const client = makeClient();
    await expect(
      client.extraction.extractFields({
        jsonSchema: SAMPLE_SCHEMA,
        urls: ["https://example.com/a.pdf"],
      }),
    ).rejects.toBeInstanceOf(NeuroLinkerAPIError);
  });
});

// ---------------------------------------------------------------------------
// documents.fields
// ---------------------------------------------------------------------------

describe("extraction.documents.fields — mocks", () => {
  it("POSTs {document_ids} JSON to /v1/documents/fields", async () => {
    let captured: { method?: string; url?: string; body?: unknown } = {};
    server.use(
      http.post(`${BASE_URL}/v1/documents/fields`, async ({ request }) => {
        captured.method = request.method;
        captured.url = request.url;
        captured.body = await request.json();
        return HttpResponse.json({
          success: true,
          results: [],
          total: 0,
          successful: 0,
          failed: 0,
        });
      }),
    );

    const client = makeClient();
    await client.extraction.documents.fields(["doc-1", "doc-2"]);

    expect(captured.method).toBe("POST");
    expect(captured.url).toBe(`${BASE_URL}/v1/documents/fields`);
    expect(captured.body).toEqual({ document_ids: ["doc-1", "doc-2"] });
  });
});
