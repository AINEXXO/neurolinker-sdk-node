/* eslint-disable @typescript-eslint/no-explicit-any */

import { NeuroLinkerAPIError } from "./errors.js";

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

export async function raiseForStatus(resp: Response): Promise<void> {
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
    method: resp.type === "opaqueredirect" ? "UNKNOWN" : "HTTP",
    url: resp.url,
    responseText: text,
    responseJson: parsed,
  });
}

export async function fetchJson<T>(args: {
  url: string;
  method: "GET" | "POST";
  token: string;
  timeoutS: number;
  body?: any;
}): Promise<T> {
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

    await raiseForStatus(resp);
    return (await resp.json()) as T;
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
        // Do NOT set Content-Type here; fetch will set proper boundary for multipart.
      },
      body: args.formData,
      signal: controller.signal,
    });

    await raiseForStatus(resp);
    return (await resp.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}