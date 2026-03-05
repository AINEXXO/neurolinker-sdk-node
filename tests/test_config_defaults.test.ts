import { describe, expect, it } from "vitest";
import { configFromEnv, DEFAULT_BASE_URL, DEFAULT_TIMEOUT_S, DEFAULT_POLL_INTERVAL_S, DEFAULT_POLL_MAX_INTERVAL_S } from "../src/config.js";
import { NeuroLinkerConfigError } from "../src/errors.js";

describe("configFromEnv", () => {
  it("requires token", () => {
    const prev = process.env.NEUROLINKER_API_KEY;
    delete process.env.NEUROLINKER_API_KEY;

    expect(() => configFromEnv()).toThrow(NeuroLinkerConfigError);

    if (prev) process.env.NEUROLINKER_API_KEY = prev;
  });

  it("uses default base url when missing", () => {
    process.env.NEUROLINKER_API_KEY = "nl_dummy";
    delete process.env.NEUROLINKER_BASE_URL;
    delete process.env.NEUROLINKER_E2E_TIMEOUT_S;
    delete process.env.NEUROLINKER_E2E_POLL_INTERVAL_S;
    delete process.env.NEUROLINKER_E2E_POLL_MAX_INTERVAL_S;

    const cfg = configFromEnv();
    expect(cfg.baseUrl).toBe(DEFAULT_BASE_URL.replace(/\/+$/, ""));
    expect(cfg.token).toBe("nl_dummy");
    expect(cfg.timeoutS).toBe(DEFAULT_TIMEOUT_S);
    expect(cfg.pollIntervalS).toBe(DEFAULT_POLL_INTERVAL_S);
    expect(cfg.pollMaxIntervalS).toBe(DEFAULT_POLL_MAX_INTERVAL_S);
  });

  it("respects custom base url and polling values", () => {
    process.env.NEUROLINKER_API_KEY = "nl_dummy";
    process.env.NEUROLINKER_BASE_URL = "https://example.com/neurolinker/";
    process.env.NEUROLINKER_E2E_TIMEOUT_S = "123";
    process.env.NEUROLINKER_E2E_POLL_INTERVAL_S = "1.5";
    process.env.NEUROLINKER_E2E_POLL_MAX_INTERVAL_S = "7.0";

    const cfg = configFromEnv();
    expect(cfg.baseUrl).toBe("https://example.com/neurolinker");
    expect(cfg.timeoutS).toBe(123);
    expect(cfg.pollIntervalS).toBe(1.5);
    expect(cfg.pollMaxIntervalS).toBe(7);
  });
});