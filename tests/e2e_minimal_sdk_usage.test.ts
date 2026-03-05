import { describe, expect, it } from "vitest";
import { buildClientFromEnv, extractRequestUid, extractDocumentIdsFromRequestStatus, TOKEN, PDF_URL } from "./e2e_helpers.js";

describe("e2e minimal sdk usage", () => {
  it.skipIf(!TOKEN || !PDF_URL)("runs a minimal end-to-end flow", async () => {
    const client = buildClientFromEnv();

    const extractResp = await client.extract.extract({ urls: [PDF_URL!], alias: "sdk-minimal-e2e" });
    const requestUid = extractRequestUid(extractResp);

    const statusResp = await client.waitForRequestCompletion({ requestUid });
    const documentIds = extractDocumentIdsFromRequestStatus(statusResp);
    expect(documentIds.length).toBeGreaterThan(0);

    const docsJson = await client.documents.json(documentIds);
    expect(docsJson.success).toBe(true);
    expect(Array.isArray(docsJson.results)).toBe(true);
  });
});