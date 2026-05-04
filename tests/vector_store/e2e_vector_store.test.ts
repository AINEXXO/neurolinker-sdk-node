import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  NeuroLinker,
  type CollectionSchemaInput,
  type FieldMappingInput,
  type VectorDBConfigInput,
} from "../../src/index.js";
import { waitForTerminalStatus } from "../../src/polling.js";

const TOKEN = process.env.NEUROLINKER_API_KEY;
const BUCKET_UID = process.env.NEUROLINKER_TEST_BUCKET_UID;
const VECTOR_DB_URI = process.env.NEUROLINKER_TEST_VECTOR_DB_URI;
const VECTOR_DB_API_KEY = process.env.NEUROLINKER_TEST_VECTOR_DB_API_KEY;
const VECTOR_DIM = Number(process.env.NEUROLINKER_TEST_VECTOR_DIM || "1024");

const RUN = !!(TOKEN && BUCKET_UID && VECTOR_DB_URI && VECTOR_DB_API_KEY);

const COLLECTION_NAME = "sdk_e2e_stable";

function buildCollection(name: string): CollectionSchemaInput {
  return {
    name,
    description: "SDK E2E test collection",
    fields: [
      { name: "chunk_id", dtype: "text", isPrimary: true },
      { name: "content", dtype: "text" },
      { name: "text_dense", dtype: "dense_vector", dim: VECTOR_DIM },
    ],
  };
}

function buildVdbConfig(secretId: string): VectorDBConfigInput {
  return { uri: VECTOR_DB_URI!, secretId };
}

function buildFieldMappings(): FieldMappingInput[] {
  return [
    { name: "chunk_id", source: "item_id" },
    { name: "content", source: "item_content" },
    { name: "text_dense", source: "text_dense_e2e" },
  ];
}

describe("e2e vector_store — full flow", () => {
  let client: NeuroLinker | undefined;
  let vdbSecretId: string | undefined;

  beforeAll(async () => {
    if (!RUN) return;
    client = NeuroLinker.fromEnv();
    const secretName = `sdk_e2e_vdb_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const created = await client.management.secrets.create({
      name: secretName,
      value: VECTOR_DB_API_KEY!,
    });
    const id = (created as Record<string, unknown>).secret_id as string;
    if (typeof id !== "string" || !id) {
      throw new Error(
        `secrets.create did not return a usable secret_id: ${JSON.stringify(created)}`,
      );
    }
    vdbSecretId = id;
    console.log(`[vector_store e2e] managed secret created: ${id}`);
  });

  afterAll(async () => {
    if (!RUN || !client || !vdbSecretId) return;
    try {
      await client.management.secrets.delete(vdbSecretId);
      console.log(`[vector_store e2e] managed secret deleted: ${vdbSecretId}`);
    } catch (e) {
      console.warn(`[cleanup] delete secret ${vdbSecretId} failed:`, e);
    }
  });

  it.skipIf(!RUN)(
    "create collection → submit load job → wait until completed",
    { timeout: 1_200_000 },
    async () => {
      const c = client!;
      const sid = vdbSecretId!;

      const createResp = await c.vectorStore.collections.create({
        collection: buildCollection(COLLECTION_NAME),
        vectorDbConfig: buildVdbConfig(sid),
      });
      expect(typeof createResp).toBe("object");
      expect((createResp as any).success).toBe(true);
      console.log(
        `[vector_store e2e] collection ${COLLECTION_NAME} created (already_existed=${(createResp as any).already_existed})`,
      );

      const submit = await c.vectorStore.jobs.create({
        bucketUid: BUCKET_UID!,
        collectionName: COLLECTION_NAME,
        fieldMappings: buildFieldMappings(),
        vectorDbConfig: buildVdbConfig(sid),
      });
      const jobUid = (submit as Record<string, unknown>).job_uid as string;
      expect(typeof jobUid).toBe("string");
      expect(jobUid.length).toBeGreaterThan(0);
      console.log(`[vector_store e2e] submitted load job ${jobUid}`);

      // Strict wait: only "completed" is acceptable.
      const final = await waitForTerminalStatus<Record<string, unknown>>({
        fetchStatus: () => c.vectorStore.jobs.get(jobUid),
        extractStatus: (r) => {
          const s = (r as Record<string, unknown>).status;
          return typeof s === "string" ? s : undefined;
        },
        timeoutS: 1100,
        pollIntervalS: 2,
        pollMaxIntervalS: 10,
        terminalStates: new Set(["completed", "failed"]),
        identifier: `vector-load job ${jobUid}`,
      });
      console.log(
        `[vector_store e2e] final status: ${(final as any).status}; ` +
          `collection_name: ${(final as any).collection_name}`,
      );
      expect((final as any).status).toBe("completed");
      expect((final as any).collection_name).toBe(COLLECTION_NAME);
    },
  );
});
