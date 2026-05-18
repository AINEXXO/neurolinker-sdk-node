import { describe, expect, it } from "vitest";
import { NeuroLinker } from "../src/index.js";
import {
  DEFAULT_POLL_INTERVAL_S,
  DEFAULT_POLL_MAX_INTERVAL_S,
  DEFAULT_TIMEOUT_S,
} from "../src/config.js";

// Reflection helper: TypeScript private fields are erased at runtime, so we
// can reach into module/resource state in tests with an explicit cast.
function getPollFields(obj: unknown): {
  timeoutS: number;
  pollIntervalS: number;
  pollMaxIntervalS: number;
} {
  return obj as {
    timeoutS: number;
    pollIntervalS: number;
    pollMaxIntervalS: number;
  };
}

describe("client construction — module surface", () => {
  it("client exposes all 5 modules", () => {
    const client = new NeuroLinker({ token: "nl_dummy", timeoutS: 1.0 });
    expect(client.extraction).toBeDefined();
    expect(client.chunking).toBeDefined();
    expect(client.embedding).toBeDefined();
    expect(client.management).toBeDefined();
    expect(client.vectorStore).toBeDefined();
  });

  it("each module exposes its expected sub-resources", () => {
    const client = new NeuroLinker({ token: "nl_dummy", timeoutS: 1.0 });

    // extraction
    expect(client.extraction.status).toBeDefined();
    expect(client.extraction.documents).toBeDefined();

    // chunking
    expect(client.chunking.jobs).toBeDefined();

    // embedding
    expect(client.embedding.jobs).toBeDefined();

    // management
    expect(client.management.buckets).toBeDefined();
    // vectorStore
    expect(client.vectorStore.collections).toBeDefined();
    expect(client.vectorStore.jobs).toBeDefined();
  });
});

describe("client construction — default poll params propagation", () => {
  it("default poll params reach all polling-capable modules", () => {
    const client = new NeuroLinker({ token: "nl_dummy" });

    // extraction module owns poll params directly
    const ex = getPollFields(client.extraction);
    expect(ex.timeoutS).toBe(DEFAULT_TIMEOUT_S);
    expect(ex.pollIntervalS).toBe(DEFAULT_POLL_INTERVAL_S);
    expect(ex.pollMaxIntervalS).toBe(DEFAULT_POLL_MAX_INTERVAL_S);

    // JobsResource of chunking / embedding / vectorStore each carry poll params
    for (const jobs of [
      client.chunking.jobs,
      client.embedding.jobs,
      client.vectorStore.jobs,
    ]) {
      const j = getPollFields(jobs);
      expect(j.timeoutS).toBe(DEFAULT_TIMEOUT_S);
      expect(j.pollIntervalS).toBe(DEFAULT_POLL_INTERVAL_S);
      expect(j.pollMaxIntervalS).toBe(DEFAULT_POLL_MAX_INTERVAL_S);
    }
  });

  it("explicit poll params override defaults across all modules", () => {
    const client = new NeuroLinker({
      token: "nl_dummy",
      timeoutS: 999,
      pollIntervalS: 7,
      pollMaxIntervalS: 17,
    });

    const ex = getPollFields(client.extraction);
    expect(ex.timeoutS).toBe(999);
    expect(ex.pollIntervalS).toBe(7);
    expect(ex.pollMaxIntervalS).toBe(17);

    for (const jobs of [
      client.chunking.jobs,
      client.embedding.jobs,
      client.vectorStore.jobs,
    ]) {
      const j = getPollFields(jobs);
      expect(j.timeoutS).toBe(999);
      expect(j.pollIntervalS).toBe(7);
      expect(j.pollMaxIntervalS).toBe(17);
    }
  });

  it("management module receives only timeout (no polling)", () => {
    // Management does not own polling — buckets are simple CRUD. We only
    // need to verify it's wired with a timeout, which is sufficient to make the
    // single ConfigMap propagation test stable.
    const client = new NeuroLinker({ token: "nl_dummy", timeoutS: 42 });
    const buckets = client.management.buckets as unknown as { timeoutS: number };
    expect(buckets.timeoutS).toBe(42);
  });
});
