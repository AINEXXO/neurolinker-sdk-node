// tests/test_wrapper_tasks_async.test.ts
import { describe, expect, it } from "vitest";
import { NeuroLinker } from "../src/client.js";

const TOKEN = process.env.NEUROLINKER_API_KEY;

describe("wrapper tasks (async)", () => {
  it.skipIf(!TOKEN)("list uses default base url when missing", async () => {
    const prevBaseUrl = process.env.NEUROLINKER_BASE_URL;
    delete process.env.NEUROLINKER_BASE_URL;

    try {
      const client = NeuroLinker.fromEnv();
      const data = await client.tasks.list();

      expect(data).toBeTruthy();
    } finally {
      if (prevBaseUrl) process.env.NEUROLINKER_BASE_URL = prevBaseUrl;
    }
  });
});