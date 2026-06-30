import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import {
  NeuroLinker,
  NeuroLinkerConfigError,
  extractMarkdownDocumentIds,
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

const SAMPLE_SCHEMA = {
  type: "object",
  properties: {
    invoice_number: { type: "string" },
    total_amount: { type: "number" },
  },
  required: ["invoice_number"],
};

const SOURCE_DOC = "3e09a9c3-f086-42b7-be39-171ce6005493";
const NEW_DOC = "8354971b-653a-4597-87a1-ab9638b5c235";

// ---------------------------------------------------------------------------
// extractFieldsFromMarkdown — plain JSON body (no multipart, no upload)
// ---------------------------------------------------------------------------

describe("extraction.extractFieldsFromMarkdown — mocks", () => {
  it("POSTs a JSON body to /v1/extract-fields-from-markdown", async () => {
    let captured: { method?: string; url?: string; body?: any } = {};
    server.use(
      http.post(`${BASE_URL}/v1/extract-fields-from-markdown`, async ({ request }) => {
        captured.method = request.method;
        captured.url = request.url;
        captured.body = await request.json();
        return HttpResponse.json({
          request_uid: "req-md-1",
          status: "PENDING",
          document_map: [{ source_document_uid: SOURCE_DOC, document_uid: NEW_DOC }],
          skipped: [],
        });
      }),
    );

    const client = makeClient();
    const out = await client.extraction.extractFieldsFromMarkdown({
      jsonSchema: SAMPLE_SCHEMA,
      documentIds: [SOURCE_DOC],
      alias: "test-alias",
      description: "test desc",
    });

    expect(captured.method).toBe("POST");
    expect(captured.url).toBe(`${BASE_URL}/v1/extract-fields-from-markdown`);
    expect(captured.body).toEqual({
      document_ids: [SOURCE_DOC],
      json_schema: SAMPLE_SCHEMA,
      alias: "test-alias",
      description: "test desc",
    });
    expect((out as any).document_map[0].document_uid).toBe(NEW_DOC);
  });

  it("omits optional alias/description when not provided", async () => {
    let captured: { body?: any } = {};
    server.use(
      http.post(`${BASE_URL}/v1/extract-fields-from-markdown`, async ({ request }) => {
        captured.body = await request.json();
        return HttpResponse.json({ request_uid: "r", status: "PENDING", document_map: [], skipped: [] });
      }),
    );

    await makeClient().extraction.extractFieldsFromMarkdown({
      jsonSchema: SAMPLE_SCHEMA,
      documentIds: [SOURCE_DOC],
    });

    expect(captured.body).toEqual({ document_ids: [SOURCE_DOC], json_schema: SAMPLE_SCHEMA });
  });

  it("rejects an empty documentIds array (no request sent)", async () => {
    await expect(
      makeClient().extraction.extractFieldsFromMarkdown({
        jsonSchema: SAMPLE_SCHEMA,
        documentIds: [],
      }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
  });

  it("rejects an empty schema (no request sent)", async () => {
    await expect(
      makeClient().extraction.extractFieldsFromMarkdown({
        jsonSchema: {},
        documentIds: [SOURCE_DOC],
      }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
  });
});

// ---------------------------------------------------------------------------
// documents.scalars
// ---------------------------------------------------------------------------

describe("extraction.documents.scalars — mocks", () => {
  it("POSTs { document_ids } to /v1/documents/scalars", async () => {
    let captured: { url?: string; body?: any } = {};
    server.use(
      http.post(`${BASE_URL}/v1/documents/scalars`, async ({ request }) => {
        captured.url = request.url;
        captured.body = await request.json();
        return HttpResponse.json({
          success: true,
          results: [{ document_id: NEW_DOC, format: "scalars", content: { invoice_number: "INV-1" } }],
          total: 1,
          successful: 1,
          failed: 0,
        });
      }),
    );

    const out = await makeClient().extraction.documents.scalars([NEW_DOC]);

    expect(captured.url).toBe(`${BASE_URL}/v1/documents/scalars`);
    expect(captured.body).toEqual({ document_ids: [NEW_DOC] });
    expect((out as any).results[0].content.invoice_number).toBe("INV-1");
  });
});

// ---------------------------------------------------------------------------
// extractMarkdownDocumentIds helper
// ---------------------------------------------------------------------------

describe("extractMarkdownDocumentIds", () => {
  it("pulls the new document_uids from document_map", () => {
    const submit = {
      request_uid: "r",
      document_map: [
        { source_document_uid: SOURCE_DOC, document_uid: NEW_DOC },
        { source_document_uid: "src2", document_uid: "new2" },
      ],
    };
    expect(extractMarkdownDocumentIds(submit)).toEqual([NEW_DOC, "new2"]);
  });

  it("returns [] when document_map is missing", () => {
    expect(extractMarkdownDocumentIds({ request_uid: "r" })).toEqual([]);
  });

  it("handles a data envelope and skips malformed items", () => {
    const submit = {
      data: {
        document_map: [
          { source_document_uid: SOURCE_DOC, document_uid: NEW_DOC },
          { source_document_uid: "src2" },
          "not-an-object",
        ],
      },
    };
    expect(extractMarkdownDocumentIds(submit)).toEqual([NEW_DOC]);
  });
});
