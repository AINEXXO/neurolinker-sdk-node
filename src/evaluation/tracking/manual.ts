import { NeuroLinkerConfigError } from "../../errors.js";

const TRACER_NAME = "neurolinker_sdk";

// Minimal structural views of the OpenTelemetry / OpenInference surface we use,
// so the public types don't leak the optional tracking dependencies.
interface MinimalSpan {
  setAttribute(key: string, value: string | number): void;
  end(): void;
}
interface MinimalTracer {
  startActiveSpan<T>(name: string, fn: (span: MinimalSpan) => T): T;
}
type Keys = Record<string, string>;

/**
 * Handle passed to the `recordQuery` callback. Attach the retrieved contexts, the
 * final response and (optionally) LLM observability to the current query so the
 * backend can score it.
 */
export class QueryRecorder {
  constructor(
    private readonly span: MinimalSpan,
    private readonly tracer: MinimalTracer,
    private readonly s: Keys,
    private readonly k: Keys,
  ) {}

  /**
   * Record the retrieved chunks as a RETRIEVER child span — this is what unlocks
   * the context metrics (faithfulness, context precision/recall).
   */
  setContexts(contexts: string[]): void {
    this.tracer.startActiveSpan("retrieval", (span) => {
      span.setAttribute(this.s.OPENINFERENCE_SPAN_KIND, this.k.RETRIEVER);
      contexts.forEach((content, i) => {
        span.setAttribute(`${this.s.RETRIEVAL_DOCUMENTS}.${i}.${this.s.DOCUMENT_CONTENT}`, content);
      });
      span.end();
    });
  }

  /** Record the RAG's final answer (the query span's output). */
  setResponse(response: string): void {
    this.span.setAttribute(this.s.OUTPUT_VALUE, response);
  }

  /**
   * Record LLM observability (model name + token counts) as an LLM child span.
   * Optional — it feeds the dashboard's cost view, not the Ragas scores. Pass
   * whatever you have; `totalTokens` defaults to `inputTokens + outputTokens`.
   */
  setLlm(args: {
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  }): void {
    let total = args.totalTokens;
    if (total === undefined && args.inputTokens !== undefined && args.outputTokens !== undefined) {
      total = args.inputTokens + args.outputTokens;
    }
    this.tracer.startActiveSpan("llm", (span) => {
      span.setAttribute(this.s.OPENINFERENCE_SPAN_KIND, this.k.LLM);
      if (args.model !== undefined) span.setAttribute(this.s.LLM_MODEL_NAME, args.model);
      if (args.inputTokens !== undefined) {
        span.setAttribute(this.s.LLM_TOKEN_COUNT_PROMPT, args.inputTokens);
      }
      if (args.outputTokens !== undefined) {
        span.setAttribute(this.s.LLM_TOKEN_COUNT_COMPLETION, args.outputTokens);
      }
      if (total !== undefined) span.setAttribute(this.s.LLM_TOKEN_COUNT_TOTAL, total);
      span.end();
    });
  }
}

/**
 * Manually trace one RAG query when your stack has no auto-instrumentor. Call
 * `instrument` once at startup, then wrap each request:
 *
 * ```ts
 * await recordQuery({ userInput: question }, async (q) => {
 *   const docs = await myRetriever(question);
 *   q.setContexts(docs.map((d) => d.text));       // unlocks the context metrics
 *   const resp = await myLlm(question, docs);       // your own LLM call
 *   q.setResponse(resp.text);
 *   q.setLlm({ model: resp.model, inputTokens: resp.usage.inputTokens,
 *              outputTokens: resp.usage.outputTokens });   // optional
 * });
 * ```
 *
 * Produces exactly the span shape the backend scores: a root query span carrying
 * input/output, a RETRIEVER child carrying the contexts, and (optionally) an LLM
 * child carrying model/token observability. Returns whatever the callback returns.
 */
export async function recordQuery<T>(
  args: { userInput: string },
  fn: (q: QueryRecorder) => Promise<T> | T,
): Promise<T> {
  if (!args.userInput) {
    throw new NeuroLinkerConfigError("userInput must be a non-empty string.");
  }

  let api: typeof import("@opentelemetry/api");
  let oi: typeof import("@arizeai/openinference-semantic-conventions");
  try {
    api = await import("@opentelemetry/api");
    oi = await import("@arizeai/openinference-semantic-conventions");
  } catch {
    throw new NeuroLinkerConfigError(
      "Tracking dependencies are not installed. Install the tracking peer deps, e.g. " +
        "`npm install @opentelemetry/api @arizeai/openinference-semantic-conventions`.",
    );
  }

  const { trace } = api;
  const s = oi.SemanticConventions as unknown as Keys;
  const k = oi.OpenInferenceSpanKind as unknown as Keys;

  const current = trace.getTracerProvider() as { getDelegate?: () => unknown };
  const delegate = typeof current.getDelegate === "function" ? current.getDelegate() : current;
  if (!delegate || (delegate as { constructor?: { name?: string } }).constructor?.name === "NoopTracerProvider") {
    console.warn(
      "neurolinker: recordQuery used but no tracer provider is configured — call " +
        "instrument(...) at startup, otherwise this span is dropped.",
    );
  }

  const tracer = trace.getTracer(TRACER_NAME) as unknown as MinimalTracer;
  return await tracer.startActiveSpan("rag.query", async (span) => {
    try {
      span.setAttribute(s.OPENINFERENCE_SPAN_KIND, k.CHAIN);
      span.setAttribute(s.INPUT_VALUE, args.userInput);
      return await fn(new QueryRecorder(span, tracer, s, k));
    } finally {
      span.end();
    }
  });
}
