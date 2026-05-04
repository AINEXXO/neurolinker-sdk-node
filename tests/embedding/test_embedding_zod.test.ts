import { describe, expect, it } from "vitest";
import {
  EmbeddingModalities,
  ModelRef,
  VectorConfig,
} from "../../src/index.js";
import { toEmbeddingModalitiesPayload } from "../../src/embedding/models.js";

describe("embedding Zod validation", () => {
  it("ModelRef accepts http(s) endpoints and passes through extras", () => {
    const m = ModelRef.parse({
      endpoint: "https://api.voyageai.com/v1/embeddings",
      modelName: "voyage-3",
      input_type: "document",
    } as never);
    expect(m.endpoint).toBe("https://api.voyageai.com/v1/embeddings");
    expect(m.modelName).toBe("voyage-3");
    expect((m as Record<string, unknown>).input_type).toBe("document");
  });

  it("ModelRef rejects non-http endpoints", () => {
    expect(() =>
      ModelRef.parse({ endpoint: "ftp://example.com", modelName: "x" }),
    ).toThrow();
  });

  it("VectorConfig rejects vectorName starting with item_/chunk_", () => {
    const model = { endpoint: "https://example.com", modelName: "m" };
    expect(() =>
      VectorConfig.parse({ vectorName: "item_test", model, inputs: [] }),
    ).toThrow();
    expect(() =>
      VectorConfig.parse({ vectorName: "chunk_x", model, inputs: [] }),
    ).toThrow();
  });

  it("VectorConfig defaults inputs to []", () => {
    const v = VectorConfig.parse({
      vectorName: "text_dense",
      model: { endpoint: "https://example.com", modelName: "m" },
    });
    expect(v.inputs).toEqual([]);
  });

  it("EmbeddingModalities accepts text/image/table independently", () => {
    const m = EmbeddingModalities.parse({
      text: {
        vectors: {
          dense: {
            vectorName: "text_dense",
            model: { endpoint: "https://example.com", modelName: "m" },
            inputs: ["content"],
          },
        },
      },
    });
    expect(m.text?.vectors.dense).toBeDefined();
    expect(m.image).toBeUndefined();
  });

  it("ModalityVectors accepts a list of VectorConfig in dense/sparse", () => {
    const m = EmbeddingModalities.parse({
      text: {
        vectors: {
          dense: [
            {
              vectorName: "text_dense_a",
              model: { endpoint: "https://a.example", modelName: "m" },
              inputs: ["content"],
            },
            {
              vectorName: "text_dense_b",
              model: { endpoint: "https://b.example", modelName: "m" },
              inputs: ["caption"],
            },
          ],
        },
      },
    });
    expect(Array.isArray(m.text?.vectors.dense)).toBe(true);
  });

  it("toEmbeddingModalitiesPayload converts camelCase → snake_case", () => {
    const parsed = EmbeddingModalities.parse({
      text: {
        vectors: {
          dense: {
            vectorName: "text_dense",
            model: {
              endpoint: "https://example.com",
              modelName: "m",
              secretId: "sec-1",
            },
            inputs: ["content"],
          },
          sparse: {
            vectorName: "text_sparse",
            model: { endpoint: "https://example.com", modelName: "m", secretId: "sec-2" },
            inputs: ["content"],
          },
        },
      },
    });
    expect(toEmbeddingModalitiesPayload(parsed)).toEqual({
      text: {
        vectors: {
          dense: {
            vector_name: "text_dense",
            model: {
              endpoint: "https://example.com",
              model_name: "m",
              secret_id: "sec-1",
            },
            inputs: ["content"],
          },
          sparse: {
            vector_name: "text_sparse",
            model: { endpoint: "https://example.com", model_name: "m", secret_id: "sec-2" },
            inputs: ["content"],
          },
        },
      },
    });
  });

  it("toEmbeddingModalitiesPayload preserves passthrough extras on ModelRef", () => {
    const parsed = EmbeddingModalities.parse({
      text: {
        vectors: {
          dense: {
            vectorName: "text_dense",
            model: {
              endpoint: "https://api.voyageai.com",
              modelName: "voyage-3",
              input_type: "document",
            },
            inputs: ["content"],
          },
        },
      },
    } as never);
    const payload = toEmbeddingModalitiesPayload(parsed);
    expect(
      ((payload as any).text.vectors.dense.model as Record<string, unknown>).input_type,
    ).toBe("document");
  });
});
