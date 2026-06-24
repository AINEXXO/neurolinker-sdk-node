import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import {
  NeuroLinker,
  NeuroLinkerAPIError,
  NeuroLinkerConfigError,
} from "../../../src/index.js";

const BASE_URL = "https://mock.neurolinker.test";
const TOKEN = "nl_mock";
const EVAL_UID = "a1645cc1-230a-4ec3-9b3a-c815592fb1ac";
const JSONL = Buffer.from('{"user_input": "Q", "response": "R"}\n', "utf-8");

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeClient() {
  return new NeuroLinker({
    token: TOKEN,
    baseUrl: BASE_URL,
    timeoutS: 5,
    pollIntervalS: 0.01,
    pollMaxIntervalS: 0.01,
  });
}

describe("evaluation.oneshot", () => {
  it("create uploads the JSONL as a multipart 'file' field", async () => {
    let name: string | null = null;
    let text: string | null = null;
    server.use(
      http.post(`${BASE_URL}/v1/eval/oneshot/jobs`, async ({ request }) => {
        const form = await request.formData();
        const file = form.get("file") as File | null;
        name = file ? file.name : null;
        text = file ? await file.text() : null;
        return HttpResponse.json({ eval_uid: EVAL_UID, status: "pending" });
      }),
    );

    const client = makeClient();
    const resp = await client.evaluation.oneshot.jobs.create({
      dataset: { filename: "demo.jsonl", content: JSONL },
    });

    expect(name).toBe("demo.jsonl");
    expect(text).toContain('"user_input": "Q"');
    expect((resp as Record<string, unknown>).eval_uid).toBe(EVAL_UID);
  });

  it("create rejects invalid datasets", async () => {
    const client = makeClient();
    await expect(
      client.evaluation.oneshot.jobs.create({ dataset: { filename: "data.csv", content: JSONL } }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
    await expect(
      client.evaluation.oneshot.jobs.create({
        dataset: { filename: "data.jsonl", content: Buffer.alloc(0) },
      }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
  });

  it("get fetches status and rejects empty evalUid", async () => {
    let method: string | null = null;
    server.use(
      http.get(`${BASE_URL}/v1/eval/oneshot/jobs/${EVAL_UID}`, ({ request }) => {
        method = request.method;
        return HttpResponse.json({ eval_uid: EVAL_UID, status: "completed" });
      }),
    );

    const client = makeClient();
    const resp = await client.evaluation.oneshot.jobs.get(EVAL_UID);
    expect(method).toBe("GET");
    expect((resp as Record<string, unknown>).status).toBe("completed");

    await expect(client.evaluation.oneshot.jobs.get("")).rejects.toBeInstanceOf(
      NeuroLinkerConfigError,
    );
  });

  it("wait polls until a terminal status (processing → completed)", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE_URL}/v1/eval/oneshot/jobs/${EVAL_UID}`, () => {
        calls += 1;
        const status = calls >= 2 ? "completed" : "processing";
        return HttpResponse.json({ eval_uid: EVAL_UID, status });
      }),
    );

    const client = makeClient();
    const final = await client.evaluation.oneshot.jobs.wait(EVAL_UID);
    expect((final as Record<string, unknown>).status).toBe("completed");
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it("results does the 2-step signed-URL flow and returns the parsed result.json", async () => {
    const RESULT = {
      eval_uid: EVAL_UID,
      rows: [{ row_id: 0, metrics: { faithfulness: 0.9 } }],
      summary: { faithfulness: { mean: 0.9, count: 1 } },
    };
    const calls: string[] = [];
    server.use(
      http.post(`${BASE_URL}/v1/eval/oneshot/results`, () => {
        calls.push("results");
        return HttpResponse.json({
          success: true,
          result: { files: { "result.json": "https://storage.example/result.json?sig=x" } },
        });
      }),
      http.get("https://storage.example/result.json", () => {
        calls.push("signed");
        return HttpResponse.json(RESULT);
      }),
    );

    const client = makeClient();
    const out = await client.evaluation.oneshot.results(EVAL_UID);
    expect(out).toEqual(RESULT);
    expect(calls).toEqual(["results", "signed"]);
  });

  it("results throws when the result isn't ready yet", async () => {
    server.use(
      http.post(`${BASE_URL}/v1/eval/oneshot/results`, () =>
        HttpResponse.json({
          success: false,
          message: "Result not yet available",
          result: { files: {}, error: "result not yet available" },
        }),
      ),
    );

    const client = makeClient();
    await expect(client.evaluation.oneshot.results(EVAL_UID)).rejects.toBeInstanceOf(
      NeuroLinkerConfigError,
    );
  });

  it("results rejects empty evalUid", async () => {
    const client = makeClient();
    await expect(client.evaluation.oneshot.results("")).rejects.toBeInstanceOf(
      NeuroLinkerConfigError,
    );
  });

  it("propagates non-2xx as NeuroLinkerAPIError", async () => {
    server.use(
      http.post(`${BASE_URL}/v1/eval/oneshot/jobs`, () =>
        HttpResponse.json({ detail: "bad" }, { status: 400 }),
      ),
    );

    const client = makeClient();
    await expect(
      client.evaluation.oneshot.jobs.create({
        dataset: { filename: "demo.jsonl", content: JSONL },
      }),
    ).rejects.toBeInstanceOf(NeuroLinkerAPIError);
  });
});
