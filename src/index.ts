export { NeuroLinker } from "./client.js";
export { NeuroLinkerAPIError, NeuroLinkerConfigError } from "./errors.js";

// Extraction
export {
  ContentType,
  SummaryType,
  extractDocumentIds,
  extractRequestUid,
  extractStatus,
  type EnrichmentMode,
  type DocumentUpload,
} from "./extraction/index.js";

// Chunking
export {
  BlockWindowConfig,
  ChunkingConfig,
  MdHeaderLevelConfig,
  SectionGreedyConfig,
  type BlockWindowConfigInput,
  type ChunkingConfigInput,
  type MdHeaderLevelConfigInput,
  type SectionGreedyConfigInput,
} from "./chunking/index.js";

// Embedding
export {
  Content,
  EmbeddingVector,
  type ContentInput,
  type EmbeddingVectorInput,
} from "./embedding/index.js";

// Vector store
export {
  CollectionSchema,
  Distance,
  DType,
  FieldDef,
  FieldMapping,
  VectorDBConfig,
  type CollectionSchemaInput,
  type FieldDefInput,
  type FieldMappingInput,
  type VectorDBConfigInput,
} from "./vectorStore/index.js";

// Management
export { type BucketSource } from "./management/index.js";

// Evaluation
export { type Dataset } from "./evaluation/index.js";

// Evaluation tracking — process-level instrumentation (call once at startup)
export {
  instrument,
  type InstrumentOptions,
  type TracerProviderHandle,
} from "./evaluation/tracking/instrument.js";
export { recordQuery, QueryRecorder } from "./evaluation/tracking/manual.js";
