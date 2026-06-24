import { DEFAULT_BASE_URL } from "../../config.js";
import { NeuroLinkerConfigError } from "../../errors.js";

const TRACK_UID_HEADER = "neurolinker-track-uid";
const INGEST_PATH = "/v1/eval/ingest/v1/traces";

const MISSING_DEPS_MESSAGE =
  "Tracking dependencies are not installed. Install the tracking peer deps, e.g. " +
  "`npm install @opentelemetry/api @opentelemetry/sdk-trace-node " +
  "@opentelemetry/exporter-trace-otlp-proto @arizeai/openinference-semantic-conventions`.";

let _instrumented = false;
let _provider: TracerProviderHandle | undefined;

export interface InstrumentOptions {
  /** API key. Defaults to `NEUROLINKER_API_KEY`. */
  apiKey?: string;
  /** API base URL. Defaults to `NEUROLINKER_BASE_URL` or the production endpoint. */
  baseUrl?: string;
  /**
   * OpenInference instrumentation instances to activate for automatic tracing —
   * e.g. `[new OpenAIInstrumentation()]`. Node has no entry-point auto-discovery,
   * so you pass them explicitly. Register **before** importing the instrumented
   * framework. Omit if you'll trace manually via `recordQuery` (`manual: true`).
   */
  instrumentations?: unknown[];
  /** Set when you'll trace a custom RAG via `recordQuery` instead of passing
   * `instrumentations` — silences the "no instrumentations" warning. */
  manual?: boolean;
}

/** The bits of the OpenTelemetry TracerProvider a caller needs — kept local so
 * the public API doesn't leak the optional OpenTelemetry types. */
export interface TracerProviderHandle {
  forceFlush(): Promise<void>;
  shutdown(): Promise<void>;
}

/**
 * Attach NeuroLinker tracking — call once at app startup. Sets up the
 * OpenTelemetry pipe (OTLP exporter → NeuroLinker ingest) so traces of your RAG
 * reach the `trackUid`'s dashboard. `trackUid` comes from
 * `client.evaluation.tracking.tracks.create`.
 *
 * Pass your framework's OpenInference instrumentations via `instrumentations` for
 * automatic tracing, or `manual: true` to trace a custom RAG with `recordQuery`.
 *
 * Returns the TracerProvider — call `provider.forceFlush()` before a short-lived
 * script exits, so the last spans are sent.
 *
 * On Node, if your app already registered its own OpenTelemetry provider,
 * NeuroLinker cannot attach to it automatically (OpenTelemetry-JS has no
 * after-the-fact span-processor API) — it warns instead of silently dropping
 * spans. Requires the tracking peer deps (see the README).
 */
export async function instrument(
  trackUid: string,
  opts: InstrumentOptions = {},
): Promise<TracerProviderHandle> {
  if (!trackUid) {
    throw new NeuroLinkerConfigError("trackUid must be a non-empty string.");
  }
  const token = (opts.apiKey || process.env.NEUROLINKER_API_KEY || "").trim();
  if (!token) {
    throw new NeuroLinkerConfigError("No API key: pass apiKey or set NEUROLINKER_API_KEY.");
  }
  const url = (opts.baseUrl || process.env.NEUROLINKER_BASE_URL || DEFAULT_BASE_URL).replace(
    /\/+$/,
    "",
  );

  let api: typeof import("@opentelemetry/api");
  let sdk: typeof import("@opentelemetry/sdk-trace-node");
  let otlp: typeof import("@opentelemetry/exporter-trace-otlp-proto");
  try {
    api = await import("@opentelemetry/api");
    sdk = await import("@opentelemetry/sdk-trace-node");
    otlp = await import("@opentelemetry/exporter-trace-otlp-proto");
  } catch {
    throw new NeuroLinkerConfigError(MISSING_DEPS_MESSAGE);
  }

  const { trace } = api;
  const { NodeTracerProvider, BatchSpanProcessor } = sdk;
  const { OTLPTraceExporter } = otlp;

  if (_instrumented) {
    console.warn(
      "neurolinker: instrument() was already called in this process — ignoring the repeat call.",
    );
    return _provider ?? (trace.getTracerProvider() as unknown as TracerProviderHandle);
  }

  // If the app already runs its own OpenTelemetry SDK provider, OpenTelemetry-JS
  // has no API to attach a span processor after the fact — warn rather than
  // silently drop NeuroLinker spans.
  const current = trace.getTracerProvider() as { getDelegate?: () => unknown };
  const delegate = typeof current.getDelegate === "function" ? current.getDelegate() : current;
  const registeredName = (delegate as { constructor?: { name?: string } } | undefined)?.constructor
    ?.name;
  if (delegate && registeredName && registeredName !== "NoopTracerProvider") {
    console.warn(
      "neurolinker: an OpenTelemetry tracer provider is already registered — on Node, " +
        "NeuroLinker cannot attach to it automatically. Add a BatchSpanProcessor with the " +
        "NeuroLinker OTLP exporter to your own provider, or call instrument() before your " +
        "OpenTelemetry setup.",
    );
    _instrumented = true;
    _provider = delegate as TracerProviderHandle;
    return _provider;
  }

  const exporter = new OTLPTraceExporter({
    url: `${url}${INGEST_PATH}`,
    headers: { authorization: `Bearer ${token}`, [TRACK_UID_HEADER]: trackUid },
  });
  const provider = new NodeTracerProvider({ spanProcessors: [new BatchSpanProcessor(exporter)] });
  provider.register();
  _instrumented = true;
  _provider = provider;

  await activateInstrumentations(opts.instrumentations, opts.manual ?? false, provider);
  return provider;
}

/**
 * Activate the OpenInference instrumentations the caller passed (no auto-discovery
 * on Node — they're explicit). Warns when none are given and `manual` is not set,
 * and when more than one is active (possible duplicate spans).
 */
async function activateInstrumentations(
  instrumentations: unknown[] | undefined,
  manual: boolean,
  provider: TracerProviderHandle,
): Promise<void> {
  const count = instrumentations?.length ?? 0;
  if (count === 0) {
    if (!manual) {
      console.warn(
        "neurolinker: no instrumentations provided — auto-tracing is off. Pass " +
          "instrumentations: [new XxxInstrumentation()] for automatic tracing, or use " +
          "recordQuery(...) to trace a custom RAG manually.",
      );
    }
    return;
  }

  let register: typeof import("@opentelemetry/instrumentation").registerInstrumentations;
  try {
    ({ registerInstrumentations: register } = await import("@opentelemetry/instrumentation"));
  } catch {
    throw new NeuroLinkerConfigError(
      "Auto-instrumentation requires @opentelemetry/instrumentation. Install it (plus your " +
        "framework's @arizeai/openinference-instrumentation-* package), or use recordQuery(...).",
    );
  }

  register({
    instrumentations: instrumentations as Parameters<typeof register>[0]["instrumentations"],
    tracerProvider: provider as unknown as Parameters<typeof register>[0]["tracerProvider"],
  });

  if (count > 1) {
    console.warn(
      "neurolinker: multiple instrumentations active — if you see duplicate spans or doubled " +
        "token counts, register fewer.",
    );
  }
}
