import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { trace } from "@opentelemetry/api";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { NeuroLinkerConfigError, recordQuery } from "../../../src/index.js";

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });

beforeAll(() => provider.register());
afterEach(() => exporter.reset());
afterAll(async () => {
  await provider.shutdown();
});

describe("evaluation tracking — recordQuery span shape", () => {
  it("emits a CHAIN query span with RETRIEVER and LLM children", async () => {
    const ret = await recordQuery({ userInput: "What is X?" }, (q) => {
      q.setContexts(["ctx one", "ctx two"]);
      q.setResponse("X is the answer.");
      q.setLlm({ model: "kimi", inputTokens: 100, outputTokens: 20 });
      return "done";
    });
    expect(ret).toBe("done");

    const spans = exporter.getFinishedSpans();
    const chain = spans.find((s) => s.name === "rag.query")!;
    const retrieval = spans.find((s) => s.name === "retrieval")!;
    const llm = spans.find((s) => s.name === "llm")!;
    expect(chain && retrieval && llm).toBeTruthy();

    // root query span
    expect(chain.attributes["openinference.span.kind"]).toBe("CHAIN");
    expect(chain.attributes["input.value"]).toBe("What is X?");
    expect(chain.attributes["output.value"]).toBe("X is the answer.");

    // RETRIEVER child
    expect(retrieval.attributes["openinference.span.kind"]).toBe("RETRIEVER");
    expect(retrieval.attributes["retrieval.documents.0.document.content"]).toBe("ctx one");
    expect(retrieval.attributes["retrieval.documents.1.document.content"]).toBe("ctx two");

    // LLM child — total auto-derived from prompt + completion
    expect(llm.attributes["openinference.span.kind"]).toBe("LLM");
    expect(llm.attributes["llm.model_name"]).toBe("kimi");
    expect(llm.attributes["llm.token_count.prompt"]).toBe(100);
    expect(llm.attributes["llm.token_count.completion"]).toBe(20);
    expect(llm.attributes["llm.token_count.total"]).toBe(120);

    // children belong to the same trace as the query span
    const tid = chain.spanContext().traceId;
    expect(retrieval.spanContext().traceId).toBe(tid);
    expect(llm.spanContext().traceId).toBe(tid);
  });

  it("works with only the required pieces (no contexts, no LLM)", async () => {
    await recordQuery({ userInput: "Q" }, (q) => {
      q.setResponse("A");
    });
    const spans = exporter.getFinishedSpans();
    expect(spans.filter((s) => s.name === "retrieval")).toHaveLength(0);
    expect(spans.filter((s) => s.name === "llm")).toHaveLength(0);
    const chain = spans.find((s) => s.name === "rag.query")!;
    expect(chain.attributes["input.value"]).toBe("Q");
    expect(chain.attributes["output.value"]).toBe("A");
  });

  it("rejects empty userInput", async () => {
    await expect(
      recordQuery({ userInput: "" }, () => undefined),
    ).rejects.toBeInstanceOf(NeuroLinkerConfigError);
  });
});
