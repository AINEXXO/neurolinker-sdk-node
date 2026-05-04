import { describe, expect, it } from "vitest";
import {
  buildClientFromEnv,
  extractRequestUid,
  extractDocumentIdsFromRequestStatus,
  TOKEN,
  PDF_URL,
} from "../e2e_helpers.js";

describe("e2e minimal sdk usage", () => {
  it.skipIf(!TOKEN || !PDF_URL)("runs a minimal end-to-end flow", async () => {
    const client = buildClientFromEnv();

    const extractResp = await client.extraction.extract({
      urls: [PDF_URL!],
      alias: "sdk-minimal-e2e",
    });
    const requestUid = extractRequestUid(extractResp);

    const statusResp = await client.extraction.waitForRequest(requestUid);
    const documentIds = extractDocumentIdsFromRequestStatus(statusResp);
    expect(documentIds.length).toBeGreaterThan(0);

    const docsJson = await client.extraction.documents.json(documentIds);
    expect((docsJson as any).success).toBe(true);
    expect(Array.isArray((docsJson as any).results)).toBe(true);
  });
});
