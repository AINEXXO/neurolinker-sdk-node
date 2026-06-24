import { describe, expect, it } from "vitest";
import { NeuroLinker } from "../../../src/index.js";

const TOKEN = process.env.NEUROLINKER_API_KEY;

// Inline dataset — self-contained (no bucket needed). All four columns present
// → the full reference-dependent metric set fires.
const ROWS = [
  {
    user_input: "What is the capital of France?",
    response: "The capital of France is Paris.",
    retrieved_contexts: ["Paris is the capital and largest city of France."],
    reference: "Paris is the capital of France.",
  },
  {
    user_input: "What does Neurolinker do?",
    response: "It turns raw PDFs into searchable vectors.",
    retrieved_contexts: ["Neurolinker turns raw PDFs into searchable vectors for RAG."],
    reference: "Neurolinker converts PDFs into vectors for retrieval-augmented generation.",
  },
];

function jsonl(): Buffer {
  return Buffer.from(ROWS.map((r) => JSON.stringify(r)).join("\n"), "utf-8");
}

describe("e2e evaluation — one-shot", () => {
  it.skipIf(!TOKEN)("upload → wait → fetch parsed result.json", async () => {
    const client = NeuroLinker.fromEnv();

    const job = await client.evaluation.oneshot.jobs.create({
      dataset: { filename: "e2e.jsonl", content: jsonl() },
    });
    const evalUid = (job as Record<string, unknown>).eval_uid as string;
    expect(typeof evalUid).toBe("string");
    expect(evalUid.length).toBeGreaterThan(0);

    const final = await client.evaluation.oneshot.jobs.wait(evalUid);
    expect((final as Record<string, unknown>).status).toBe("completed");

    const result = await client.evaluation.oneshot.results(evalUid);
    const rows = (result as Record<string, unknown>).rows as unknown[];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(ROWS.length);
    expect((result as Record<string, unknown>).summary).toBeTruthy();
  });
});
