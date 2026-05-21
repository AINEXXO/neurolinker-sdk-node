/* eslint-disable @typescript-eslint/no-explicit-any */

export function extractRequestUid(extractResponse: Record<string, any>): string {
  if (typeof extractResponse.request_uid === "string") return extractResponse.request_uid;

  const data = extractResponse.data;
  if (data && typeof data === "object" && typeof data.request_uid === "string") {
    return data.request_uid;
  }

  throw new Error(
    `Could not find request_uid in extract response: ${JSON.stringify(extractResponse)}`,
  );
}

export function extractDocumentIds(statusResponse: Record<string, any>): string[] {
  let documents: any = statusResponse.documents;
  if (!documents && statusResponse.data && typeof statusResponse.data === "object") {
    documents = statusResponse.data.documents;
  }
  if (!Array.isArray(documents)) return [];

  const out: string[] = [];
  for (const item of documents) {
    if (!item || typeof item !== "object") continue;
    if (typeof item.document_id === "string") out.push(item.document_id);
    else if (typeof item.id === "string") out.push(item.id);
  }
  return out;
}

export function extractStatus(response: Record<string, any>): string | undefined {
  let status: unknown = response.status;
  if (status === undefined && response.data && typeof response.data === "object") {
    status = (response.data as Record<string, unknown>).status;
  }
  return typeof status === "string" ? status : undefined;
}

export function extractionTimeoutSuffix(last: Record<string, any> | undefined): string {
  if (!last || typeof last !== "object") return "";
  let url = (last as Record<string, unknown>).job_page_url;
  if (!url) {
    const data = (last as Record<string, unknown>).data;
    if (data && typeof data === "object") {
      url = (data as Record<string, unknown>).job_page_url;
    }
  }
  return typeof url === "string" && url ? ` Job URL: ${url}` : "";
}
