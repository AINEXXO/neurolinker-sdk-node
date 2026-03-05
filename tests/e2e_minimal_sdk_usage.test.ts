import { describe, expect, it } from "vitest";
import { NeuroLinker } from "../src/client.js";

const TOKEN = process.env.NEUROLINKER_API_KEY;
const PDF_URL = process.env.NEUROLINKER_TEST_PDF_URL;

describe("e2e minimal sdk usage", () => {
  it.skipIf(!TOKEN || !PDF_URL)("runs a minimal end-to-end flow", async () => {
    const client = NeuroLinker.fromEnv();

    const extractResp = await client.extract.extract({ urls: [PDF_URL!], alias: "sdk-minimal-e2e" });
    const requestUid = NeuroLinker.extractRequestUid(extractResp as any);

    const statusResp = await client.waitForRequestCompletion({ requestUid });
    const documentIds = NeuroLinker.extractDocumentIds(statusResp as any);
    expect(documentIds.length).toBeGreaterThan(0);

    const docsJson = await client.documents.json(documentIds);
    expect((docsJson as any).success).toBe(true);
    expect(Array.isArray((docsJson as any).results)).toBe(true);
  });
});