import { describe, expect, it } from "vitest";
import {
  CollectionSchema,
  FieldDef,
  FieldMapping,
  VectorDBConfig,
} from "../../src/index.js";
import {
  toCollectionSchemaPayload,
  toFieldMappingPayload,
  toVectorDBConfigPayload,
} from "../../src/vectorStore/models.js";

describe("vector_store Zod validation", () => {
  it("FieldDef with text dtype works without dim", () => {
    const f = FieldDef.parse({ name: "content", dtype: "text" });
    expect(f.distance).toBe("cosine");
    expect(f.isPrimary).toBe(false);
    expect(f.options).toEqual({});
  });

  it("FieldDef dense_vector requires dim > 0", () => {
    expect(() =>
      FieldDef.parse({ name: "v", dtype: "dense_vector" }),
    ).toThrow();
    expect(() =>
      FieldDef.parse({ name: "v", dtype: "dense_vector", dim: 0 }),
    ).toThrow();
    const ok = FieldDef.parse({ name: "v", dtype: "dense_vector", dim: 1024 });
    expect(ok.dim).toBe(1024);
  });

  it("FieldDef rejects empty name", () => {
    expect(() => FieldDef.parse({ name: "", dtype: "text" })).toThrow();
  });

  it("FieldDef rejects unknown dtype/distance", () => {
    expect(() => FieldDef.parse({ name: "x", dtype: "weird" } as never)).toThrow();
    expect(() =>
      FieldDef.parse({ name: "x", dtype: "text", distance: "manhattan" } as never),
    ).toThrow();
  });

  it("CollectionSchema requires at least one field", () => {
    expect(() => CollectionSchema.parse({ name: "c", fields: [] })).toThrow();
  });

  it("CollectionSchema rejects duplicate field names", () => {
    expect(() =>
      CollectionSchema.parse({
        name: "c",
        fields: [
          { name: "x", dtype: "text" },
          { name: "x", dtype: "int" },
        ],
      }),
    ).toThrow();
  });

  it("CollectionSchema rejects more than one primary field", () => {
    expect(() =>
      CollectionSchema.parse({
        name: "c",
        fields: [
          { name: "a", dtype: "text", isPrimary: true },
          { name: "b", dtype: "text", isPrimary: true },
        ],
      }),
    ).toThrow();
  });

  it("VectorDBConfig requires non-empty uri and defaults timeout", () => {
    expect(() => VectorDBConfig.parse({ uri: "" })).toThrow();
    const v = VectorDBConfig.parse({ uri: "https://x.zilliz.com" });
    expect(v.timeout).toBe(300);
  });

  it("FieldMapping requires both name and source non-empty", () => {
    expect(() => FieldMapping.parse({ name: "", source: "x" })).toThrow();
    expect(() => FieldMapping.parse({ name: "x", source: "" })).toThrow();
  });

  it("toCollectionSchemaPayload converts isPrimary → is_primary", () => {
    const parsed = CollectionSchema.parse({
      name: "c",
      fields: [
        { name: "id", dtype: "text", isPrimary: true },
        { name: "v", dtype: "dense_vector", dim: 768 },
      ],
    });
    const payload = toCollectionSchemaPayload(parsed);
    expect((payload.fields as Record<string, unknown>[])[0].is_primary).toBe(true);
    expect((payload.fields as Record<string, unknown>[])[1].dim).toBe(768);
  });

  it("toVectorDBConfigPayload converts secretId → secret_id", () => {
    const parsed = VectorDBConfig.parse({
      uri: "https://x.zilliz.com",
      secretId: "sec-1",
    });
    expect(toVectorDBConfigPayload(parsed)).toEqual({
      uri: "https://x.zilliz.com",
      timeout: 300,
      secret_id: "sec-1",
    });
  });

  it("toFieldMappingPayload preserves shape", () => {
    const parsed = FieldMapping.parse({ name: "chunk_id", source: "item_id" });
    expect(toFieldMappingPayload(parsed)).toEqual({ name: "chunk_id", source: "item_id" });
  });
});
