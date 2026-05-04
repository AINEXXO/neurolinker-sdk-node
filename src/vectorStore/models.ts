import { z } from "zod";

export const DType = z.enum([
  "text",
  "int",
  "float",
  "bool",
  "json",
  "dense_vector",
  "sparse_vector",
]);
export type DType = z.infer<typeof DType>;

export const Distance = z.enum(["cosine", "dot", "euclidean"]);
export type Distance = z.infer<typeof Distance>;

export const FieldDef = z
  .object({
    name: z.string().min(1, "Field name cannot be empty"),
    dtype: DType,
    dim: z.number().int().min(1).optional(),
    distance: Distance.default("cosine"),
    isPrimary: z.boolean().default(false),
    options: z.record(z.unknown()).default({}),
  })
  .strict()
  .superRefine((field, ctx) => {
    if (field.dtype === "dense_vector" && (field.dim === undefined || field.dim <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Field '${field.name}': dense_vector requires dim > 0`,
      });
    }
  });

export const CollectionSchema = z
  .object({
    name: z.string().min(1, "Collection name cannot be empty"),
    fields: z.array(FieldDef).min(1),
    description: z.string().default(""),
  })
  .strict()
  .superRefine((coll, ctx) => {
    const names = coll.fields.map((f) => f.name);
    if (new Set(names).size !== names.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duplicate field names in collection",
      });
    }
    const primaries = coll.fields.filter((f) => f.isPrimary);
    if (primaries.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Collection can have at most one primary key field",
      });
    }
  });

export const VectorDBConfig = z
  .object({
    uri: z.string().min(1, "uri cannot be empty"),
    secretId: z.string().optional(),
    timeout: z.number().int().default(300),
  })
  .strict();

export const FieldMapping = z
  .object({
    name: z.string().min(1, "must be a non-empty string"),
    source: z.string().min(1, "must be a non-empty string"),
  })
  .strict();

export type FieldDefInput = z.input<typeof FieldDef>;
export type CollectionSchemaInput = z.input<typeof CollectionSchema>;
export type VectorDBConfigInput = z.input<typeof VectorDBConfig>;
export type FieldMappingInput = z.input<typeof FieldMapping>;

export function toFieldDefPayload(f: z.infer<typeof FieldDef>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: f.name,
    dtype: f.dtype,
    distance: f.distance,
    is_primary: f.isPrimary,
    options: f.options,
  };
  if (f.dim !== undefined) out.dim = f.dim;
  return out;
}

export function toCollectionSchemaPayload(
  parsed: z.infer<typeof CollectionSchema>,
): Record<string, unknown> {
  return {
    name: parsed.name,
    fields: parsed.fields.map(toFieldDefPayload),
    description: parsed.description,
  };
}

export function toVectorDBConfigPayload(
  parsed: z.infer<typeof VectorDBConfig>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    uri: parsed.uri,
    timeout: parsed.timeout,
  };
  if (parsed.secretId !== undefined) out.secret_id = parsed.secretId;
  return out;
}

export function toFieldMappingPayload(
  parsed: z.infer<typeof FieldMapping>,
): Record<string, unknown> {
  return { name: parsed.name, source: parsed.source };
}
