import { ChunkingModule } from "./chunking/module.js";
import {
  DEFAULT_BASE_URL,
  DEFAULT_POLL_INTERVAL_S,
  DEFAULT_POLL_MAX_INTERVAL_S,
  DEFAULT_TIMEOUT_S,
  configFromEnv,
} from "./config.js";
import { EmbeddingModule } from "./embedding/module.js";
import { ExtractionModule } from "./extraction/module.js";
import { ManagementModule } from "./management/module.js";
import { VectorStoreModule } from "./vectorStore/module.js";

export class NeuroLinker {
  public readonly extraction: ExtractionModule;
  public readonly chunking: ChunkingModule;
  public readonly embedding: EmbeddingModule;
  public readonly management: ManagementModule;
  public readonly vectorStore: VectorStoreModule;

  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutS: number;
  private readonly pollIntervalS: number;
  private readonly pollMaxIntervalS: number;

  constructor(args: {
    token: string;
    baseUrl?: string;
    timeoutS?: number;
    pollIntervalS?: number;
    pollMaxIntervalS?: number;
  }) {
    this.baseUrl = (args.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.token = args.token;
    this.timeoutS = args.timeoutS ?? DEFAULT_TIMEOUT_S;
    this.pollIntervalS = args.pollIntervalS ?? DEFAULT_POLL_INTERVAL_S;
    this.pollMaxIntervalS = args.pollMaxIntervalS ?? DEFAULT_POLL_MAX_INTERVAL_S;

    const moduleArgs = {
      baseUrl: this.baseUrl,
      token: this.token,
      timeoutS: this.timeoutS,
      pollIntervalS: this.pollIntervalS,
      pollMaxIntervalS: this.pollMaxIntervalS,
    };

    this.extraction = new ExtractionModule(moduleArgs);
    this.chunking = new ChunkingModule(moduleArgs);
    this.embedding = new EmbeddingModule(moduleArgs);
    this.management = new ManagementModule({
      baseUrl: this.baseUrl,
      token: this.token,
      timeoutS: this.timeoutS,
    });
    this.vectorStore = new VectorStoreModule(moduleArgs);
  }

  static fromEnv(overrides?: {
    timeoutS?: number;
    pollIntervalS?: number;
    pollMaxIntervalS?: number;
  }): NeuroLinker {
    const cfg = configFromEnv();
    return new NeuroLinker({
      token: cfg.token,
      baseUrl: cfg.baseUrl,
      timeoutS: overrides?.timeoutS ?? cfg.timeoutS,
      pollIntervalS: overrides?.pollIntervalS ?? cfg.pollIntervalS,
      pollMaxIntervalS: overrides?.pollMaxIntervalS ?? cfg.pollMaxIntervalS,
    });
  }
}
