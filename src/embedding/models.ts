import { z } from "zod";

const RESERVED_VECTOR_PREFIXES = ["item_", "chunk_"] as const;
const ALLOWED_INPUTS_BY_CONTENT_TYPE = {
  text: new Set(["content", "header_path"]),
  image: new Set(["description", "extracted_text", "image_base64", "legend", "header_path"]),
  table: new Set(["content", "description", "data", "legend", "header_path"]),
} as const;

export const EmbeddingVector = z
  .object({
    vectorType: z.enum(["dense", "sparse"]),
    fieldName: z.string().refine((v) => {
      for (const reserved of RESERVED_VECTOR_PREFIXES) {
        if (v.startsWith(reserved)) return false;
      }
      return true;
    }, `fieldName cannot start with reserved prefixes (${RESERVED_VECTOR_PREFIXES.join(", ")})`),
    modelName: z.string(),
    apiKey: z.string().optional(),
  })
  .strict();

export const Content = z
  .object({
    contentType: z.enum(["text", "image", "table"]),
    inputs: z.array(z.string()),
    vectors: z.array(EmbeddingVector).min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    const allowed = ALLOWED_INPUTS_BY_CONTENT_TYPE[value.contentType];
    for (const input of value.inputs) {
      if (!allowed.has(input as never)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["inputs"],
          message: `Invalid input '${input}' for contentType '${value.contentType}'. Allowed inputs: ${Array.from(allowed).join(", ")}`,
        });
      }
    }
  });

export type EmbeddingVectorInput = z.input<typeof EmbeddingVector>;
export type ContentInput = z.input<typeof Content>;

function embeddingVectorToPayload(parsed: z.infer<typeof EmbeddingVector>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    vector_type: parsed.vectorType,
    field_name: parsed.fieldName,
    model_name: parsed.modelName,
  };
  if (parsed.apiKey !== undefined) out.api_key = parsed.apiKey;
  return out;
}

export function contentToPayload(parsed: z.infer<typeof Content>): Record<string, unknown> {
  return {
    content_type: parsed.contentType,
    inputs: parsed.inputs,
    vectors: parsed.vectors.map(embeddingVectorToPayload),
  };
}
