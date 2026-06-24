import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { NeuroLinker, NeuroLinkerConfigError } from "../../../src/index.js";

const BASE_URL = "https://mock.neurolinker.test";
const TOKEN = "nl_mock";
const TRACK_UID = "c6883578-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
const TRACE_ID = "0af7651916cd43dd8448eb211c80319c";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeClient() {
  return new NeuroLinker({ token: TOKEN, baseUrl: BASE_URL, timeoutS: 5 });
}

describe("evaluation.tracking", () => {
  it("tracks.create posts {name} and returns the body", async () => {
    let received: unknown;
    server.use(
      http.post(`${BASE_URL}/v1/eval/tracks`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ track_uid: TRACK_UID, name: "prod-rag", active: true });
      }),
    );

    const client = makeClient();
    const resp = await client.evaluation.tracking.tracks.create({ name: "prod-rag" });
    expect(received).toEqual({ name: "prod-rag" });
    expect((resp as Record<string, unknown>).track_uid).toBe(TRACK_UID);
  });

  it("tracks.list calls GET /v1/eval/tracks", async () => {
    let method: string | null = null;
    server.use(
      http.get(`${BASE_URL}/v1/eval/tracks`, ({ request }) => {
        method = request.method;
        return HttpResponse.json({ tracks: [{ track_uid: TRACK_UID, active: true }] });
      }),
    );

    const client = makeClient();
    const resp = await client.evaluation.tracking.tracks.list();
    expect(method).toBe("GET");
    expect(((resp as Record<string, unknown>).tracks as unknown[]).length).toBe(1);
  });

  it("tracks.setActive PATCHes {active}", async () => {
    let method: string | null = null;
    let received: unknown;
    server.use(
      http.patch(`${BASE_URL}/v1/eval/tracks/${TRACK_UID}`, async ({ request }) => {
        method = request.method;
        received = await request.json();
        return HttpResponse.json({ track_uid: TRACK_UID, active: false });
      }),
    );

    const client = makeClient();
    const resp = await client.evaluation.tracking.tracks.setActive(TRACK_UID, { active: false });
    expect(method).toBe("PATCH");
    expect(received).toEqual({ active: false });
    expect((resp as Record<string, unknown>).active).toBe(false);
  });

  it("queries lists per-query rows with the limit query param", async () => {
    let limit: string | null = null;
    server.use(
      http.get(`${BASE_URL}/v1/eval/tracks/${TRACK_UID}/queries`, ({ request }) => {
        limit = new URL(request.url).searchParams.get("limit");
        return HttpResponse.json({
          track_uid: TRACK_UID,
          queries: [{ trace_id: TRACE_ID, user_input: "Q", metrics: { faithfulness: 0.9 } }],
        });
      }),
    );

    const client = makeClient();
    const resp = await client.evaluation.tracking.queries(TRACK_UID, { limit: 50 });
    expect(limit).toBe("50");
    expect(((resp as Record<string, unknown>).queries as unknown[]).length).toBe(1);
  });

  it("query drills down into a single trace", async () => {
    let url: string | null = null;
    server.use(
      http.get(`${BASE_URL}/v1/eval/tracks/${TRACK_UID}/queries/${TRACE_ID}`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({
          track_uid: TRACK_UID,
          trace_id: TRACE_ID,
          retrieved_contexts: ["ctx"],
          metrics: {},
        });
      }),
    );

    const client = makeClient();
    const resp = await client.evaluation.tracking.query(TRACK_UID, TRACE_ID);
    expect(url).toContain(`/v1/eval/tracks/${TRACK_UID}/queries/${TRACE_ID}`);
    expect((resp as Record<string, unknown>).retrieved_contexts).toEqual(["ctx"]);
  });

  it("validates user-supplied input", async () => {
    const client = makeClient();
    await expect(
      client.evaluation.tracking.tracks.create({ name: "" }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
    await expect(
      client.evaluation.tracking.tracks.setActive("", { active: true }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
    await expect(client.evaluation.tracking.queries("")).rejects.toBeInstanceOf(
      NeuroLinkerConfigError,
    );
    await expect(client.evaluation.tracking.query(TRACK_UID, "")).rejects.toBeInstanceOf(
      NeuroLinkerConfigError,
    );
  });
});
