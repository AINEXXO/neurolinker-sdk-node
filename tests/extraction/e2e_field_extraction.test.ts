import { describe, expect, it } from "vitest";
import {
  NeuroLinker,
  extractDocumentIds,
  extractRequestUid,
  extractStatus,
} from "../../src/index.js";
import { waitForTerminalStatus } from "../../src/polling.js";

const TOKEN = process.env.NEUROLINKER_API_KEY;
const PDF_URL = process.env.NEUROLINKER_TEST_PDF_URL;

// Strict: a "pending" must not satisfy the wait — we want to actually verify
// the structured payload returned by the field-extraction pipeline.
const STRICT_TERMINAL = new Set(["completed", "failed"]);

const SUPPORTED_TYPES = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "array",
  "object",
]);

// Schema aligned with the PMSS template PDF actually used in E2E.
// Three fields the document contains:
//   - title                → top heading of the document
//   - course_name          → mentioned in the footnote
//   - section_titles[].name → the visible section headings
const SAMPLE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "Main title of the document, shown at the top of the page",
    },
    course_name: {
      type: "string",
      description: "Name of the academic course this document belongs to",
    },
    section_titles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name of a top-level section in the document",
          },
        },
      },
      description: "Top-level section headings appearing in the document body",
    },
  },
  required: ["title"],
};

/**
 * Recursively assert that ``schema`` matches the subset accepted by
 * ``extractFields``. Mirrors the server-side validator without importing
 * backend internals — any deviation means the LLM produced a schema that
 * ``extractFields`` would later reject (the regression we want to catch).
 */
function assertSchemaInSupportedSubset(schema: unknown, path = "$"): void {
  expect(schema, `${path}: schema node must be an object`).toBeTypeOf("object");
  expect(schema).not.toBeNull();
  expect(Array.isArray(schema), `${path}: schema must not be an array`).toBe(false);

  const node = schema as Record<string, unknown>;
  const nodeType = node.type;
  expect(typeof nodeType, `${path}: 'type' must be a single string`).toBe("string");
  expect(SUPPORTED_TYPES.has(nodeType as string), `${path}: unsupported type ${nodeType}`).toBe(
    true,
  );

  const common = new Set(["type", "description", "enum"]);
  let allowed: Set<string>;
  if (nodeType === "object") allowed = new Set([...common, "properties", "required"]);
  else if (nodeType === "array") allowed = new Set([...common, "items"]);
  else allowed = common;

  const extras = Object.keys(node).filter((k) => !allowed.has(k));
  expect(
    extras,
    `${path}: unsupported keywords for type ${nodeType}; allowed: ${[...allowed].sort().join(",")}`,
  ).toEqual([]);

  if (nodeType === "object") {
    const properties = node.properties;
    expect(
      typeof properties === "object" &&
        properties !== null &&
        !Array.isArray(properties) &&
        Object.keys(properties as Record<string, unknown>).length > 0,
      `${path}: object schema must declare a non-empty 'properties' mapping`,
    ).toBe(true);

    const required = node.required;
    if (required !== undefined) {
      expect(Array.isArray(required), `${path}: 'required' must be a list`).toBe(true);
      const props = properties as Record<string, unknown>;
      const unknown = (required as unknown[]).filter(
        (r) => typeof r !== "string" || !(r in props),
      );
      expect(unknown, `${path}: 'required' has invalid entries: ${JSON.stringify(unknown)}`).toEqual(
        [],
      );
    }
    for (const [key, sub] of Object.entries(properties as Record<string, unknown>)) {
      assertSchemaInSupportedSubset(sub, `${path}.properties.${key}`);
    }
  } else if (nodeType === "array") {
    const items = node.items;
    expect(items, `${path}: array schema must declare 'items'`).not.toBeUndefined();
    expect(
      typeof items === "object" && items !== null && !Array.isArray(items),
      `${path}: tuple-style 'items' is not supported`,
    ).toBe(true);
    assertSchemaInSupportedSubset(items, `${path}.items`);
  }
}

/**
 * Find the first non-error extracted-fields payload from a documents.fields()
 * response. Real backend shape (verified live):
 *   { format: "fields", content: {<schema-conformant payload>}, schema_used: {...} }
 */
function pickFieldsPayload(results: unknown[]): Record<string, unknown> | undefined {
  for (const entry of results) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (e.error || e.success === false) continue;

    // Primary shape: entry.content holds the schema-conformant payload.
    const content = e.content;
    if (content && typeof content === "object" && !Array.isArray(content)) {
      return content as Record<string, unknown>;
    }
    // Fallbacks for older / alternate shapes.
    const fields = e.fields;
    if (fields && typeof fields === "object" && !Array.isArray(fields)) {
      return fields as Record<string, unknown>;
    }
    const bookkeeping = new Set([
      "document_id",
      "id",
      "success",
      "format",
      "schema_used",
      "error",
    ]);
    const candidate = Object.fromEntries(
      Object.entries(e).filter(([k]) => !bookkeeping.has(k)),
    );
    if (Object.keys(candidate).length > 0) {
      return candidate as Record<string, unknown>;
    }
  }
  return undefined;
}

describe("e2e generateSchema — strict subset check", () => {
  it.skipIf(!TOKEN)(
    "produces a JSON schema that conforms to the extractFields subset",
    { timeout: 240_000 },
    async () => {
      const client = NeuroLinker.fromEnv();
      const resp = await client.extraction.generateSchema({
        description:
          "Extract from a one-page report template: the document title (string) " +
          "and the list of top-level section headings (array of objects with a 'name' field).",
      });
      expect((resp as any).success).toBe(true);

      const schema = (resp as any).json_schema;
      expect(typeof schema, "json_schema must be an object").toBe("object");
      expect(schema).not.toBeNull();
      expect(schema.type, "root must be type 'object'").toBe("object");

      const properties = schema.properties;
      expect(
        typeof properties === "object" &&
          properties !== null &&
          Object.keys(properties).length > 0,
        "json_schema must have a non-empty 'properties' mapping",
      ).toBe(true);

      assertSchemaInSupportedSubset(schema);
      console.log(
        `[generateSchema e2e] generated ${Object.keys(properties).length} root property(ies): ` +
          Object.keys(properties).sort().join(", "),
      );
    },
  );
});

describe("e2e extractFields — full flow against real PDF", () => {
  it.skipIf(!TOKEN || !PDF_URL)(
    "submits with a PMSS-coherent schema, waits until completed, verifies the payload",
    { timeout: 600_000 },
    async () => {
      const client = NeuroLinker.fromEnv();

      const submit = await client.extraction.extractFields({
        jsonSchema: SAMPLE_SCHEMA,
        urls: [PDF_URL!],
        alias: "sdk-e2e-extract-fields-node",
      });
      const requestUid = extractRequestUid(submit);
      console.log(`[extractFields e2e] submitted request ${requestUid}`);

      const final = await waitForTerminalStatus<Record<string, unknown>>({
        fetchStatus: () => client.extraction.status.request(requestUid),
        extractStatus,
        timeoutS: 540,
        pollIntervalS: 2,
        pollMaxIntervalS: 10,
        terminalStates: STRICT_TERMINAL,
        identifier: `extractFields request ${requestUid}`,
      });
      console.log(`[extractFields e2e] final status: ${extractStatus(final)}`);
      expect(extractStatus(final)).toBe("completed");

      const docUids = extractDocumentIds(final);
      expect(docUids.length).toBeGreaterThan(0);
      console.log(`[extractFields e2e] document ids: ${docUids.join(", ")}`);

      const fieldsResp = await client.extraction.documents.fields(docUids);
      expect(typeof fieldsResp).toBe("object");
      expect((fieldsResp as any).success).toBe(true);

      const results = (fieldsResp as any).results;
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      const payload = pickFieldsPayload(results);
      expect(payload, `No usable fields payload in results: ${JSON.stringify(results)}`).not.toBe(
        undefined,
      );
      console.log(
        `[extractFields e2e] extracted payload keys: ${Object.keys(payload!).sort().join(", ")}`,
      );

      // The schema marks `title` as required; the LLM should produce a non-empty string for it.
      const title = (payload as Record<string, unknown>).title;
      expect(typeof title).toBe("string");
      expect((title as string).trim().length).toBeGreaterThan(0);
      console.log(`[extractFields e2e] extracted title: ${JSON.stringify(title)}`);
    },
  );
});
