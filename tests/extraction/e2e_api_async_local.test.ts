import { describe, expect, it } from "vitest";
import {
  assertDocumentsResultsSchema,
  buildClientFromEnv,
  extractRequestUid,
  extractDocumentIdsFromRequestStatus,
  TOKEN,
  getPdfPaths,
  readDocumentsFromDisk,
} from "../e2e_helpers.js";

describe("e2e local pdfs (upload mode)", () => {
  const pdfPaths = getPdfPaths();

  it.skipIf(!TOKEN || pdfPaths.length === 0)("uploads local PDFs and runs the flow", async () => {
    const client = buildClientFromEnv();
    const documents = await readDocumentsFromDisk(pdfPaths);

    const tasks = await client.extraction.listTasks();
    expect(typeof tasks).toBe("object");
    expect((tasks as any).success).toBeDefined();

    const extractResp = await client.extraction.extract({
      documents,
      alias: undefined,
    });
    const requestUid = extractRequestUid(extractResp);

    const statusResp = await client.extraction.waitForRequest(requestUid);
    const docIds = extractDocumentIdsFromRequestStatus(statusResp);
    expect(docIds.length).toBeGreaterThan(0);

    const docStatus = await client.extraction.status.document(docIds[0]);
    expect(typeof docStatus).toBe("object");
    expect((docStatus as any).success).toBeDefined();

    const resJson = await client.extraction.documents.json(docIds);
    assertDocumentsResultsSchema(resJson);

    const resMd = await client.extraction.documents.markdown(docIds);
    assertDocumentsResultsSchema(resMd);

    const resSum = await client.extraction.documents.documentSummary(docIds, {
      summaryType: "page",
    });
    assertDocumentsResultsSchema(resSum);

    const resPages = await client.extraction.documents.pageSummaries(docIds);
    assertDocumentsResultsSchema(resPages);

    const resImages = await client.extraction.documents.images(docIds);
    assertDocumentsResultsSchema(resImages);
  });
});
