import { z } from "zod";

const commonChunkingOptions = {
  modelName: z.string().optional(),
  parseFigures: z.boolean().optional(),
  parseTables: z.boolean().optional(),
  parseHeaders: z.boolean().optional(),
  parseFooters: z.boolean().optional(),
};

export const SectionGreedyConfig = z
  .object({
    method: z.literal("section_greedy"),
    tMin: z.number().int().min(1).optional(),
    tMax: z.number().int().min(1).optional(),
    ...commonChunkingOptions,
  })
  .strict();

export const MdHeaderLevelConfig = z
  .object({
    method: z.literal("md_header_level"),
    chunkAtLevel: z.number().int().min(1).max(6).optional(),
    ...commonChunkingOptions,
  })
  .strict();

export const BlockWindowConfig = z
  .object({
    method: z.literal("block_window"),
    tMax: z.number().int().min(1).optional(),
    overlapBlocks: z.number().int().min(0).optional(),
    overlapMode: z.enum(["within_budget", "extra_budget"]).optional(),
    ...commonChunkingOptions,
  })
  .strict();

export const ChunkingConfig = z.discriminatedUnion("method", [
  SectionGreedyConfig,
  MdHeaderLevelConfig,
  BlockWindowConfig,
]);

export type SectionGreedyConfigInput = z.input<typeof SectionGreedyConfig>;
export type MdHeaderLevelConfigInput = z.input<typeof MdHeaderLevelConfig>;
export type BlockWindowConfigInput = z.input<typeof BlockWindowConfig>;
export type ChunkingConfigInput = z.input<typeof ChunkingConfig>;

type CommonPayload = {
  model_name?: string;
  parse_figures?: boolean;
  parse_tables?: boolean;
  parse_headers?: boolean;
  parse_footers?: boolean;
};

function commonToPayload(parsed: {
  modelName?: string;
  parseFigures?: boolean;
  parseTables?: boolean;
  parseHeaders?: boolean;
  parseFooters?: boolean;
}): CommonPayload {
  const out: CommonPayload = {};
  if (parsed.modelName !== undefined) out.model_name = parsed.modelName;
  if (parsed.parseFigures !== undefined) out.parse_figures = parsed.parseFigures;
  if (parsed.parseTables !== undefined) out.parse_tables = parsed.parseTables;
  if (parsed.parseHeaders !== undefined) out.parse_headers = parsed.parseHeaders;
  if (parsed.parseFooters !== undefined) out.parse_footers = parsed.parseFooters;
  return out;
}

export function toChunkingPayload(
  parsed: z.infer<typeof ChunkingConfig>,
): Record<string, unknown> {
  const common = commonToPayload(parsed);
  switch (parsed.method) {
    case "section_greedy": {
      const out: Record<string, unknown> = { method: "section_greedy", ...common };
      if (parsed.tMin !== undefined) out.t_min = parsed.tMin;
      if (parsed.tMax !== undefined) out.t_max = parsed.tMax;
      return out;
    }
    case "md_header_level": {
      const out: Record<string, unknown> = { method: "md_header_level", ...common };
      if (parsed.chunkAtLevel !== undefined) out.chunk_at_level = parsed.chunkAtLevel;
      return out;
    }
    case "block_window": {
      const out: Record<string, unknown> = { method: "block_window", ...common };
      if (parsed.tMax !== undefined) out.t_max = parsed.tMax;
      if (parsed.overlapBlocks !== undefined) out.overlap_blocks = parsed.overlapBlocks;
      if (parsed.overlapMode !== undefined) out.overlap_mode = parsed.overlapMode;
      return out;
    }
  }
}
