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

describe("management.secrets — happy path", () => {
  it("create posts {name, value} and returns body", async () => {
    let received: unknown;
    server.use(
      http.post(`${BASE_URL}/v1/management/secrets`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ secret_id: "sec-1", name: "my-secret" });
      }),
    );

    const client = makeClient();
    const resp = await client.management.secrets.create({
      name: "my-secret",
      value: "supersecret",
    });
    expect(resp).toEqual({ secret_id: "sec-1", name: "my-secret" });
    expect(received).toEqual({ name: "my-secret", value: "supersecret" });
  });

  it("create rejects empty name/value", async () => {
    const client = makeClient();
    await expect(
      client.management.secrets.create({ name: "", value: "v" }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
    await expect(
      client.management.secrets.create({ name: "n", value: "" }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
  });

  it("list calls GET /v1/management/secrets", async () => {
    server.use(
      http.get(`${BASE_URL}/v1/management/secrets`, () =>
        HttpResponse.json({ secrets: [{ secret_id: "sec-1", name: "n" }] }),
      ),
    );

    const client = makeClient();
    const resp = await client.management.secrets.list();
    expect((resp as any).secrets).toHaveLength(1);
  });

  it("update PUTs the value and returns void", async () => {
    let received: unknown;
    server.use(
      http.put(`${BASE_URL}/v1/management/secrets/sec-1`, async ({ request }) => {
        received = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const client = makeClient();
    const resp = await client.management.secrets.update("sec-1", { value: "new-val" });
    expect(resp).toBeUndefined();
    expect(received).toEqual({ value: "new-val" });
  });

  it("update rejects empty secretId / value", async () => {
    const client = makeClient();
    await expect(
      client.management.secrets.update("", { value: "v" }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
    await expect(
      client.management.secrets.update("sec-1", { value: "" }),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
  });

  it("delete returns void; rejects empty id", async () => {
    server.use(
      http.delete(`${BASE_URL}/v1/management/secrets/sec-1`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );

    const client = makeClient();
    const resp = await client.management.secrets.delete("sec-1");
    expect(resp).toBeUndefined();

    await expect(client.management.secrets.delete("")).rejects.toBeInstanceOf(
      NeuroLinkerConfigError,
    );
  });
});

describe("management.secrets — secret redaction on errors", () => {
  const SECRET = "ultra-secret-token-9876";

  it("redacts the value from responseText on create", async () => {
    server.use(
      http.post(`${BASE_URL}/v1/management/secrets`, () =>
        HttpResponse.text(`Server echo: provided value '${SECRET}' is invalid`, {
          status: 400,
        }),
      ),
    );

    const client = makeClient();
    let caught: NeuroLinkerAPIError | undefined;
    try {
      await client.management.secrets.create({ name: "n", value: SECRET });
    } catch (e) {
      if (e instanceof NeuroLinkerAPIError) caught = e;
      else throw e;
    }
    expect(caught).toBeDefined();
    expect(caught!.responseText).not.toContain(SECRET);
    expect(caught!.responseText).toContain("[REDACTED]");
  });

  it("redacts the value from responseJson on update", async () => {
    server.use(
      http.put(`${BASE_URL}/v1/management/secrets/sec-1`, () =>
        HttpResponse.json(
          { detail: `value '${SECRET}' rejected`, echo: SECRET },
          { status: 400 },
        ),
      ),
    );

    const client = makeClient();
    let caught: NeuroLinkerAPIError | undefined;
    try {
      await client.management.secrets.update("sec-1", { value: SECRET });
    } catch (e) {
      if (e instanceof NeuroLinkerAPIError) caught = e;
      else throw e;
    }
    expect(caught).toBeDefined();
    expect(caught!.responseText).not.toContain(SECRET);
    expect(JSON.stringify(caught!.responseJson)).not.toContain(SECRET);
    expect(JSON.stringify(caught!.responseJson)).toContain("[REDACTED]");
  });
});
