import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  NeuroLinker,
  extractRequestUid,
  extractDocumentIds,
} from "../../src/index.js";
import { DEFAULT_BASE_URL } from "../../src/config.js";

describe("client helpers", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: any) => {
      const url = typeof input === "string" ? input : input.url;
      return new Response(JSON.stringify({ success: true, url }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("uses default base url when not provided", async () => {
    const client = new NeuroLinker({ token: "nl_dummy", timeoutS: 1 });
    const payload = await client.extraction.listTasks();
    expect((payload as any).success).toBe(true);
    expect((payload as any).url).toBe(`${DEFAULT_BASE_URL}/v1/tasks`);
  });

  it("extractRequestUid accepts top-level or nested data", () => {
    expect(extractRequestUid({ request_uid: "req-top" })).toBe("req-top");
    expect(extractRequestUid({ data: { request_uid: "req-data" } })).toBe("req-data");
  });

  it("extractDocumentIds accepts document_id or id", () => {
    const top = { documents: [{ document_id: "doc-1" }, { id: "doc-2" }] };
    const nested = { data: { documents: [{ document_id: "doc-3" }, { id: "doc-4" }] } };
    expect(extractDocumentIds(top)).toEqual(["doc-1", "doc-2"]);
    expect(extractDocumentIds(nested)).toEqual(["doc-3", "doc-4"]);
  });
});
