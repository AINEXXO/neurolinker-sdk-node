import { describe, expect, it } from "vitest";
import { NeuroLinker } from "../src/client.js";
import { TOKEN, PDF_URL, extractRequestUid, extractDocumentIdsFromRequestStatus } from "./e2e_helpers.js";

describe("e2e without fromEnv", () => {
  it.skipIf(!TOKEN || !PDF_URL)("works with token only and default base_url", async () => {
    const client = new NeuroLinker({ token: TOKEN! });

    const extractResp = await client.extract.extract({
      urls: [PDF_URL!],
      alias: "sdk-no-from-env",
    });
    const requestUid = extractRequestUid(extractResp);

    const statusResp = await client.waitForRequestCompletion({ requestUid });
    const documentIds = extractDocumentIdsFromRequestStatus(statusResp);
    expect(documentIds.length).toBeGreaterThan(0);

    const result = await client.documents.documentSummary(documentIds, { summaryType: "page" });
    expect(result.success).toBe(true);
    expect(Array.isArray(result.results)).toBe(true);
  });
});