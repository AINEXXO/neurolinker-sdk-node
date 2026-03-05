// tests/e2e_helpers.ts
import { readFile } from "node:fs/promises";
import { NeuroLinker } from "../src/client.js";

export const TOKEN = process.env.NEUROLINKER_API_KEY;
export const PDF_URL = process.env.NEUROLINKER_TEST_PDF_URL;

export const PDF_PATHS_RAW = (process.env.NEUROLINKER_TEST_PDF_PATHS || "").trim();
export const PDF_PATH_SINGLE = (process.env.NEUROLINKER_TEST_PDF_PATH || "").trim();

export const E2E_TIMEOUT_S = Number(process.env.NEUROLINKER_E2E_TIMEOUT_S || "600");
export const POLL_INTERVAL_S = Number(process.env.NEUROLINKER_E2E_POLL_INTERVAL_S || "2");
export const POLL_MAX_INTERVAL_S = Number(process.env.NEUROLINKER_E2E_POLL_MAX_INTERVAL_S || "10");

export function getPdfPaths(): string[] {
  if (PDF_PATHS_RAW) {
    return PDF_PATHS_RAW.split(",").map((p) => p.trim()).filter(Boolean);
  }
  if (PDF_PATH_SINGLE) return [PDF_PATH_SINGLE];
  return [];
}

export async function readDocumentsFromDisk(paths: string[]) {
  const docs: Array<{ filename: string; content: Buffer }> = [];
  for (const p of paths) {
    const content = await readFile(p);
    const filename = p.split("/").pop() || "document.pdf";
    docs.push({ filename, content });
  }
  return docs;
}

export function assertDocumentsResultsSchema(payload: any) {
  if (!payload || typeof payload !== "object") {
    throw new Error(`Expected payload to be an object, got: ${typeof payload}`);
  }
  if (!("success" in payload)) throw new Error("Expected 'success' in payload");
  if (!("results" in payload)) throw new Error("Expected 'results' in payload");
  if (!Array.isArray(payload.results)) throw new Error("Expected 'results' to be an array");
}

export function extractRequestUid(extractResponse: any): string {
  // Mirror Python: accept top-level request_uid or nested data.request_uid :contentReference[oaicite:8]{index=8}
  if (typeof extractResponse?.request_uid === "string") return extractResponse.request_uid;
  if (typeof extractResponse?.data?.request_uid === "string") return extractResponse.data.request_uid;
  throw new Error(`Could not find request_uid in extract response: ${JSON.stringify(extractResponse)}`);
}

export function extractDocumentIdsFromRequestStatus(statusResponse: any): string[] {
  // Mirror Python logic :contentReference[oaicite:9]{index=9}
  let documents = statusResponse?.documents;
  if (!documents && statusResponse?.data && typeof statusResponse.data === "object") {
    documents = statusResponse.data.documents;
  }
  if (!Array.isArray(documents)) return [];

  const out: string[] = [];
  for (const d of documents) {
    if (!d || typeof d !== "object") continue;
    if (typeof d.document_id === "string") out.push(d.document_id);
    else if (typeof d.id === "string") out.push(d.id);
  }
  return out;
}

// Optional: build a client with env-driven defaults similar to Python tests
export function buildClientFromEnv() {
  return NeuroLinker.fromEnv({
    timeoutS: E2E_TIMEOUT_S,
    pollIntervalS: POLL_INTERVAL_S,
    pollMaxIntervalS: POLL_MAX_INTERVAL_S,
  });
}