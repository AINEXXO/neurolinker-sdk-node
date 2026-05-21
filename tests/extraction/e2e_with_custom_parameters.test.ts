import { describe, expect, it } from "vitest";
import { NeuroLinker, ContentType } from "../../src/index.js";
import {
  TOKEN,
  PDF_URL,
  extractRequestUid,
  extractDocumentIdsFromRequestStatus,
} from "../e2e_helpers.js";

describe("e2e with explicit client parameters", () => {
  it.skipIf(!TOKEN || !PDF_URL)("overrides timeout/polling and uses optional params", async () => {
    const client = new NeuroLinker({
      token: TOKEN!,
      timeoutS: 900.0,
      pollIntervalS: 1.0,
      pollMaxIntervalS: 6.0,
    });

    const extractResp = await client.extraction.extract({
      urls: [PDF_URL!],
      alias: "sdk-custom-params",
      description: "E2E test for explicit client parameters",
    });
    const requestUid = extractRequestUid(extractResp);

    const statusResp = await client.extraction.waitForRequest(requestUid, {
      timeoutS: 600.0,
      pollIntervalS: 1.5,
      pollMaxIntervalS: 8.0,
    });

    const documentIds = extractDocumentIdsFromRequestStatus(statusResp);
    expect(documentIds.length).toBeGreaterThan(0);

    const markdown = await client.extraction.documents.markdown(documentIds, {
      contentTypes: [ContentType.TEXT],
    });
    expect((markdown as any).success).toBe(true);
    expect(Array.isArray((markdown as any).results)).toBe(true);
  });
});
