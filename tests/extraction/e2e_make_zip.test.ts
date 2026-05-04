import { describe, expect, it } from "vitest";
import {
  buildClientFromEnv,
  extractRequestUid,
  extractDocumentIdsFromRequestStatus,
  TOKEN,
  PDF_URL,
} from "../e2e_helpers.js";

describe("e2e make-zip", () => {
  it.skipIf(!TOKEN || !PDF_URL)("creates zip urls for job and single document", async () => {
    const client = buildClientFromEnv();

    const extractResp = await client.extraction.extract({
      urls: [PDF_URL!],
      alias: "sdk-e2e-makezip-async",
    });
    const requestUid = extractRequestUid(extractResp);

    const statusResp = await client.extraction.waitForRequest(requestUid);
    const docIds = extractDocumentIdsFromRequestStatus(statusResp);
    expect(docIds.length).toBeGreaterThan(0);

    const jobZip = await client.extraction.makeZip({ jobUid: requestUid, localImages: true });
    expect((jobZip as any).success).toBe(true);
    expect(typeof (jobZip as any).url).toBe("string");
    expect(String((jobZip as any).url).startsWith("http")).toBe(true);
    console.log(`[ASYNC] Job ZIP URL: ${(jobZip as any).url}`);

    const docZip = await client.extraction.makeZip({
      jobUid: requestUid,
      documentUid: docIds[0],
      contentTypes: ["text"],
    });
    expect((docZip as any).success).toBe(true);
    expect(typeof (docZip as any).url).toBe("string");
    expect(String((docZip as any).url).startsWith("http")).toBe(true);
    console.log(`[ASYNC] Document ZIP URL (document_id=${docIds[0]}): ${(docZip as any).url}`);
  });
});
