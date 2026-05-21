import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  NeuroLinker,
  extractDocumentIds,
  extractRequestUid,
  type CollectionSchemaInput,
  type ContentInput,
  type FieldMappingInput,
  type VectorDBConfigInput,
} from "../src/index.js";
import { waitForTerminalStatus } from "../src/polling.js";

const TOKEN = process.env.NEUROLINKER_API_KEY;
const PDF_URL = process.env.NEUROLINKER_TEST_PDF_URL;
const VECTOR_DB_URI = process.env.NEUROLINKER_TEST_VECTOR_DB_URI;
const VECTOR_DB_API_KEY = process.env.NEUROLINKER_TEST_VECTOR_DB_API_KEY;
const VECTOR_DIM = Number(process.env.NEUROLINKER_TEST_VECTOR_DIM || "1024");

const RUN = !!(TOKEN && PDF_URL && VECTOR_DB_URI && VECTOR_DB_API_KEY);

const STRICT_TERMINAL = new Set(["completed", "failed"]);

// Fixed collection name — re-runs are idempotent on the vector DB side
// (POST /collections returns ``already_existed=true``). Avoids accumulating
// test collections on managed clusters with low limits (e.g. Zilliz free tier).
const COLLECTION_NAME = "sdk_full_e2e_stable";

interface BackendModel {
  name: string;
  vector_types?: string[];
}

async function pickTextDenseModel(client: NeuroLinker): Promise<BackendModel> {
  const payload = await client.embedding.listModels();
  const models = (payload as Record<string, unknown>).models as BackendModel[] | undefined;
  if (!Array.isArray(models) || models.length === 0) {
    throw new Error(`No internal embedding models returned: ${JSON.stringify(payload)}`);
  }
  const found = models.find((m) => (m.vector_types ?? []).includes("dense"));
  if (!found) {
    throw new Error(`No model with 'dense' vector_types in: ${JSON.stringify(models)}`);
  }
  return found;
}

describe("e2e full pipeline — extraction → bucket → chunking → embedding → vector_store", () => {
  it.skipIf(!RUN)(
    "runs every module in sequence and verifies each step completes",
    { timeout: 1_800_000 },
    async () => {
      const client = NeuroLinker.fromEnv();
      const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
      const bucketName = `sdk-full-e2e-${suffix}`;
      let bucketUid: string | undefined;

      try {
        // -----------------------------------------------------------------
        // 0) Extract a PDF
        // -----------------------------------------------------------------
        const submit = await client.extraction.extract({
          urls: [PDF_URL!],
          alias: "sdk-full-e2e",
        });
        const requestUid = extractRequestUid(submit);
        expect(typeof requestUid).toBe("string");
        expect(requestUid.length).toBeGreaterThan(0);
        console.log(`[full e2e] extraction request ${requestUid} submitted`);

        const extractFinal = await client.extraction.waitForRequest(requestUid);
        expect((extractFinal as any).status ?? (extractFinal as any).data?.status).toBe(
          "completed",
        );
        const docUids = extractDocumentIds(extractFinal);
        expect(docUids.length).toBeGreaterThan(0);
        console.log(`[full e2e] extraction completed → ${docUids.length} doc(s)`);

        // -----------------------------------------------------------------
        // 1) Bucket — create then link the extraction request
        // -----------------------------------------------------------------
        const created = await client.management.buckets.create({ name: bucketName });
        bucketUid = (created as Record<string, unknown>).bucket_uid as string;
        expect(typeof bucketUid).toBe("string");
        expect(bucketUid.length).toBeGreaterThan(0);

        await client.management.buckets.addSources(bucketUid, {
          sources: [{ requestUid, docUids }],
        });
        console.log(`[full e2e] bucket ${bucketUid} created + sources attached`);

        // -----------------------------------------------------------------
        // 2) Chunking — strict completed
        // -----------------------------------------------------------------
        const chunkSubmit = await client.chunking.jobs.create({
          bucketUid,
          chunking: { method: "section_greedy", tMin: 100, tMax: 512 },
        });
        const chunkJobUid = (chunkSubmit as Record<string, unknown>).job_uid as string;
        expect(typeof chunkJobUid).toBe("string");

        const chunkFinal = await waitForTerminalStatus<Record<string, unknown>>({
          fetchStatus: () => client.chunking.jobs.get(bucketUid, chunkJobUid),
          extractStatus: (r) => {
            const s = (r as Record<string, unknown>).status;
            return typeof s === "string" ? s : undefined;
          },
          timeoutS: 540,
          pollIntervalS: 2,
          pollMaxIntervalS: 10,
          terminalStates: STRICT_TERMINAL,
          identifier: `chunking job ${chunkJobUid}`,
        });
        expect((chunkFinal as any).status).toBe("completed");
        console.log(`[full e2e] chunking ${chunkJobUid} completed`);

        // -----------------------------------------------------------------
        // 3) Embedding — internal text-dense model (no BYOK key)
        // -----------------------------------------------------------------
        const model = await pickTextDenseModel(client);
        const embeddings: ContentInput[] = [
          {
            contentType: "text",
            inputs: ["content"],
            vectors: [
              {
                vectorType: "dense",
                fieldName: "text_dense_e2e",
                modelName: model.name,
              },
            ],
          },
        ];

        const embedSubmit = await client.embedding.jobs.create({
          bucketUid,
          embeddings,
        });
        const embedJobUid = (embedSubmit as Record<string, unknown>).job_uid as string;
        expect(typeof embedJobUid).toBe("string");

        const embedFinal = await waitForTerminalStatus<Record<string, unknown>>({
          fetchStatus: () => client.embedding.jobs.get(bucketUid, embedJobUid),
          extractStatus: (r) => {
            const s = (r as Record<string, unknown>).status;
            return typeof s === "string" ? s : undefined;
          },
          timeoutS: 1100,
          pollIntervalS: 2,
          pollMaxIntervalS: 10,
          terminalStates: STRICT_TERMINAL,
          identifier: `embedding job ${embedJobUid}`,
        });
        expect((embedFinal as any).status).toBe("completed");
        console.log(`[full e2e] embedding ${embedJobUid} completed`);

        // -----------------------------------------------------------------
        // 4) Vector store — create collection (idempotent) + load job
        // -----------------------------------------------------------------
        const collection: CollectionSchemaInput = {
          name: COLLECTION_NAME,
          description: "Cross-module SDK E2E test collection",
          fields: [
            { name: "chunk_id", dtype: "text", isPrimary: true },
            { name: "content", dtype: "text" },
            { name: "text_dense", dtype: "dense_vector", dim: VECTOR_DIM },
          ],
        };
        const vdb: VectorDBConfigInput = { uri: VECTOR_DB_URI!, apiKey: VECTOR_DB_API_KEY! };

        const createResp = await client.vectorStore.collections.create({
          collection,
          vectorDbConfig: vdb,
        });
        expect((createResp as any).success).toBe(true);

        const fieldMappings: FieldMappingInput[] = [
          { name: "chunk_id", source: "item_id" },
          { name: "content", source: "item_content" },
          { name: "text_dense", source: "text_dense_e2e" },
        ];
        const loadSubmit = await client.vectorStore.jobs.create({
          bucketUid,
          collectionName: COLLECTION_NAME,
          fieldMappings,
          vectorDbConfig: vdb,
        });
        const loadJobUid = (loadSubmit as Record<string, unknown>).job_uid as string;
        expect(typeof loadJobUid).toBe("string");

        const loadFinal = await waitForTerminalStatus<Record<string, unknown>>({
          fetchStatus: () => client.vectorStore.jobs.get(bucketUid, loadJobUid),
          extractStatus: (r) => {
            const s = (r as Record<string, unknown>).status;
            return typeof s === "string" ? s : undefined;
          },
          timeoutS: 1100,
          pollIntervalS: 2,
          pollMaxIntervalS: 10,
          terminalStates: STRICT_TERMINAL,
          identifier: `vector-load job ${loadJobUid}`,
        });
        expect((loadFinal as any).status).toBe("completed");
        expect((loadFinal as any).collection_name).toBe(COLLECTION_NAME);
        console.log(`[full e2e] vector load ${loadJobUid} completed`);
      } finally {
        // Best-effort cleanup — never raise from teardown.
        if (bucketUid) {
          try {
            await client.management.buckets.delete(bucketUid);
            console.log(`[full e2e cleanup] bucket ${bucketUid} deleted`);
          } catch (e) {
            console.warn(`[full e2e cleanup] delete bucket ${bucketUid}:`, e);
          }
        }
      }
    },
  );
});
