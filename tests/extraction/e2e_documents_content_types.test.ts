import { describe, it } from "vitest";
import { ContentType } from "../../src/index.js";
import {
  assertDocumentsResultsSchema,
  buildClientFromEnv,
  extractRequestUid,
  extractDocumentIdsFromRequestStatus,
  TOKEN,
  PDF_URL,
} from "../e2e_helpers.js";

describe("e2e documents content_types", () => {
  it.skipIf(!TOKEN || !PDF_URL)("accepts content_types filter for markdown/json", async () => {
    const client = buildClientFromEnv();

    const extractResp = await client.extraction.extract({
      urls: [PDF_URL!],
      alias: "sdk-e2e-content-types-async",
    });
    const requestUid = extractRequestUid(extractResp);

    const statusResp = await client.extraction.waitForRequest(requestUid);
    const docIds = extractDocumentIdsFromRequestStatus(statusResp);

    if (!docIds.length)
      throw new Error(`Expected at least one document id in status: ${JSON.stringify(statusResp)}`);

    for (const ct of [
      ContentType.TEXT,
      ContentType.FORMULA,
      ContentType.TABLES,
      ContentType.IMAGES,
    ]) {
      const md = await client.extraction.documents.markdown(docIds, { contentTypes: [ct] });
      assertDocumentsResultsSchema(md);

      const js = await client.extraction.documents.json(docIds, { contentTypes: [ct] });
      assertDocumentsResultsSchema(js);
    }
  });
});
