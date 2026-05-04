import { describe, expect, it } from "vitest";
import { NeuroLinker } from "../../src/index.js";
import { waitForTerminalStatus } from "../../src/polling.js";

const TOKEN = process.env.NEUROLINKER_API_KEY;
const BUCKET_UID = process.env.NEUROLINKER_TEST_BUCKET_UID;

describe("e2e chunking — full flow", () => {
  it.skipIf(!TOKEN || !BUCKET_UID)(
    "submit → wait until completed → analyze → results (with real bytes)",
    { timeout: 600_000 },
    async () => {
      const client = NeuroLinker.fromEnv();

      const submit = await client.chunking.jobs.create({
        bucketUid: BUCKET_UID!,
        chunking: { method: "section_greedy", tMin: 100, tMax: 512 },
      });
      const jobUid = (submit as Record<string, unknown>).job_uid as string;
      expect(typeof jobUid).toBe("string");
      expect(jobUid.length).toBeGreaterThan(0);
      console.log(`[chunking e2e] submitted job ${jobUid}`);

      // Strict wait: only "completed" is acceptable. We want byte-level
      // verification of outputs, so "pending" / "failed" must fail the test.
      const final = await waitForTerminalStatus<Record<string, unknown>>({
        fetchStatus: () => client.chunking.jobs.get(jobUid),
        extractStatus: (r) => {
          const s = (r as Record<string, unknown>).status;
          return typeof s === "string" ? s : undefined;
        },
        timeoutS: 540,
        pollIntervalS: 2,
        pollMaxIntervalS: 10,
        terminalStates: new Set(["completed", "failed"]),
        identifier: `chunking job ${jobUid}`,
      });
      console.log(`[chunking e2e] final status: ${(final as any).status}`);
      expect((final as any).status).toBe("completed");

      const analyze = await client.chunking.analyze(BUCKET_UID!);
      expect(typeof analyze).toBe("object");
      expect((analyze as any).success).toBe(true);

      const files = await client.chunking.results(BUCKET_UID!);
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
        `[chunking e2e] downloaded ${names.length} files: ${names
          .map((n) => `${n} (${files[n].length}B)`)
          .join(", ")}`,
      );
    },
  );
});
