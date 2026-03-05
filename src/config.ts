import { NeuroLinkerConfigError } from "./errors.js";

// Matches the Python SDK behavior: default to the canonical deployment.
// In Python you also allow NEUROLINKER_BASE_URL to override default :contentReference[oaicite:6]{index=6}.
export const DEFAULT_BASE_URL =
  process.env.NEUROLINKER_BASE_URL?.trim() || "https://neurolinker.api.ainexxo.com";

export const DEFAULT_TIMEOUT_S = 600.0;
export const DEFAULT_POLL_INTERVAL_S = 2.0;
export const DEFAULT_POLL_MAX_INTERVAL_S = 10.0;

export type NeuroLinkerConfig = {
  baseUrl: string;
  token: string;
  timeoutS: number;
  pollIntervalS: number;
  pollMaxIntervalS: number;
};

export function configFromEnv(): NeuroLinkerConfig {
  const baseUrlRaw = (process.env.NEUROLINKER_BASE_URL || "").trim();
  const token = (process.env.NEUROLINKER_API_KEY || "").trim();

  const timeoutS = Number(process.env.NEUROLINKER_E2E_TIMEOUT_S || DEFAULT_TIMEOUT_S);
  const pollIntervalS = Number(process.env.NEUROLINKER_E2E_POLL_INTERVAL_S || DEFAULT_POLL_INTERVAL_S);
  const pollMaxIntervalS = Number(process.env.NEUROLINKER_E2E_POLL_MAX_INTERVAL_S || DEFAULT_POLL_MAX_INTERVAL_S);

  if (!token) {
    throw new NeuroLinkerConfigError("NEUROLINKER_API_KEY is not set.");
  }

  const baseUrl = (baseUrlRaw || DEFAULT_BASE_URL).replace(/\/+$/, "");

  return {
    baseUrl,
    token,
    timeoutS,
    pollIntervalS,
    pollMaxIntervalS,
  };
}