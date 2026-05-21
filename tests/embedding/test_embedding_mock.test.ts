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

function makeClient() {
  return new NeuroLinker({
    token: TOKEN,
    baseUrl: BASE_URL,
    timeoutS: 5,
    pollIntervalS: 0.05,
    pollMaxIntervalS: 0.1,
  });
}

const validEmbeddings = [
  {
    contentType: "text",
    inputs: ["content"],
    vectors: [
      {
        vectorType: "dense",
        fieldName: "text_dense",
        modelName: "ainexxo-bge-m3",
      },
    ],
  },
] as const;

describe("embedding.jobs.create", () => {
  it("posts snake_case embeddings payload", async () => {
    let received: unknown;
    server.use(
      http.post(`${BASE_URL}/v1/embed/jobs`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ job_uid: "embed-1", status: "queued" });
      }),
    );

    const client = makeClient();
    const resp = await client.embedding.jobs.create({
      bucketUid: "b-1",
      embeddings: validEmbeddings as any,
    });
    expect(resp).toEqual({ job_uid: "embed-1", status: "queued" });
    expect(received).toEqual({
      bucket_uid: "b-1",
      embeddings: [
        {
          content_type: "text",
          inputs: ["content"],
          vectors: [
            {
              vector_type: "dense",
              field_name: "text_dense",
              model_name: "ainexxo-bge-m3",
            },
          ],
        },
      ],
    });
  });

  it("supports multiple vectors and external apiKey", async () => {
    let received: any;
    server.use(
      http.post(`${BASE_URL}/v1/embed/jobs`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ job_uid: "embed-2", status: "queued" });
      }),
    );

    const client = makeClient();
    await client.embedding.jobs.create({
      bucketUid: "b-2",
      embeddings: [
        {
          contentType: "text",
          inputs: ["content", "header_path"],
          vectors: [
            {
              vectorType: "dense",
              fieldName: "text_dense_bge",
              modelName: "ainexxo-bge-m3",
            },
            {
              vectorType: "sparse",
              fieldName: "text_sparse_splade",
              modelName: "ainexxo-splade",
            },
          ],
        },
        {
          contentType: "image",
          inputs: ["image_base64", "description"],
          vectors: [
            {
              vectorType: "dense",
              fieldName: "image_dense_jina",
              modelName: "jina_ai/jina-embeddings-v4",
              apiKey: "jina-key",
            },
          ],
        },
      ],
    });

    expect(received.embeddings[0].vectors[0].field_name).toBe("text_dense_bge");
    expect(received.embeddings[0].vectors[1].field_name).toBe("text_sparse_splade");
    expect(received.embeddings[1].vectors[0].api_key).toBe("jina-key");
  });

  it("rejects empty bucketUid", async () => {
    const client = makeClient();
    await expect(
      client.embedding.jobs.create({ bucketUid: "", embeddings: validEmbeddings as any }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
  });

  it("rejects invalid embeddings", async () => {
    const client = makeClient();
    await expect(
      client.embedding.jobs.create({
        bucketUid: "b-1",
        embeddings: [
          {
            contentType: "text",
            inputs: ["content"],
            vectors: [
              {
                vectorType: "dense",
                fieldName: "item_bad",
                modelName: "ainexxo-bge-m3",
              },
            ],
          },
        ] as any,
      }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
  });

  it("propagates non-2xx as NeuroLinkerAPIError", async () => {
    server.use(
      http.post(`${BASE_URL}/v1/embed/jobs`, () =>
        HttpResponse.json({ detail: "bad" }, { status: 422 }),
      ),
    );

    const client = makeClient();
    await expect(
      client.embedding.jobs.create({ bucketUid: "b-1", embeddings: validEmbeddings as any }),
    ).rejects.toBeInstanceOf(NeuroLinkerAPIError);
  });
});

describe("embedding.jobs.get / wait", () => {
  it("get returns the body", async () => {
    server.use(
      http.get(`${BASE_URL}/v1/embed/jobs/b-1/embed-1`, () =>
        HttpResponse.json({ job_uid: "embed-1", status: "running" }),
      ),
    );

    const client = makeClient();
    const resp = await client.embedding.jobs.get("b-1", "embed-1");
    expect(resp).toEqual({ job_uid: "embed-1", status: "running" });
  });

  it("wait polls until terminal status", async () => {
    let attempts = 0;
    server.use(
      http.get(`${BASE_URL}/v1/embed/jobs/b-1/embed-2`, () => {
        attempts += 1;
        if (attempts < 2) {
          return HttpResponse.json({ job_uid: "embed-2", status: "running" });
        }
        return HttpResponse.json({ job_uid: "embed-2", status: "completed" });
      }),
    );

    const client = makeClient();
    const resp = await client.embedding.jobs.wait("b-1", "embed-2");
    expect(resp).toEqual({ job_uid: "embed-2", status: "completed" });
    expect(attempts).toBeGreaterThanOrEqual(2);
  });
});

describe("embedding.listModels", () => {
  it("calls GET /v1/embed/models", async () => {
    let authHeader: string | null = null;
    server.use(
      http.get(`${BASE_URL}/v1/embed/models`, ({ request }) => {
        authHeader = request.headers.get("authorization");
        return HttpResponse.json({
          success: true,
          models: [{ name: "m1", vector_types: ["dense"] }],
        });
      }),
    );

    const client = makeClient();
    const resp = await client.embedding.listModels();
    expect((resp as any).success).toBe(true);
    expect(authHeader).toBe(`Bearer ${TOKEN}`);
  });
});

describe("embedding.results", () => {
  it("downloads each signed URL and returns {filename: bytes}", async () => {
    server.use(
      http.post(`${BASE_URL}/v1/embed/results`, () =>
        HttpResponse.json({
          success: true,
          result: {
            files: {
              "vectors.bin": "https://signed.example/vec.bin",
            },
          },
        }),
      ),
      http.get("https://signed.example/vec.bin", () =>
        HttpResponse.arrayBuffer(new Uint8Array([9, 8, 7]).buffer),
      ),
    );

    const client = makeClient();
    const out = await client.embedding.results("b-42");
    expect(Object.keys(out)).toEqual(["vectors.bin"]);
    expect(Array.from(out["vectors.bin"])).toEqual([9, 8, 7]);
  });

  it("throws NeuroLinkerAPIError when signed URL fails", async () => {
    server.use(
      http.post(`${BASE_URL}/v1/embed/results`, () =>
        HttpResponse.json({
          success: true,
          result: { files: { "x.bin": "https://signed.example/x.bin" } },
        }),
      ),
      http.get("https://signed.example/x.bin", () =>
        HttpResponse.text("expired", { status: 403 }),
      ),
    );

    const client = makeClient();
    await expect(client.embedding.results("b-x")).rejects.toBeInstanceOf(NeuroLinkerAPIError);
  });
});
