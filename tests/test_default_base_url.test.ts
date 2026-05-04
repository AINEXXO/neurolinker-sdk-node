import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { NeuroLinker } from "../src/index.js";
import { DEFAULT_BASE_URL } from "../src/config.js";

// When ``baseUrl`` is omitted from the constructor, every module's resource
// must call the canonical default deployment. These tests intercept the
// default host with MSW and exercise one cheap call per module to prove the
// URL rewriting + base_url propagation reaches all of them — same coverage
// the Python SDK gets from its ``test_wrapper_*_async.py`` files, consolidated
// into a single suite here.

const BASE = DEFAULT_BASE_URL.replace(/\/+$/, "");
const FAKE_BUCKET = "bkt_00000000-0000-0000-0000-000000000000";
const FAKE_JOB = "job_00000000-0000-0000-0000-000000000000";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeClient(): NeuroLinker {
  // No baseUrl on purpose — we want the default to kick in.
  return new NeuroLinker({ token: "nl_dummy", timeoutS: 1 });
}

describe("default base URL — propagation across all modules", () => {
  it("extraction.listTasks() hits DEFAULT_BASE_URL/v1/tasks", async () => {
    let calledUrl: string | undefined;
    server.use(
      http.get(`${BASE}/v1/tasks`, ({ request }) => {
        calledUrl = request.url;
        return HttpResponse.json({ success: true, tasks: [] });
      }),
    );

    const client = makeClient();
    await client.extraction.listTasks();
    expect(calledUrl).toBe(`${BASE}/v1/tasks`);
  });

  it("chunking.jobs.get() hits DEFAULT_BASE_URL/v1/chunk/jobs/{uid}", async () => {
    let calledUrl: string | undefined;
    server.use(
      http.get(`${BASE}/v1/chunk/jobs/${FAKE_JOB}`, ({ request }) => {
        calledUrl = request.url;
        return HttpResponse.json({
          job_uid: FAKE_JOB,
          status: "completed",
          bucket_uid: FAKE_BUCKET,
        });
      }),
    );

    const client = makeClient();
    await client.chunking.jobs.get(FAKE_JOB);
    expect(calledUrl).toBe(`${BASE}/v1/chunk/jobs/${FAKE_JOB}`);
  });

  it("embedding.jobs.get() hits DEFAULT_BASE_URL/v1/embed/jobs/{uid}", async () => {
    let calledUrl: string | undefined;
    server.use(
      http.get(`${BASE}/v1/embed/jobs/${FAKE_JOB}`, ({ request }) => {
        calledUrl = request.url;
        return HttpResponse.json({ job_uid: FAKE_JOB, status: "completed" });
      }),
    );

    const client = makeClient();
    await client.embedding.jobs.get(FAKE_JOB);
    expect(calledUrl).toBe(`${BASE}/v1/embed/jobs/${FAKE_JOB}`);
  });

  it("vectorStore.jobs.get() hits DEFAULT_BASE_URL/v1/vector-store/jobs/{uid}", async () => {
    let calledUrl: string | undefined;
    server.use(
      http.get(`${BASE}/v1/vector-store/jobs/${FAKE_JOB}`, ({ request }) => {
        calledUrl = request.url;
        return HttpResponse.json({
          job_uid: FAKE_JOB,
          status: "completed",
          collection_name: "x",
        });
      }),
    );

    const client = makeClient();
    await client.vectorStore.jobs.get(FAKE_JOB);
    expect(calledUrl).toBe(`${BASE}/v1/vector-store/jobs/${FAKE_JOB}`);
  });

  it("management.buckets.create() hits DEFAULT_BASE_URL/v1/management/buckets", async () => {
    let calledUrl: string | undefined;
    let body: unknown;
    server.use(
      http.post(`${BASE}/v1/management/buckets`, async ({ request }) => {
        calledUrl = request.url;
        body = await request.json();
        return HttpResponse.json({ bucket_uid: FAKE_BUCKET, name: "KB" });
      }),
    );

    const client = makeClient();
    await client.management.buckets.create({ name: "KB" });
    expect(calledUrl).toBe(`${BASE}/v1/management/buckets`);
    expect(body).toEqual({ name: "KB" });
  });
});
