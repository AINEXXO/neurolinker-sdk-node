import { describe, expect, it } from "vitest";
import { NeuroLinker } from "../src/client.js";

const TOKEN = process.env.NEUROLINKER_API_KEY;
const PDF_URL = process.env.NEUROLINKER_TEST_PDF_URL;

describe("e2e make-zip", () => {
  it.skipIf(!TOKEN || !PDF_URL)("creates zip urls for job and single document", async () => {
    const client = NeuroLinker.fromEnv({ timeoutS: Number(process.env.NEUROLINKER_E2E_TIMEOUT_S || 600) });

    const extractResp = await client.extract.extract({ urls: [PDF_URL!], alias: "sdk-e2e-makezip" });
    const requestUid = NeuroLinker.extractRequestUid(extractResp as any);

    const statusResp = await client.waitForRequestCompletion({ requestUid });
    const docIds = NeuroLinker.extractDocumentIds(statusResp as any);
    expect(docIds.length).toBeGreaterThan(0);

    const jobZip = await client.zip.makeZip({ jobUid: requestUid, localImages: true });
    expect((jobZip as any).success).toBe(true);
    expect(typeof (jobZip as any).url).toBe("string");
    expect((jobZip as any).url.startsWith("http")).toBe(true);
    console.log(`[JOB ZIP] ${String((jobZip as any).url)}`);

    const docZip = await client.zip.makeZip({ jobUid: requestUid, documentUid: docIds[0], contentTypes: ["text"] });
    expect((docZip as any).success).toBe(true);
    expect(typeof (docZip as any).url).toBe("string");
    expect((docZip as any).url.startsWith("http")).toBe(true);
    console.log(`[DOC ZIP] doc_id=${docIds[0]} url=${String((docZip as any).url)}`);
  });
});