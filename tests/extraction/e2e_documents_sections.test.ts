import { describe, it } from "vitest";
import {
  assertDocumentsResultsSchema,
  buildClientFromEnv,
  extractRequestUid,
  extractDocumentIdsFromRequestStatus,
  TOKEN,
  PDF_URL,
} from "../e2e_helpers.js";

describe("e2e documents summary endpoints", () => {
  it.skipIf(!TOKEN || !PDF_URL)(
    "validates page/section summaries and document_summary requires summary_type",
    async () => {
      const client = buildClientFromEnv();

      const extractResp = await client.extraction.extract({
        urls: [PDF_URL!],
        alias: "sdk-e2e-doc-summaries",
      });
      const requestUid = extractRequestUid(extractResp);

      const statusResp = await client.extraction.waitForRequest(requestUid);
      const docIds = extractDocumentIdsFromRequestStatus(statusResp);
      if (!docIds.length)
        throw new Error(
          `Expected at least one document id in status: ${JSON.stringify(statusResp)}`,
        );

      const resPageSummaries = await client.extraction.documents.pageSummaries(docIds);
      assertDocumentsResultsSchema(resPageSummaries);

      const resDocumentSummaryPage = await client.extraction.documents.documentSummary(docIds, {
        summaryType: "page",
      });
      assertDocumentsResultsSchema(resDocumentSummaryPage);

      const resSectionSummaries = await client.extraction.documents.sectionSummaries(docIds);
      assertDocumentsResultsSchema(resSectionSummaries);

      const resDocumentSummarySection = await client.extraction.documents.documentSummary(docIds, {
        summaryType: "section",
      });
      assertDocumentsResultsSchema(resDocumentSummarySection);
    },
  );
});
