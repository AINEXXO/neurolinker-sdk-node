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
  return new NeuroLinker({ token: TOKEN, baseUrl: BASE_URL, timeoutS: 5 });
}

describe("management.buckets", () => {
  it("create posts {name} and returns the body", async () => {
    let received: unknown;
    server.use(
      http.post(`${BASE_URL}/v1/management/buckets`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ bucket_uid: "b-123", name: "my-bucket" });
      }),
    );

    const client = makeClient();
    const resp = await client.management.buckets.create({ name: "my-bucket" });
    expect(resp).toEqual({ bucket_uid: "b-123", name: "my-bucket" });
    expect(received).toEqual({ name: "my-bucket" });
  });

  it("create rejects empty name", async () => {
    const client = makeClient();
    await expect(
      client.management.buckets.create({ name: "" }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
  });

  it("addSources converts camelCase → snake_case in body and returns void", async () => {
    let received: unknown;
    server.use(
      http.post(`${BASE_URL}/v1/management/buckets/b-1/sources`, async ({ request }) => {
        received = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const client = makeClient();
    const resp = await client.management.buckets.addSources("b-1", {
      sources: [
        { requestUid: "req-1", docUids: ["d-1", "d-2"] },
        { requestUid: "req-2" },
      ],
    });
    expect(resp).toBeUndefined();
    expect(received).toEqual({
      sources: [
        { request_uid: "req-1", doc_uids: ["d-1", "d-2"] },
        { request_uid: "req-2" },
      ],
    });
  });

  it("addSources rejects empty list", async () => {
    const client = makeClient();
    await expect(
      client.management.buckets.addSources("b-1", { sources: [] }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
  });

  it("addSources rejects sources missing requestUid", async () => {
    const client = makeClient();
    await expect(
      client.management.buckets.addSources("b-1", {
        sources: [{ requestUid: "" } as never],
      }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
  });

  it("list calls GET /v1/management/buckets", async () => {
    server.use(
      http.get(`${BASE_URL}/v1/management/buckets`, () =>
        HttpResponse.json({ buckets: [{ bucket_uid: "b-1" }] }),
      ),
    );

    const client = makeClient();
    const resp = await client.management.buckets.list();
    expect((resp as any).buckets).toHaveLength(1);
  });

  it("get and delete work and rejects empty uid", async () => {
    server.use(
      http.get(`${BASE_URL}/v1/management/buckets/b-9`, () =>
        HttpResponse.json({ bucket_uid: "b-9", name: "x" }),
      ),
      http.delete(`${BASE_URL}/v1/management/buckets/b-9`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );

    const client = makeClient();
    const got = await client.management.buckets.get("b-9");
    expect((got as any).bucket_uid).toBe("b-9");

    const deleted = await client.management.buckets.delete("b-9");
    expect(deleted).toBeUndefined();

    await expect(client.management.buckets.get("")).rejects.toBeInstanceOf(
      NeuroLinkerConfigError,
    );
    await expect(client.management.buckets.delete("")).rejects.toBeInstanceOf(
      NeuroLinkerConfigError,
    );
  });

  it("propagates non-2xx as NeuroLinkerAPIError", async () => {
    server.use(
      http.post(`${BASE_URL}/v1/management/buckets`, () =>
        HttpResponse.json({ detail: "bad" }, { status: 400 }),
      ),
    );

    const client = makeClient();
    await expect(
      client.management.buckets.create({ name: "x" }),
    ).rejects.toBeInstanceOf(NeuroLinkerAPIError);
  });
});
