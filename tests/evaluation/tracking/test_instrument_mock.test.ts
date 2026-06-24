import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trace } from "@opentelemetry/api";

const OPTS = { apiKey: "nl_mock", baseUrl: "https://mock.neurolinker.test" };

// Each test starts from a clean slate: reset OpenTelemetry's global provider and
// our module state (the `_instrumented` guard) so first-call behavior is testable.
beforeEach(() => {
  trace.disable();
  vi.resetModules();
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function freshInstrument() {
  const mod = await import("../../../src/index.js");
  return mod;
}

describe("evaluation tracking — instrument", () => {
  it("rejects an empty trackUid", async () => {
    const { instrument, NeuroLinkerConfigError } = await freshInstrument();
    await expect(instrument("")).rejects.toBeInstanceOf(NeuroLinkerConfigError);
  });

  it("rejects a missing API key", async () => {
    const { instrument, NeuroLinkerConfigError } = await freshInstrument();
    const saved = process.env.NEUROLINKER_API_KEY;
    delete process.env.NEUROLINKER_API_KEY;
    try {
      await expect(instrument("track-1")).rejects.toBeInstanceOf(NeuroLinkerConfigError);
    } finally {
      if (saved !== undefined) process.env.NEUROLINKER_API_KEY = saved;
    }
  });

  it("manual:true sets up the pipe, returns a flushable handle, and stays quiet", async () => {
    const { instrument } = await freshInstrument();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const provider = await instrument("track-1", { ...OPTS, manual: true });
    expect(typeof provider.forceFlush).toBe("function");
    expect(typeof provider.shutdown).toBe("function");
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("no instrumentations"));

    await provider.shutdown();
  });

  it("warns when no instrumentations are given and manual is not set", async () => {
    const { instrument } = await freshInstrument();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const provider = await instrument("track-1", OPTS);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no instrumentations"));

    await provider.shutdown();
  });

  it("is idempotent — a repeat call warns and is ignored", async () => {
    const { instrument } = await freshInstrument();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await instrument("track-1", { ...OPTS, manual: true });
    const again = await instrument("track-2", { ...OPTS, manual: true });

    expect(typeof again.forceFlush).toBe("function");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("already called"));
  });
});
