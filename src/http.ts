/* eslint-disable @typescript-eslint/no-explicit-any */

import { NeuroLinkerAPIError } from "./errors.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export function buildUrl(baseUrl: string, path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl.replace(/\/+$/, "")}${p}`;
}

export function jsonHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

export async function raiseForStatus(resp: Response, method: HttpMethod | string): Promise<void> {
  if (resp.ok) return;

  const text = await resp.text();
  let parsed: any | undefined;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }

  throw new NeuroLinkerAPIError({
    statusCode: resp.status,
    method,
    url: resp.url,
    responseText: text,
    responseJson: parsed,
  });
}

interface RequestArgs {
  url: string;
  method: HttpMethod;
  token: string;
  timeoutS: number;
  body?: unknown;
}

export async function fetchJson<T>(args: RequestArgs): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = Math.max(0, args.timeoutS * 1000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(args.url, {
      method: args.method,
      headers: {
        ...jsonHeaders(args.token),
        "Content-Type": "application/json",
      },
      body: args.body !== undefined ? JSON.stringify(args.body) : undefined,
      signal: controller.signal,
    });

    await raiseForStatus(resp, args.method);
    if (resp.status === 204 || resp.headers.get("content-length") === "0") {
      return undefined as T;
    }
    return (await resp.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchVoid(args: RequestArgs): Promise<void> {
  const controller = new AbortController();
  const timeoutMs = Math.max(0, args.timeoutS * 1000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(args.url, {
      method: args.method,
      headers: {
        ...jsonHeaders(args.token),
        "Content-Type": "application/json",
      },
      body: args.body !== undefined ? JSON.stringify(args.body) : undefined,
      signal: controller.signal,
    });

    await raiseForStatus(resp, args.method);
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchMultipart<T>(args: {
  url: string;
  token: string;
  timeoutS: number;
  formData: FormData;
}): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = Math.max(0, args.timeoutS * 1000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(args.url, {
      method: "POST",
      headers: {
        ...jsonHeaders(args.token),
        // Do NOT set Content-Type — fetch sets the proper multipart boundary.
      },
      body: args.formData,
      signal: controller.signal,
    });

    await raiseForStatus(resp, "POST");
    return (await resp.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchSignedFile(args: {
  url: string;
  filename: string;
  timeoutS: number;
}): Promise<Buffer> {
  const controller = new AbortController();
  const timeoutMs = Math.max(0, args.timeoutS * 1000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(args.url, { method: "GET", signal: controller.signal });
    if (!resp.ok) {
      throw new NeuroLinkerAPIError({
        statusCode: resp.status,
        method: "GET",
        url: resp.url,
        responseText:
          `Failed to fetch signed URL for '${args.filename}' from object storage ` +
          `(status ${resp.status}). The URL may have expired — retry the ` +
          `results() call to get fresh URLs.`,
        responseJson: undefined,
      });
    }
    const arr = await resp.arrayBuffer();
    return Buffer.from(arr);
  } finally {
    clearTimeout(timeout);
  }
}

export function extractSignedFiles(responseBody: unknown): Record<string, string> {
  if (!responseBody || typeof responseBody !== "object") return {};
  const result = (responseBody as Record<string, unknown>).result;
  if (!result || typeof result !== "object") return {};
  const files = (result as Record<string, unknown>).files;
  if (!files || typeof files !== "object") return {};

  const out: Record<string, string> = {};
  for (const [name, url] of Object.entries(files as Record<string, unknown>)) {
    if (typeof url === "string" && url) out[name] = url;
  }
  return out;
}

export async function fetchSignedFiles(args: {
  files: Record<string, string>;
  timeoutS: number;
}): Promise<Record<string, Buffer>> {
  const entries = Object.entries(args.files);
  const pairs = await Promise.all(
    entries.map(async ([filename, url]) => {
      const buf = await fetchSignedFile({ url, filename, timeoutS: args.timeoutS });
      return [filename, buf] as const;
    }),
  );
  return Object.fromEntries(pairs);
}
