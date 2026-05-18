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
    expect(f.distance).toBeUndefined();
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
    expect(ok.distance).toBeUndefined();
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

  it("FieldDef rejects distance on scalar and sparse_vector fields", () => {
    expect(() =>
      FieldDef.parse({ name: "x", dtype: "text", distance: "cosine" }),
    ).toThrow(/distance is only valid for dense_vector fields/);
    expect(() =>
      FieldDef.parse({ name: "s", dtype: "sparse_vector", distance: "dot" }),
    ).toThrow(/distance is only valid for dense_vector fields/);
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

  it("CollectionSchema defaults options to {}", () => {
    const c = CollectionSchema.parse({
      name: "c",
      fields: [{ name: "v", dtype: "dense_vector", dim: 8 }],
    });
    expect(c.options).toEqual({});
  });

  it("CollectionSchema accepts arbitrary options keys", () => {
    const c = CollectionSchema.parse({
      name: "c",
      fields: [{ name: "v", dtype: "dense_vector", dim: 8 }],
      options: { cloud: "aws", region: "eu-central-1" },
    });
    expect(c.options).toEqual({ cloud: "aws", region: "eu-central-1" });
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
    expect((payload.fields as Record<string, unknown>[])[0].distance).toBeUndefined();
    expect((payload.fields as Record<string, unknown>[])[1].dim).toBe(768);
    expect((payload.fields as Record<string, unknown>[])[1].distance).toBe("cosine");
  });

  it("toCollectionSchemaPayload forwards collection options", () => {
    const parsed = CollectionSchema.parse({
      name: "c",
      fields: [{ name: "v", dtype: "dense_vector", dim: 8 }],
      options: { cloud: "aws", region: "eu-central-1" },
    });
    const payload = toCollectionSchemaPayload(parsed);
    expect(payload.options).toEqual({ cloud: "aws", region: "eu-central-1" });
  });

  it("toCollectionSchemaPayload preserves explicit dense_vector distance", () => {
    const parsed = CollectionSchema.parse({
      name: "c",
      fields: [{ name: "v", dtype: "dense_vector", dim: 768, distance: "cosine" }],
    });
    const payload = toCollectionSchemaPayload(parsed);
    expect((payload.fields as Record<string, unknown>[])[0].distance).toBe("cosine");
  });

  it("toVectorDBConfigPayload converts apiKey → api_key", () => {
    const parsed = VectorDBConfig.parse({
      uri: "https://x.zilliz.com",
      apiKey: "sk-1",
    });
    expect(toVectorDBConfigPayload(parsed)).toEqual({
      uri: "https://x.zilliz.com",
      timeout: 300,
      api_key: "sk-1",
    });
  });

  it("toFieldMappingPayload preserves shape", () => {
    const parsed = FieldMapping.parse({ name: "chunk_id", source: "item_id" });
    expect(toFieldMappingPayload(parsed)).toEqual({ name: "chunk_id", source: "item_id" });
  });
});
