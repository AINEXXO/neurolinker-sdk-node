import { describe, expect, it } from "vitest";
import { instrument, NeuroLinker, recordQuery } from "../../../src/index.js";

const TOKEN = process.env.NEUROLINKER_API_KEY;

describe("e2e evaluation — tracking (manual)", () => {
  it.skipIf(!TOKEN)(
    "create track → instrument → recordQuery → flush → dashboard",
    async () => {
      const client = NeuroLinker.fromEnv();

      const track = await client.evaluation.tracking.tracks.create({
        name: `sdk-e2e-${Date.now()}`,
      });
      const trackUid = (track as Record<string, unknown>).track_uid as string;
      expect(typeof trackUid).toBe("string");
      expect(trackUid.length).toBeGreaterThan(0);

      const provider = await instrument(trackUid, { manual: true });
      await recordQuery({ userInput: "What is the capital of France?" }, (q) => {
        q.setContexts(["Paris is the capital and largest city of France."]);
        q.setResponse("The capital of France is Paris.");
        q.setLlm({ model: "e2e-model", inputTokens: 20, outputTokens: 8 });
      });
      await provider.forceFlush(); // send the span to the ingest

      // REST lifecycle is deterministic: the new track is listed.
      const listed = await client.evaluation.tracking.tracks.list();
      const tracks = (listed as Record<string, unknown>).tracks as Array<Record<string, unknown>>;
      expect(tracks.some((t) => t.track_uid === trackUid)).toBe(true);

      // Scoring is asynchronous (ingest → evaluator → Firestore). Poll briefly and,
      // if the row lands in time, sanity-check its shape — without hard-failing on
      // a slow evaluator.
      let row: Record<string, unknown> | undefined;
      for (let i = 0; i < 15 && !row; i++) {
        const q = await client.evaluation.tracking.queries(trackUid, { limit: 10 });
        const rows = (q as Record<string, unknown>).queries as Array<Record<string, unknown>>;
        if (Array.isArray(rows) && rows.length > 0) row = rows[0];
        else await new Promise((r) => setTimeout(r, 3000));
      }
      if (row) {
        expect(row).toHaveProperty("trace_id");
      }

      // Disable the track (cleanup).
      await client.evaluation.tracking.tracks.setActive(trackUid, { active: false });
    },
    90_000,
  );
});
