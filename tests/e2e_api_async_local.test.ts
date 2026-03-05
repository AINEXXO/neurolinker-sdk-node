import { describe, expect, it } from "vitest";
import {
  assertDocumentsResultsSchema,
  buildClientFromEnv,
  extractRequestUid,
  extractDocumentIdsFromRequestStatus,
  TOKEN,
  getPdfPaths,
  readDocumentsFromDisk,
} from "./e2e_helpers.js";

describe("e2e local pdfs (upload mode)", () => {
  const pdfPaths = getPdfPaths();

  it.skipIf(!TOKEN || pdfPaths.length === 0)("uploads local PDFs and runs the flow", async () => {
    const client = buildClientFromEnv();
    const documents = await readDocumentsFromDisk(pdfPaths);

    const tasks = await client.tasks.list();
    expect(typeof tasks).toBe("object");
    expect((tasks as any).success).toBeDefined();

    const extractResp = await client.extract.extract({
      documents,
      alias: null as any, // matches Python local test behavior
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