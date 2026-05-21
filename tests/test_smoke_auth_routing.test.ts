import { describe, expect, it } from "vitest";
import { NeuroLinker, NeuroLinkerAPIError } from "../src/index.js";

// Smoke E2E: prove ingress + auth + per-module routing are all wired correctly
// against the real backend. Each module is exercised with a known-non-existent
// UID so the backend returns a real 404, surfaced by the SDK as
// ``NeuroLinkerAPIError(status_code=404)``. Plus one top-level auth check that
// hits any endpoint with an invalid token and asserts the error.

const TOKEN = process.env.NEUROLINKER_API_KEY;
const BASE_URL = process.env.NEUROLINKER_BASE_URL;
const BUCKET_UID = process.env.NEUROLINKER_TEST_BUCKET_UID;

const FAKE_UID = "00000000-0000-0000-0000-000000000000";

describe("smoke — auth + routing across all modules", () => {
  it.skipIf(!TOKEN)(
    "extraction.status.request(<fake uid>) returns 404 via NeuroLinkerAPIError",
    async () => {
      const client = NeuroLinker.fromEnv();
      let caught: NeuroLinkerAPIError | undefined;
      try {
        await client.extraction.status.request(FAKE_UID);
      } catch (e) {
        if (e instanceof NeuroLinkerAPIError) caught = e;
        else throw e;
      }
      expect(caught).toBeDefined();
      expect(caught!.statusCode).toBe(404);
    },
  );

  it.skipIf(!TOKEN || !BUCKET_UID)(
    "chunking.jobs.get(<fake uid>) returns 404 via NeuroLinkerAPIError",
    async () => {
      const client = NeuroLinker.fromEnv();
      let caught: NeuroLinkerAPIError | undefined;
      try {
        await client.chunking.jobs.get(BUCKET_UID!, FAKE_UID);
      } catch (e) {
        if (e instanceof NeuroLinkerAPIError) caught = e;
        else throw e;
      }
      expect(caught).toBeDefined();
      expect(caught!.statusCode).toBe(404);
    },
  );

  it.skipIf(!TOKEN || !BUCKET_UID)(
    "embedding.jobs.get(<fake uid>) returns 404 via NeuroLinkerAPIError",
    async () => {
      const client = NeuroLinker.fromEnv();
      let caught: NeuroLinkerAPIError | undefined;
      try {
        await client.embedding.jobs.get(BUCKET_UID!, FAKE_UID);
      } catch (e) {
        if (e instanceof NeuroLinkerAPIError) caught = e;
        else throw e;
      }
      expect(caught).toBeDefined();
      expect(caught!.statusCode).toBe(404);
    },
  );

  it.skipIf(!TOKEN || !BUCKET_UID)(
    "vectorStore.jobs.get(<fake uid>) returns 404 via NeuroLinkerAPIError",
    async () => {
      const client = NeuroLinker.fromEnv();
      let caught: NeuroLinkerAPIError | undefined;
      try {
        await client.vectorStore.jobs.get(BUCKET_UID!, FAKE_UID);
      } catch (e) {
        if (e instanceof NeuroLinkerAPIError) caught = e;
        else throw e;
      }
      expect(caught).toBeDefined();
      expect(caught!.statusCode).toBe(404);
    },
  );

  it.skipIf(!TOKEN)(
    "management.buckets.get(<fake uid>) returns 404 via NeuroLinkerAPIError",
    async () => {
      const client = NeuroLinker.fromEnv();
      let caught: NeuroLinkerAPIError | undefined;
      try {
        await client.management.buckets.get(FAKE_UID);
      } catch (e) {
        if (e instanceof NeuroLinkerAPIError) caught = e;
        else throw e;
      }
      expect(caught).toBeDefined();
      expect(caught!.statusCode).toBe(404);
    },
  );
});

describe("smoke — auth error on invalid token", () => {
  // No TOKEN gating on purpose — we use a hard-coded bad token. We DO need a
  // base URL so the request can actually leave the SDK; pull it from env or
  // fall back to the default.
  const baseUrl = BASE_URL || "https://neurolinker.api.ainexxo.com";

  it("invalid token → NeuroLinkerAPIError on a cheap endpoint", async () => {
    const client = new NeuroLinker({ token: "nl_invalid", baseUrl, timeoutS: 30 });
    let caught: NeuroLinkerAPIError | undefined;
    try {
      await client.extraction.listTasks();
    } catch (e) {
      if (e instanceof NeuroLinkerAPIError) caught = e;
      else throw e;
    }
    expect(caught).toBeDefined();
    // Most stacks return 401/403 for bad auth; either is fine.
    expect([401, 403]).toContain(caught!.statusCode);
  });
});
