import { NeuroLinkerAPIError } from "./errors.js";

export const DEFAULT_TERMINAL_STATES: ReadonlySet<string> = new Set([
  "completed",
  "failed",
  "pending",
]);

export interface WaitOptions<T> {
  fetchStatus: () => Promise<T>;
  extractStatus: (response: T) => string | undefined;
  timeoutS: number;
  pollIntervalS: number;
  pollMaxIntervalS: number;
  terminalStates?: ReadonlySet<string>;
  tolerate404?: boolean;
  identifier?: string;
  timeoutContext?: (last: T | undefined) => string;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function formatTimeoutMessage<T>(
  identifier: string,
  timeoutS: number,
  last: T | undefined,
  timeoutContext: ((last: T | undefined) => string) | undefined,
): string {
  const base = `Timeout waiting for ${identifier} after ${timeoutS}s. Last status: ${JSON.stringify(last)}.`;
  if (!timeoutContext) return base;
  try {
    const extra = timeoutContext(last);
    return extra ? `${base}${extra}` : base;
  } catch {
    return base;
  }
}

export async function waitForTerminalStatus<T>(opts: WaitOptions<T>): Promise<T> {
  const {
    fetchStatus,
    extractStatus,
    timeoutS,
    pollIntervalS,
    pollMaxIntervalS,
    terminalStates = DEFAULT_TERMINAL_STATES,
    tolerate404 = true,
    identifier = "<unknown>",
    timeoutContext,
  } = opts;

  const deadline = Date.now() + timeoutS * 1000;
  let interval = pollIntervalS;
  let last: T | undefined;

  while (Date.now() < deadline) {
    try {
      last = await fetchStatus();
    } catch (err) {
      if (tolerate404 && err instanceof NeuroLinkerAPIError && err.statusCode === 404) {
        await sleep(interval * 1000);
        interval = Math.min(pollMaxIntervalS, interval * 1.5);
        continue;
      }
      throw err;
    }

    const status = extractStatus(last);
    if (status !== undefined && terminalStates.has(status)) return last;

    await sleep(interval * 1000);
    interval = Math.min(pollMaxIntervalS, interval * 1.2);
  }

  throw new Error(formatTimeoutMessage(identifier, timeoutS, last, timeoutContext));
}
