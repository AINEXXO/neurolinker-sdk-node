import { describe, expect, it } from "vitest";
import { Content, EmbeddingVector } from "../../src/index.js";
import { contentToPayload } from "../../src/embedding/models.js";

describe("embedding Zod validation", () => {
  it("EmbeddingVector rejects unknown fields", () => {
    expect(() =>
      EmbeddingVector.parse({
        vectorType: "dense",
        fieldName: "text_dense_voyage",
        modelName: "voyage/voyage-3.5",
        apiKey: "pa-123",
        input_type: "document",
      } as never),
    ).toThrow();
  });

  it("EmbeddingVector rejects fieldName starting with item_/chunk_", () => {
    expect(() =>
      EmbeddingVector.parse({
        vectorType: "dense",
        fieldName: "item_test",
        modelName: "ainexxo-bge-m3",
      }),
    ).toThrow();
    expect(() =>
      EmbeddingVector.parse({
        vectorType: "dense",
        fieldName: "chunk_test",
        modelName: "ainexxo-bge-m3",
      }),
    ).toThrow();
  });

  it("Content accepts valid text/image/table inputs", () => {
    const text = Content.parse({
      contentType: "text",
      inputs: ["content", "header_path"],
      vectors: [
        {
          vectorType: "dense",
          fieldName: "text_dense",
          modelName: "ainexxo-bge-m3",
        },
      ],
    });
    const image = Content.parse({
      contentType: "image",
      inputs: ["image_base64", "description", "legend"],
      vectors: [
        {
          vectorType: "dense",
          fieldName: "image_dense",
          modelName: "jina_ai/jina-embeddings-v4",
          apiKey: "jina-key",
        },
      ],
    });
    const table = Content.parse({
      contentType: "table",
      inputs: ["content", "description", "data"],
      vectors: [
        {
          vectorType: "dense",
          fieldName: "table_dense",
          modelName: "text-embedding-3-small",
          apiKey: "sk-key",
        },
      ],
    });
    expect(text.contentType).toBe("text");
    expect(image.contentType).toBe("image");
    expect(table.contentType).toBe("table");
  });

  it("Content rejects invalid inputs for contentType", () => {
    expect(() =>
      Content.parse({
        contentType: "text",
        inputs: ["image_base64"],
        vectors: [
          {
            vectorType: "dense",
            fieldName: "text_dense",
            modelName: "ainexxo-bge-m3",
          },
        ],
      }),
    ).toThrow(/Invalid input/);
  });

  it("Content rejects empty vectors list", () => {
    expect(() =>
      Content.parse({
        contentType: "text",
        inputs: ["content"],
        vectors: [],
      }),
    ).toThrow();
  });

  it("Content accepts a vector list", () => {
    const content = Content.parse({
      contentType: "text",
      inputs: ["content"],
      vectors: [
        {
          vectorType: "dense",
          fieldName: "text_dense_a",
          modelName: "ainexxo-bge-m3",
        },
        {
          vectorType: "sparse",
          fieldName: "text_sparse_b",
          modelName: "ainexxo-splade",
        },
      ],
    });
    expect(Array.isArray(content.vectors)).toBe(true);
  });

  it("contentToPayload converts camelCase to snake_case", () => {
    const parsed = Content.parse({
      contentType: "text",
      inputs: ["content"],
      vectors: [
        {
          vectorType: "dense",
          fieldName: "text_dense",
          modelName: "voyage/voyage-3.5",
          apiKey: "pa-123",
        },
        {
          vectorType: "sparse",
          fieldName: "text_sparse",
          modelName: "ainexxo-splade",
        },
      ],
    });
    expect(contentToPayload(parsed)).toEqual({
      content_type: "text",
      inputs: ["content"],
      vectors: [
        {
          vector_type: "dense",
          field_name: "text_dense",
          model_name: "voyage/voyage-3.5",
          api_key: "pa-123",
        },
        {
          vector_type: "sparse",
          field_name: "text_sparse",
          model_name: "ainexxo-splade",
        },
      ],
    });
  });
});
