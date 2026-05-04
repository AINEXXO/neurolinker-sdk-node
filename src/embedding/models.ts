import { z } from "zod";

const RESERVED_VECTOR_PREFIXES = ["item_", "chunk_"] as const;

export const ModelRef = z
  .object({
    endpoint: z
      .string()
      .refine(
        (v) => v.startsWith("http://") || v.startsWith("https://"),
        "endpoint must be a valid URL starting with http:// or https://",
      ),
    modelName: z.string(),
    secretId: z.string().optional(),
  })
  .passthrough();

export const VectorConfig = z
  .object({
    vectorName: z.string().refine((v) => {
      for (const reserved of RESERVED_VECTOR_PREFIXES) {
        if (v.startsWith(reserved)) return false;
      }
      return true;
    }, `vectorName cannot start with reserved prefixes (${RESERVED_VECTOR_PREFIXES.join(", ")})`),
    model: ModelRef,
    inputs: z.array(z.string()).default([]),
  })
  .strict();

const VectorConfigOrList = z.union([VectorConfig, z.array(VectorConfig)]);

export const ModalityVectors = z
  .object({
    dense: VectorConfigOrList.optional(),
    sparse: VectorConfigOrList.optional(),
  })
  .strict();

export const TextModality = z.object({ vectors: ModalityVectors }).strict();
export const ImageModality = z.object({ vectors: ModalityVectors }).strict();
export const TableModality = z.object({ vectors: ModalityVectors }).strict();

export const EmbeddingModalities = z
  .object({
    text: TextModality.optional(),
    image: ImageModality.optional(),
    table: TableModality.optional(),
  })
  .strict();

export type ModelRefInput = z.input<typeof ModelRef>;
export type VectorConfigInput = z.input<typeof VectorConfig>;
export type ModalityVectorsInput = z.input<typeof ModalityVectors>;
export type TextModalityInput = z.input<typeof TextModality>;
export type ImageModalityInput = z.input<typeof ImageModality>;
export type TableModalityInput = z.input<typeof TableModality>;
export type EmbeddingModalitiesInput = z.input<typeof EmbeddingModalities>;

function modelRefToPayload(parsed: z.infer<typeof ModelRef>): Record<string, unknown> {
  // ModelRef is passthrough: keep extra keys as-is, rename only the known camelCase fields.
  const { endpoint, modelName, secretId, ...rest } = parsed;
  const out: Record<string, unknown> = { ...rest, endpoint, model_name: modelName };
  if (secretId !== undefined) out.secret_id = secretId;
  return out;
}

function vectorConfigToPayload(parsed: z.infer<typeof VectorConfig>): Record<string, unknown> {
  return {
    vector_name: parsed.vectorName,
    model: modelRefToPayload(parsed.model),
    inputs: parsed.inputs ?? [],
  };
}

function vectorOrListToPayload(
  v: z.infer<typeof VectorConfig> | z.infer<typeof VectorConfig>[],
): Record<string, unknown> | Record<string, unknown>[] {
  if (Array.isArray(v)) return v.map(vectorConfigToPayload);
  return vectorConfigToPayload(v);
}

function modalityVectorsToPayload(
  parsed: z.infer<typeof ModalityVectors>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (parsed.dense !== undefined) out.dense = vectorOrListToPayload(parsed.dense);
  if (parsed.sparse !== undefined) out.sparse = vectorOrListToPayload(parsed.sparse);
  return out;
}

export function toEmbeddingModalitiesPayload(
  parsed: z.infer<typeof EmbeddingModalities>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (parsed.text !== undefined) out.text = { vectors: modalityVectorsToPayload(parsed.text.vectors) };
  if (parsed.image !== undefined) out.image = { vectors: modalityVectorsToPayload(parsed.image.vectors) };
  if (parsed.table !== undefined) out.table = { vectors: modalityVectorsToPayload(parsed.table.vectors) };
  return out;
}
