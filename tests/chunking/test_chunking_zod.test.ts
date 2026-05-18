import { describe, expect, it } from "vitest";
import {
  BlockWindowConfig,
  ChunkingConfig,
  MdHeaderLevelConfig,
  SectionGreedyConfig,
} from "../../src/index.js";
import { toChunkingPayload } from "../../src/chunking/models.js";

describe("chunking Zod validation", () => {
  it("accepts a valid SectionGreedyConfig", () => {
    const parsed = SectionGreedyConfig.parse({
      method: "section_greedy",
      tMin: 200,
      tMax: 1500,
      modelName: "gte-large",
      parseFigures: true,
    });
    expect(parsed.method).toBe("section_greedy");
    expect(parsed.tMin).toBe(200);
  });

  it("rejects tMin not less than tMax", () => {
    expect(() =>
      SectionGreedyConfig.parse({
        method: "section_greedy",
        tMin: 100,
        tMax: 100,
      }),
    ).toThrow();
    expect(() =>
      SectionGreedyConfig.parse({
        method: "section_greedy",
        tMin: 200,
        tMax: 100,
      }),
    ).toThrow();
  });

  it("accepts a valid MdHeaderLevelConfig", () => {
    const parsed = MdHeaderLevelConfig.parse({
      method: "md_header_level",
      chunkAtLevel: 2,
    });
    expect(parsed.chunkAtLevel).toBe(2);
  });

  it("rejects chunkAtLevel out of range", () => {
    expect(() =>
      MdHeaderLevelConfig.parse({ method: "md_header_level", chunkAtLevel: 7 }),
    ).toThrow();
  });

  it("accepts a valid BlockWindowConfig with overlap", () => {
    const parsed = BlockWindowConfig.parse({
      method: "block_window",
      tMax: 1000,
      overlapBlocks: 2,
      overlapMode: "within_budget",
    });
    expect(parsed.overlapMode).toBe("within_budget");
  });

  it("rejects unknown overlapMode", () => {
    expect(() =>
      BlockWindowConfig.parse({
        method: "block_window",
        overlapMode: "weird",
      }),
    ).toThrow();
  });

  it("rejects extra fields in strict mode", () => {
    expect(() =>
      SectionGreedyConfig.parse({
        method: "section_greedy",
        unknownField: 123,
      } as never),
    ).toThrow();
  });

  it("ChunkingConfig discriminates by method", () => {
    const md = ChunkingConfig.parse({ method: "md_header_level", chunkAtLevel: 3 });
    expect(md.method).toBe("md_header_level");

    const sg = ChunkingConfig.parse({ method: "section_greedy", tMin: 100, tMax: 500 });
    expect(sg.method).toBe("section_greedy");
  });

  it("rejects unknown method on the union", () => {
    expect(() => ChunkingConfig.parse({ method: "unknown" } as never)).toThrow();
  });

  it("toChunkingPayload converts camelCase → snake_case for SectionGreedy", () => {
    const parsed = SectionGreedyConfig.parse({
      method: "section_greedy",
      tMin: 100,
      tMax: 800,
      modelName: "gte",
      parseFigures: true,
      parseTables: false,
    });
    expect(toChunkingPayload(parsed)).toEqual({
      method: "section_greedy",
      t_min: 100,
      t_max: 800,
      model_name: "gte",
      parse_figures: true,
      parse_tables: false,
    });
  });

  it("toChunkingPayload converts camelCase → snake_case for BlockWindow", () => {
    const parsed = BlockWindowConfig.parse({
      method: "block_window",
      tMax: 1000,
      overlapBlocks: 2,
      overlapMode: "extra_budget",
    });
    expect(toChunkingPayload(parsed)).toEqual({
      method: "block_window",
      t_max: 1000,
      overlap_blocks: 2,
      overlap_mode: "extra_budget",
    });
  });

  it("toChunkingPayload omits undefined fields", () => {
    const parsed = MdHeaderLevelConfig.parse({ method: "md_header_level" });
    expect(toChunkingPayload(parsed)).toEqual({ method: "md_header_level" });
  });
});
