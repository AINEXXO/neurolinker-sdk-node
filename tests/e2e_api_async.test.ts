import { describe, expect, it } from "vitest";
import {
  assertDocumentsResultsSchema,
  buildClientFromEnv,
  extractRequestUid,
  extractDocumentIdsFromRequestStatus,
  TOKEN,
  PDF_URL,
} from "./e2e_helpers.js";

describe("e2e all public endpoints (url mode)", () => {
  it.skipIf(!TOKEN || !PDF_URL)("covers tasks/extract/status/documents endpoints", async () => {
    const client = buildClientFromEnv();

    const tasks = await client.tasks.list();
    expect(typeof tasks).toBe("object");
    expect((tasks as any).success).toBeDefined();

    const extractResp = await client.extract.extract({
      urls: [PDF_URL!],
      alias: "sdk-e2e-test-async",
      description: "Description for sdk-e2e-test-async",
    });
    const requestUid = extractRequestUid(extractResp);

    const statusResp = await client.waitForRequestCompletion({ requestUid });
    const docIds = extractDocumentIdsFromRequestStatus(statusResp);
    expect(docIds.length).toBeGreaterThan(0);

    const docStatus = await client.status.document(docIds[0]);
    expect(typeof docStatus).toBe("object");
    expect((docStatus as any).success).toBeDefined();

    const resJson = await client.documents.json(docIds);
    assertDocumentsResultsSchema(resJson);

    const resMd = await client.documents.markdown(docIds);
    assertDocumentsResultsSchema(resMd);

    const resSum = await client.documents.documentSummary(docIds, { summaryType: "page" });
    assertDocumentsResultsSchema(resSum);

    const resPages = await client.documents.pageSummaries(docIds);
    assertDocumentsResultsSchema(resPages);

    const resImages = await client.documents.images(docIds);
    assertDocumentsResultsSchema(resImages);
  });
});