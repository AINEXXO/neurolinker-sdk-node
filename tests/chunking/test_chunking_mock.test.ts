import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { NeuroLinker, NeuroLinkerAPIError, NeuroLinkerConfigError } from "../../src/index.js";

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

describe("chunking.jobs.create", () => {
  it("posts the snake_case payload and returns body", async () => {
    let receivedBody: unknown;
    let authHeader: string | null = null;

    server.use(
      http.post(`${BASE_URL}/v1/chunk/jobs`, async ({ request }) => {
        authHeader = request.headers.get("authorization");
        receivedBody = await request.json();
        return HttpResponse.json({ job_uid: "job-123", status: "queued" });
      }),
    );

    const client = makeClient();
    const resp = await client.chunking.jobs.create({
      bucketUid: "b-1",
      chunking: { method: "section_greedy", tMin: 100, tMax: 500, modelName: "gte" },
    });

    expect(resp).toEqual({ job_uid: "job-123", status: "queued" });
    expect(authHeader).toBe(`Bearer ${TOKEN}`);
    expect(receivedBody).toEqual({
      bucket_uid: "b-1",
      chunking: {
        method: "section_greedy",
        t_min: 100,
        t_max: 500,
        model_name: "gte",
      },
    });
  });

  it("rejects empty bucketUid", async () => {
    const client = makeClient();
    await expect(
      client.chunking.jobs.create({
        bucketUid: "",
        chunking: { method: "section_greedy" },
      }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
  });

  it("rejects an invalid chunking config", async () => {
    const client = makeClient();
    await expect(
      client.chunking.jobs.create({
        bucketUid: "b-1",
        chunking: { method: "md_header_level", chunkAtLevel: 99 } as never,
      }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
  });

  it("propagates a non-2xx HTTP response as NeuroLinkerAPIError", async () => {
    server.use(
      http.post(`${BASE_URL}/v1/chunk/jobs`, () =>
        HttpResponse.json({ detail: "bad" }, { status: 400 }),
      ),
    );

    const client = makeClient();
    await expect(
      client.chunking.jobs.create({
        bucketUid: "b-1",
        chunking: { method: "section_greedy" },
      }),
    ).rejects.toBeInstanceOf(NeuroLinkerAPIError);
  });
});

describe("chunking.jobs.get / wait", () => {
  it("get returns the body", async () => {
    server.use(
      http.get(`${BASE_URL}/v1/chunk/jobs/job-1`, () =>
        HttpResponse.json({ job_uid: "job-1", status: "running" }),
      ),
    );

    const client = makeClient();
    const resp = await client.chunking.jobs.get("job-1");
    expect(resp).toEqual({ job_uid: "job-1", status: "running" });
  });

  it("wait polls until terminal status", async () => {
    let attempts = 0;
    server.use(
      http.get(`${BASE_URL}/v1/chunk/jobs/job-2`, () => {
        attempts += 1;
        if (attempts < 3) {
          return HttpResponse.json({ job_uid: "job-2", status: "running" });
        }
        return HttpResponse.json({ job_uid: "job-2", status: "completed" });
      }),
    );

    const client = makeClient();
    const resp = await client.chunking.jobs.wait("job-2");
    expect(resp).toEqual({ job_uid: "job-2", status: "completed" });
    expect(attempts).toBeGreaterThanOrEqual(3);
  });

  it("wait tolerates 404 during early polling", async () => {
    let attempts = 0;
    server.use(
      http.get(`${BASE_URL}/v1/chunk/jobs/job-3`, () => {
        attempts += 1;
        if (attempts === 1) {
          return HttpResponse.json({ detail: "not yet" }, { status: 404 });
        }
        return HttpResponse.json({ job_uid: "job-3", status: "completed" });
      }),
    );

    const client = makeClient();
    const resp = await client.chunking.jobs.wait("job-3");
    expect(resp).toEqual({ job_uid: "job-3", status: "completed" });
  });
});

describe("chunking.analyze", () => {
  it("posts bucket_uid and returns body", async () => {
    let body: unknown;
    server.use(
      http.post(`${BASE_URL}/v1/chunk/analyze`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          success: true,
          result: {
            files: {
              "chunking_statistics.json": "https://signed.example/stats.json",
            },
          },
        });
      }),
    );

    const client = makeClient();
    const resp = await client.chunking.analyze("b-9");
    expect(body).toEqual({ bucket_uid: "b-9" });
    expect((resp as any).success).toBe(true);
  });
});

describe("chunking.results", () => {
  it("fetches each signed URL and returns {filename: bytes}", async () => {
    server.use(
      http.post(`${BASE_URL}/v1/chunk/results`, () =>
        HttpResponse.json({
          success: true,
          result: {
            files: {
              "chunks.msgpack": "https://signed.example/chunks.bin",
              "stats.json": "https://signed.example/stats.json",
            },
          },
        }),
      ),
      http.get("https://signed.example/chunks.bin", () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer),
      ),
      http.get("https://signed.example/stats.json", () =>
        HttpResponse.text('{"ok": true}'),
      ),
    );

    const client = makeClient();
    const out = await client.chunking.results("b-42");
    expect(Object.keys(out).sort()).toEqual(["chunks.msgpack", "stats.json"]);
    expect(out["chunks.msgpack"]).toBeInstanceOf(Buffer);
    expect(Array.from(out["chunks.msgpack"])).toEqual([1, 2, 3, 4]);
    expect(out["stats.json"].toString("utf8")).toBe('{"ok": true}');
  });

  it("returns {} when result.files is missing", async () => {
    server.use(
      http.post(`${BASE_URL}/v1/chunk/results`, () =>
        HttpResponse.json({ success: true, result: {} }),
      ),
    );

    const client = makeClient();
    const out = await client.chunking.results("b-empty");
    expect(out).toEqual({});
  });

  it("raises NeuroLinkerAPIError if a signed URL returns non-2xx", async () => {
    server.use(
      http.post(`${BASE_URL}/v1/chunk/results`, () =>
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
    await expect(client.chunking.results("b-x")).rejects.toBeInstanceOf(NeuroLinkerAPIError);
  });
});
