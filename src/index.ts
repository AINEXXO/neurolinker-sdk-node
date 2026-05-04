export { NeuroLinker } from "./client.js";
export { NeuroLinkerAPIError, NeuroLinkerConfigError } from "./errors.js";

// Extraction
export {
  ContentType,
  SummaryType,
  extractDocumentIds,
  extractRequestUid,
  extractStatus,
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
  EmbeddingModalities,
  ImageModality,
  ModalityVectors,
  ModelRef,
  TableModality,
  TextModality,
  VectorConfig,
  type EmbeddingModalitiesInput,
  type ImageModalityInput,
  type ModalityVectorsInput,
  type ModelRefInput,
  type TableModalityInput,
  type TextModalityInput,
  type VectorConfigInput,
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
