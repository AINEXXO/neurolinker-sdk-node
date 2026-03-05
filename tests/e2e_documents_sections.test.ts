import { describe, it } from "vitest";
import {
  assertDocumentsResultsSchema,
  buildClientFromEnv,
  extractRequestUid,
  extractDocumentIdsFromRequestStatus,
  TOKEN,
  PDF_URL,
} from "./e2e_helpers.js";

describe("e2e documents summary endpoints", () => {
  it.skipIf(!TOKEN || !PDF_URL)("validates page/section summaries and document_summary requires summary_type", async () => {
    const client = buildClientFromEnv();

    const extractResp = await client.extract.extract({
      urls: [PDF_URL!],
      alias: "sdk-e2e-doc-summaries",
    });
    const requestUid = extractRequestUid(extractResp);

    const statusResp = await client.waitForRequestCompletion({ requestUid });
    const docIds = extractDocumentIdsFromRequestStatus(statusResp);
    if (!docIds.length) throw new Error(`Expected at least one document id in status: ${JSON.stringify(statusResp)}`);

    const resPageSummaries = await client.documents.pageSummaries(docIds);
    assertDocumentsResultsSchema(resPageSummaries);

    const resDocumentSummaryPage = await client.documents.documentSummary(docIds, { summaryType: "page" });
    assertDocumentsResultsSchema(resDocumentSummaryPage);

    const resSectionSummaries = await client.documents.sectionSummaries(docIds);
    assertDocumentsResultsSchema(resSectionSummaries);

    const resDocumentSummarySection = await client.documents.documentSummary(docIds, { summaryType: "section" });
    assertDocumentsResultsSchema(resDocumentSummarySection);
  });
});