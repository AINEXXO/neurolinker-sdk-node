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

const validCollection = {
  name: "my_collection",
  fields: [
    { name: "chunk_id", dtype: "text" as const, isPrimary: true },
    { name: "content", dtype: "text" as const },
    { name: "text_dense", dtype: "dense_vector" as const, dim: 1024 },
  ],
};

const validVdb = {
  uri: "https://your-cluster.zilliz.com",
  apiKey: "sk-1",
};

describe("vectorStore.collections.create", () => {
  it("posts collection + vector_db_config in snake_case", async () => {
    let received: unknown;
    server.use(
      http.post(`${BASE_URL}/v1/vector-store/collections`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ success: true, already_existed: false });
      }),
    );

    const client = makeClient();
    const resp = await client.vectorStore.collections.create({
      collection: validCollection,
      vectorDbConfig: validVdb,
      database: "main",
    });

    expect((resp as any).success).toBe(true);
    expect(received).toEqual({
      collection: {
        name: "my_collection",
        description: "",
        options: {},
        fields: [
          {
            name: "chunk_id",
            dtype: "text",
            is_primary: true,
            options: {},
          },
          {
            name: "content",
            dtype: "text",
            is_primary: false,
            options: {},
          },
          {
            name: "text_dense",
            dtype: "dense_vector",
            distance: "cosine",
            is_primary: false,
            options: {},
            dim: 1024,
          },
        ],
      },
      vector_db_config: {
        uri: "https://your-cluster.zilliz.com",
        timeout: 300,
        api_key: "sk-1",
      },
      database: "main",
    });
  });

  it("rejects invalid collection (dense_vector without dim)", async () => {
    const client = makeClient();
    await expect(
      client.vectorStore.collections.create({
        collection: {
          name: "bad",
          fields: [{ name: "v", dtype: "dense_vector" }],
        },
        vectorDbConfig: validVdb,
      }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
  });

  it("propagates non-2xx as NeuroLinkerAPIError", async () => {
    server.use(
      http.post(`${BASE_URL}/v1/vector-store/collections`, () =>
        HttpResponse.json({ detail: "bad" }, { status: 400 }),
      ),
    );

    const client = makeClient();
    await expect(
      client.vectorStore.collections.create({
        collection: validCollection,
        vectorDbConfig: validVdb,
      }),
    ).rejects.toBeInstanceOf(NeuroLinkerAPIError);
  });
});

describe("vectorStore.jobs", () => {
  const validMappings = [
    { name: "chunk_id", source: "item_id" },
    { name: "content", source: "item_content" },
    { name: "text_dense", source: "text_dense" },
  ];

  it("create posts the snake_case payload", async () => {
    let received: unknown;
    server.use(
      http.post(`${BASE_URL}/v1/vector-store/jobs`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ job_uid: "vload-1", status: "queued" });
      }),
    );

    const client = makeClient();
    const resp = await client.vectorStore.jobs.create({
      bucketUid: "b-1",
      collectionName: "my_collection",
      fieldMappings: validMappings,
      vectorDbConfig: validVdb,
    });
    expect(resp).toEqual({ job_uid: "vload-1", status: "queued" });
    expect((received as any).bucket_uid).toBe("b-1");
    expect((received as any).collection_name).toBe("my_collection");
    expect((received as any).field_mappings).toEqual(validMappings);
    expect((received as any).vector_db_config).toEqual({
      uri: validVdb.uri,
      timeout: 300,
      api_key: validVdb.apiKey,
    });
    expect((received as any).database).toBe("");
  });

  it("create rejects empty bucketUid / collectionName", async () => {
    const client = makeClient();
    await expect(
      client.vectorStore.jobs.create({
        bucketUid: "",
        collectionName: "x",
        fieldMappings: validMappings,
        vectorDbConfig: validVdb,
      }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);

    await expect(
      client.vectorStore.jobs.create({
        bucketUid: "b",
        collectionName: "",
        fieldMappings: validMappings,
        vectorDbConfig: validVdb,
      }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
  });

  it("create rejects empty fieldMappings", async () => {
    const client = makeClient();
    await expect(
      client.vectorStore.jobs.create({
        bucketUid: "b-1",
        collectionName: "c",
        fieldMappings: [],
        vectorDbConfig: validVdb,
      }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
  });

  it("get + wait flow", async () => {
    let attempts = 0;
    server.use(
      http.get(`${BASE_URL}/v1/vector-store/jobs/b-1/vload-2`, () => {
        attempts += 1;
        if (attempts < 2) {
          return HttpResponse.json({ job_uid: "vload-2", status: "running" });
        }
        return HttpResponse.json({ job_uid: "vload-2", status: "completed" });
      }),
    );

    const client = makeClient();
    const got = await client.vectorStore.jobs.get("b-1", "vload-2");
    expect((got as any).status).toBe("running");

    const final = await client.vectorStore.jobs.wait("b-1", "vload-2");
    expect((final as any).status).toBe("completed");
  });
});
