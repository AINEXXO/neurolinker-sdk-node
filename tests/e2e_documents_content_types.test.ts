import { describe, expect, it } from "vitest";
import { NeuroLinker } from "../src/client.js";
import { ContentType } from "../src/resources/documents.js";

const TOKEN = process.env.NEUROLINKER_API_KEY;
const PDF_URL = process.env.NEUROLINKER_TEST_PDF_URL;

describe("e2e documents content_types", () => {
  it.skipIf(!TOKEN || !PDF_URL)("accepts content_types filter for markdown/json", async () => {
    const client = NeuroLinker.fromEnv();

    const extractResp = await client.extract.extract({ urls: [PDF_URL!], alias: "sdk-e2e-content-types" });
    const requestUid = NeuroLinker.extractRequestUid(extractResp as any);

    const statusResp = await client.waitForRequestCompletion({ requestUid });
    const docIds = NeuroLinker.extractDocumentIds(statusResp as any);
    expect(docIds.length).toBeGreaterThan(0);

    for (const ct of [ContentType.TEXT, ContentType.FORMULA, ContentType.TABLES, ContentType.IMAGES]) {
      const md = await client.documents.markdown(docIds, { contentTypes: [ct] });
      expect((md as any).success).toBe(true);
      expect(Array.isArray((md as any).results)).toBe(true);

      const js = await client.documents.json(docIds, { contentTypes: [ct] });
      expect((js as any).success).toBe(true);
      expect(Array.isArray((js as any).results)).toBe(true);
    }
  });
});