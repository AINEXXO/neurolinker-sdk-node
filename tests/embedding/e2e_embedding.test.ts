import { describe, expect, it } from "vitest";
import {
  NeuroLinker,
  type EmbeddingModalitiesInput,
} from "../../src/index.js";
import { waitForTerminalStatus } from "../../src/polling.js";

const TOKEN = process.env.NEUROLINKER_API_KEY;
const BUCKET_UID = process.env.NEUROLINKER_TEST_BUCKET_UID;

interface BackendModel {
  name: string;
  endpoint: string;
  vector_types?: string[];
}

function pickTextDenseModel(payload: Record<string, unknown>): BackendModel {
  const models = payload.models as BackendModel[] | undefined;
  if (!Array.isArray(models) || models.length === 0) {
    throw new Error(`No internal embedding models returned: ${JSON.stringify(payload)}`);
  }
  const found = models.find((m) => (m.vector_types ?? []).includes("dense"));
  if (!found) {
    throw new Error(`No model with 'dense' vector_types in: ${JSON.stringify(models)}`);
  }
  return found;
}

function buildModalities(model: BackendModel): EmbeddingModalitiesInput {
  return {
    text: {
      vectors: {
        dense: {
          vectorName: "text_dense_e2e",
          model: { endpoint: model.endpoint, modelName: model.name },
          inputs: ["content"],
        },
      },
    },
  };
}

describe("e2e embedding — full flow", () => {
  it.skipIf(!TOKEN || !BUCKET_UID)(
    "listModels → submit → wait until completed → results (with real bytes)",
    { timeout: 1_200_000 },
    async () => {
      const client = NeuroLinker.fromEnv();

      const models = await client.embedding.listModels();
      const model = pickTextDenseModel(models);
      console.log(
        `[embedding e2e] picked model: ${model.name} @ ${model.endpoint}`,
      );

      const submit = await client.embedding.jobs.create({
        bucketUid: BUCKET_UID!,
        modalities: buildModalities(model),
      });
      const jobUid = (submit as Record<string, unknown>).job_uid as string;
      expect(typeof jobUid).toBe("string");
      expect(jobUid.length).toBeGreaterThan(0);
      console.log(`[embedding e2e] submitted job ${jobUid}`);

      // Strict wait: only "completed" is acceptable.
      const final = await waitForTerminalStatus<Record<string, unknown>>({
        fetchStatus: () => client.embedding.jobs.get(jobUid),
        extractStatus: (r) => {
          const s = (r as Record<string, unknown>).status;
          return typeof s === "string" ? s : undefined;
        },
        timeoutS: 1100,
        pollIntervalS: 2,
        pollMaxIntervalS: 10,
        terminalStates: new Set(["completed", "failed"]),
        identifier: `embedding job ${jobUid}`,
      });
      console.log(`[embedding e2e] final status: ${(final as any).status}`);
      expect((final as any).status).toBe("completed");

      const files = await client.embedding.results(BUCKET_UID!);
      expect(typeof files).toBe("object");
      const names = Object.keys(files);
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) {
        expect(typeof name).toBe("string");
        expect(name.length).toBeGreaterThan(0);
        expect(Buffer.isBuffer(files[name])).toBe(true);
        expect(files[name].length).toBeGreaterThan(0);
      }
      console.log(
        `[embedding e2e] downloaded ${names.length} files: ${names
          .map((n) => `${n} (${files[n].length}B)`)
          .join(", ")}`,
      );
    },
  );
});
