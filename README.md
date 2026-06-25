# neurolinker-sdk

NeuroLinker is a document intelligence service by Ainexxo S.R.L. that automates the full ingestion pipeline for RAG applications — from PDF extraction to vector-store loading. This SDK is the official Node.js / TypeScript client for the NeuroLinker API: it provides an async client for the complete pipeline (extraction full and field-based, bucket management, chunking, embedding, and vector-store loading), plus RAG evaluation with Ragas metrics (one-shot batch and continuous tracking).

## Table of contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Pipeline overview](#pipeline-overview)
- [Client](#client)
- [Extraction](#extraction)
- [Management](#management)
- [Chunking](#chunking)
- [Embedding](#embedding)
- [Vector Store](#vector-store)
- [Evaluation](#evaluation)
- [End-to-end pipeline](#end-to-end-pipeline)
- [Error handling](#error-handling)
- [Support](#support)
- [License](#license)

## Installation

```bash
npm install neurolinker-sdk
```

Requires Node.js 18+.

## Quick start

Get your API key at https://neurolinker.ainexxo.com — login → API KEY section.

```bash
export NEUROLINKER_API_KEY="your_token"
```

Or store it in a `.env` file at the project root — load it once at startup and `NeuroLinker.fromEnv()` picks it up automatically:

```ts
import "dotenv/config"; // reads .env into process.env
```

**Async (ESM)**

```ts
import { NeuroLinker, extractRequestUid, extractDocumentIds } from "neurolinker-sdk";
import "dotenv/config";

async function main() {
  const client = NeuroLinker.fromEnv();

  // Submit a PDF for extraction
  const response = await client.extraction.extract({ urls: ["https://example.com/your-doc.pdf"] });
  const requestUid = extractRequestUid(response);

  // Wait for completion (the SDK polls until the job reaches a terminal state)
  const status = await client.extraction.waitForRequest(requestUid);
  const docIds = extractDocumentIds(status);

  // Fetch the extracted content
  const docs = await client.extraction.documents.json(docIds);
  console.log(docs);
}

main();
```

The same flow works in CommonJS — replace `import` with `require("neurolinker-sdk")`.

## Pipeline overview

The ingestion modules are designed to compose end-to-end. A typical RAG ingestion run goes through them in order:

```
   PDF (URL or upload)
        │
        ▼
  ┌──────────────┐
  │  extraction  │   text, structured layout, sections, summaries
  └──────────────┘
        │
        ▼
  ┌──────────────┐
  │  management  │   create a bucket and attach the extracted documents
  └──────────────┘
        │
        ▼
  ┌──────────────┐
  │   chunking   │   split documents into retrieval-sized chunks
  └──────────────┘
        │
        ▼
  ┌──────────────┐
  │  embedding   │   compute dense / sparse vectors for each chunk
  └──────────────┘
        │
        ▼
  ┌──────────────┐
  │ vectorStore  │   upsert into your vector database collection
  └──────────────┘
```

Two concepts to keep in mind:

- A **bucket** is the persistent container that holds extracted documents for the downstream pipeline. Chunking, embedding and vector-store jobs all read from a `bucket_uid`, never directly from extraction request UIDs. Create one with `management.buckets.create`, then attach extraction outputs with `management.buckets.addSources`.
- Each module is **independent** — you don't have to run the full pipeline.

## Client

### Constructors

- `new NeuroLinker({ token, baseUrl?, timeoutS?, pollIntervalS?, pollMaxIntervalS? })`
Async client. `token` is required; `baseUrl` defaults to `https://neurolinker.api.ainexxo.com`. Default values: `timeoutS=600`, `pollIntervalS=2`, `pollMaxIntervalS=10`.

- `NeuroLinker.fromEnv({ timeoutS?, pollIntervalS?, pollMaxIntervalS? })`
Loads `NEUROLINKER_API_KEY` from the environment. If present, `NEUROLINKER_BASE_URL`, `NEUROLINKER_E2E_TIMEOUT_S`, `NEUROLINKER_E2E_POLL_INTERVAL_S`, and `NEUROLINKER_E2E_POLL_MAX_INTERVAL_S` are also read; explicit overrides passed to `fromEnv(...)` win over env vars.

The SDK is async-only — every method returns a `Promise`.

### Modules

The SDK groups the API into six modules reachable as attributes on the client:

| Module | Purpose |
|---|---|
| `extraction` | PDF extraction — full and field-based |
| `management` | Bucket CRUD |
| `chunking` | Chunking jobs |
| `embedding` | Embedding jobs |
| `vectorStore` | Vector-store collections and load jobs |
| `evaluation` | RAG evaluation — one-shot batch (`.oneshot`) + continuous tracking (`.tracking`) |

## Extraction

PDF processing — full extraction or schema-based field extraction. The two pipelines are independent: pick one per document depending on what you want as output.

| Method | When to use it | Output |
|---|---|---|
| `extraction.extract(...)` | You want the full document content for downstream pipelines (RAG, search, chunking) | Markdown, structured JSON, per-page images, page/section summaries |
| `extraction.extractFields(...)` | You only need a structured payload that conforms to a JSON Schema you supply (invoices, forms, contracts) | A JSON object matching your schema, retrievable via `documents.fields(...)` |

Both reserve credits at submit time on a per-page basis (see the platform documentation for pricing).

- `client.extraction.extract({ documents?, urls?, alias?, description?, enrichmentMode? })`
Submit a full-extraction job. Provide **either** `documents: [{ filename: "file.pdf", content: <Buffer> }]` (local PDF) **or** `urls: ["https://..."]` (PDF URLs). The two are mutually exclusive — exactly one is required. Optional `enrichmentMode` is `"base"` (Picture/Table get description only) or `"turbo"` (description + `extracted_text` + `legend` with neighbouring-page context). Omit to use the backend default.

- `client.extraction.extractFields({ jsonSchema, documents?, urls?, alias?, description? })`
Submit a field-extraction job. `jsonSchema` is required and must follow JSON Schema Draft 7 (supported subset). Provide **either** `documents: [{ filename: "file.pdf", content: <Buffer> }]` (local PDFs) **or** `urls: ["https://..."]` (PDF URLs). Same XOR rule as `extract`. Example:

```ts
await client.extraction.extractFields({
  jsonSchema: {
    type: "object",
    properties: {
      invoice_number: { type: "string" },
      issue_date: { type: "string", description: "ISO date (YYYY-MM-DD)" },
      total_amount: { type: "number" },
      line_items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            quantity: { type: "integer" },
            unit_price: { type: "number" },
          },
        },
      },
    },
    required: ["invoice_number", "total_amount"],
  },
  urls: ["https://example.com/invoice.pdf"],
});
```

After completion, retrieve the extracted fields via `client.extraction.documents.fields(documentIds)`.

- `client.extraction.generateSchema({ description })`
Generate a JSON Schema from a natural-language description — the returned schema is ready to be passed to `extractFields`. Example: `{ description: "Extract invoice number, issue date, and total amount from an invoice" }`.

- `client.extraction.listTasks()`
List the processing tasks available in the system.

- `client.extraction.status.request(requestId)`
Check the status of an extraction request by request UID.

- `client.extraction.status.document(documentId)`
Check the status of a single document by document UID.

- `client.extraction.waitForRequest(requestUid, { timeoutS?, pollIntervalS?, pollMaxIntervalS? })`
Polling helper that waits for terminal status (`completed`, `failed`, `pending`), handling transient `404` during early processing. Per-call overrides for timeout / poll cadence.

- `client.extraction.documents.markdown(documentIds, { contentTypes? })`
Retrieve markdown payloads for the given document IDs. `contentTypes` accepts `ContentType` enum values or strings.

- `client.extraction.documents.json(documentIds, { contentTypes? })`
Retrieve structured JSON payloads, with optional content-type filtering.

- `client.extraction.documents.images(documentIds)`
Retrieve extracted image metadata (signed URLs).

- `client.extraction.documents.pageSummaries(documentIds)`
Retrieve per-page summaries.

- `client.extraction.documents.sectionSummaries(documentIds)`
Retrieve summaries grouped by detected sections.

- `client.extraction.documents.documentSummary(documentIds, { summaryType: "page" | "section" })`
Retrieve a single consolidated summary. `summaryType` is required.

- `client.extraction.documents.fields(documentIds)`
Retrieve the structured fields payload for documents processed via `extractFields`. Returns an error entry for documents processed via full extraction.

- `client.extraction.makeZip({ jobUid, documentUid?, localImages?, contentTypes? })`
Request a ZIP archive for a completed extraction job (entire job or a single document). With `localImages: true`, JSON/Markdown references are rewritten to local relative image paths. `contentTypes` (e.g. `["text"]`) filters JSON/Markdown content included in the ZIP.

### Filtering content

Some retrieval methods accept an optional filter to keep only specific kinds of content or summary granularity. Two enums are exported from the top-level package and can be passed as values or as plain strings.

- `ContentType` — used by `documents.markdown`, `documents.json`, and `makeZip` to filter which content kinds are returned:
  - `TEXT` — paragraphs and prose
  - `FORMULA` — math formulas
  - `TABLES` — extracted tables
  - `IMAGES` — extracted figures

  Omit `contentTypes` (default `undefined`) to get the full document with every content type. Pass a list (e.g. `contentTypes: [ContentType.TEXT]`) to keep only the kinds you need — useful for trimming payloads in RAG pipelines.

- `SummaryType` — used by `documents.documentSummary` to select granularity: `PAGE` for per-page summaries, `SECTION` for per-section summaries.

## Management

CRUD for **buckets**, the persistent containers that hold extracted documents for chunking, embedding, and vector-store jobs. Those modules always read from a `bucket_uid`, never from raw extraction request UIDs — create a bucket once, attach extraction outputs to it with `buckets.addSources`, and reuse it across runs.

- `client.management.buckets.create({ name: "my-bucket" })`
Create a new bucket.

- `client.management.buckets.list()`
List all buckets owned by the API key.

- `client.management.buckets.get(bucketUid)`
Retrieve a single bucket.

- `client.management.buckets.delete(bucketUid)`
Delete a bucket.

- `client.management.buckets.addSources(bucketUid, { sources: [{ requestUid: "...", docUids: [...] }, ...] })`
Attach extraction request UIDs (and optionally specific document UIDs) to a bucket. After this call the bucket is a valid input for chunking / embedding / vector-store jobs. Returns `void`.

## Chunking

Chunking jobs over a bucket.

- `client.chunking.jobs.create({ bucketUid, chunking })`
Submit a chunking job. Pass a config matching one of the three chunking schemas — `SectionGreedyConfig`, `MdHeaderLevelConfig`, or `BlockWindowConfig` — described below.

- `client.chunking.jobs.get(bucketUid, jobUid)`
Retrieve the current state of a chunking job.

- `client.chunking.jobs.wait(bucketUid, jobUid, { timeoutS?, pollIntervalS?, pollMaxIntervalS? })`
Poll until terminal status, with the same overrides as `waitForRequest`.

- `client.chunking.analyze(bucketUid)`
Run statistical analysis on a bucket **after a chunking job has completed** — returns chunk-size distribution and a base64-encoded plot built from the existing output. Useful for inspecting the result of a chunking pass and deciding whether to re-run with adjusted parameters.

- `client.chunking.results(bucketUid)`
Fetch the chunking output files for a bucket. Returns a `Record<string, Buffer>`. File content transits directly between the client and storage, not through the API server.

### Choosing a chunking strategy

Three strategies are available — pick based on your document structure:

| Strategy | Best for | What it does |
|---|---|---|
| `SectionGreedyConfig` | Well-structured documents (papers, reports, manuals). **Recommended default.** | Respects natural section boundaries and packs each chunk to a token budget (`tMin`–`tMax`) |
| `MdHeaderLevelConfig` | FAQ-style or hierarchical knowledge bases where chunks should map 1:1 to headings | Splits at heading boundaries up to `chunkAtLevel` |
| `BlockWindowConfig` | Unstructured or continuous text (transcripts, plain narratives) where natural boundaries don't help | Sliding window over blocks with configurable overlap |

Example configurations:

```ts
import {
  BlockWindowConfig,
  MdHeaderLevelConfig,
  SectionGreedyConfig,
} from "neurolinker-sdk";

// (1) Structure-aware: respects natural sections, packs each chunk to a token budget.
SectionGreedyConfig.parse({
  method: "section_greedy",
  tMin: 200,
  tMax: 1500,                               // token budget per chunk
  modelName: "Alibaba-NLP/gte-large-en-v1.5", // tokenizer used for the budget
  parseFigures: true,
  parseTables: true,
  parseHeaders: true,
  parseFooters: false,
});

// (2) Markdown-header-aware: splits at headings up to a given level.
MdHeaderLevelConfig.parse({
  method: "md_header_level",
  chunkAtLevel: 2,
});

// (3) Sliding window over blocks with configurable overlap.
BlockWindowConfig.parse({
  method: "block_window",
  tMax: 1000,
  overlapBlocks: 2,
  overlapMode: "within_budget", // or "extra_budget"
});
```

`modelName` (available on all three methods) is the Hugging Face Hub repository id (`org/model`) of the tokenizer used to measure the token budget.

## Embedding

Embedding jobs over a chunked bucket. Before configuring a job there are two quick choices to make: **which vector type(s)** to compute, and **which chunk fields** to feed in.

### Choosing dense vs sparse (vs both)

| Vector type | When to use | Notes |
|---|---|---|
| **Dense** | Semantic similarity — "find chunks that mean roughly the same thing". Default choice for general-purpose RAG retrieval. | Supported by all internal and external models. |
| **Sparse** | Lexical / keyword matching — "find chunks that mention this exact term or phrase". Useful for technical jargon, entity names, code identifiers. | Only some internal models support sparse output; external providers typically offer dense only. |
| **Both (hybrid)** | Best of both worlds. Configure dense **and** sparse on the same modality; combine the scores at query time on your vector DB. | Recommended when retrieval recall matters and you can afford the extra storage. |

The available internal models and the vector types each one supports are listed by `client.embedding.listModels()` — call it at runtime to pick a compatible model. For external providers, refer to the provider's own documentation.

### Available fields per modality

`inputs` is the list of chunk fields concatenated before being passed to the embedding model. Each field is only valid on the content types marked below — using a field on the wrong modality is rejected at submit time.

| Field | Text | Image | Table | Description |
|---|:---:|:---:|:---:|---|
| `content` | ✓ | | ✓ | Main text payload for text chunks and table items |
| `description` | | ✓ | ✓ | Semantic description generated for images/tables |
| `extracted_text` | | ✓ | | OCR text extracted from the image |
| `data` | | | ✓ | Structured table payload flattened for embedding |
| `legend` | | ✓ | ✓ | Inline legend / explanatory note associated with the element |
| `header_path` | ✓ | ✓ | ✓ | Parent header hierarchy prepended when requested |
| `image_base64` | | ✓ | | Base64-encoded image bytes for vision-capable models |

### Methods

- `client.embedding.jobs.create({ bucketUid, embeddings })`
Submit an embedding job. Pass a flat list of `Content` blocks describing which content to embed (text / image / table), which chunk fields to use as input, and which dense / sparse vectors to compute.

- `client.embedding.jobs.get(bucketUid, jobUid)`
Retrieve the current state of an embedding job.

- `client.embedding.jobs.wait(bucketUid, jobUid, { timeoutS?, pollIntervalS?, pollMaxIntervalS? })`
Poll until terminal status.

- `client.embedding.listModels()`
List the embedding models available on the backend.

- `client.embedding.results(bucketUid)`
Fetch the embedding output files for a bucket. Same shape as `chunking.results`.

The primary Node SDK API is a flat list of `Content` entries. Each `Content` block declares a `contentType`, the `inputs` to concatenate, and one or more `EmbeddingVector`s to compute with that same input set. If you need different inputs for the same modality, create multiple `Content` entries with the same `contentType`.

```ts
import { Content, EmbeddingVector } from "neurolinker-sdk";

const textDense = EmbeddingVector.parse({
  vectorType: "dense",
  fieldName: "text_dense",
  modelName: "ainexxo-bge-m3",
});

const textSparse = EmbeddingVector.parse({
  vectorType: "sparse",
  fieldName: "text_sparse",
  modelName: "ainexxo-splade",
});

const imageDense = EmbeddingVector.parse({
  vectorType: "dense",
  fieldName: "image_dense",
  modelName: "jina_ai/jina-embeddings-v4",
  apiKey: "jina_api_key",
});

const embeddings = [
  Content.parse({
    contentType: "text",
    inputs: ["content"],
    vectors: [textDense, textSparse],
  }),
  Content.parse({
    contentType: "image",
    inputs: ["image_base64", "description"],
    vectors: [imageDense],
  }),
  Content.parse({
    contentType: "table",
    inputs: ["content", "description", "data"],
    vectors: [
      EmbeddingVector.parse({
        vectorType: "dense",
        fieldName: "table_dense",
        modelName: "text-embedding-3-small",
        apiKey: "sk_openai_api_key",
      }),
    ],
  }),
];

await client.embedding.jobs.create({
  bucketUid: "your_bucket_uid",
  embeddings,
});
```

Conventions worth knowing:
- `fieldName` cannot start with `item_` or `chunk_` — those prefixes are reserved for internal fields. The name you pick is what you reference later as `source` in a `FieldMapping` when loading into a vector store, so keep it stable across runs of the same project.
- `Content.vectors` is the inner list of vectors to compute for that content block.
- Internal Ainexxo models use `modelName: "ainexxo-..."` and omit `apiKey`.
- External LiteLLM models use the LiteLLM `modelName` as-is and carry their own `apiKey` directly on each `EmbeddingVector`. See the [LiteLLM supported embedding models](https://docs.litellm.ai/docs/embedding/supported_embedding) for valid model names.

## Vector Store

Bring your own cluster — the SDK upserts your embeddings into a collection on the vector database you specify in `VectorDBConfig`.

**Currently supported vector databases:**

- Milvus / Zilliz
- Qdrant
- Pinecone

You don't pass a `provider` field — it is detected from the URI of your cluster. Supply the URI and the cluster's connection token as `apiKey` on `VectorDBConfig`. The same `VectorDBConfig` is used by both `collections.create(...)` and `jobs.create(...)`.

- `client.vectorStore.collections.create({ collection, vectorDbConfig, database? })`
Create a vector-store collection. Idempotent — returns `already_existed=true` if it already exists. `collection` accepts a `CollectionSchema` (or plain object). `vectorDbConfig` is a `VectorDBConfig` (or plain object) selecting the backend and its connection details. `database` is optional and provider-specific — set it according to your provider's documentation; Qdrant requires it empty.

- `client.vectorStore.jobs.create({ bucketUid, collectionName, fieldMappings, vectorDbConfig, database? })`
Submit a vector-load job — reads the embedding output for `bucketUid` and writes it into `collectionName`. `fieldMappings` describes how chunk fields map to collection fields. `database` follows the same rule as above.

- `client.vectorStore.jobs.get(bucketUid, jobUid)`
Retrieve the current state of a vector-load job.

- `client.vectorStore.jobs.wait(bucketUid, jobUid, { timeoutS?, pollIntervalS?, pollMaxIntervalS? })`
Poll until terminal status.

Loading embeddings into a vector database needs three pieces: a `CollectionSchema` (the target collection's structure, made of `FieldDef` columns), a `VectorDBConfig` (cluster connection details), and a list of `FieldMapping`s (how to populate the collection columns from the embedded records).

The `source` of a `FieldMapping` references one of three namespaces. The data has two levels:

- **Parent chunk** — produced by the chunking step. Carries the full multimodal content of a section of the document (text plus inline figure/table descriptions). Typically what you feed to the LLM at retrieval time.
- **Embedding items** — derived from the parent, one per modality present in the chunk: a text item with the chunk's text content, one image item per figure (with its description, image bytes, OCR text, legend…), one table item per table (with its content, data, and description). The vector embeddings live on these items.

For example, a chunk containing 2 figures and 1 table produces 4 items (1 text + 2 image + 1 table). At query time you match against the items' vectors but typically retrieve the parent's `chunk_content` to give the LLM the surrounding context.

| Namespace | When to use as `source` | Examples |
|---|---|---|
| `chunk_*` | Per-chunk fields — typically the **context you feed to the LLM** at retrieval time. | `chunk_id`, `chunk_source_file`, `chunk_content` (full chunk, multimodal), `chunk_header_path`, `chunk_pages` |
| `item_*` | Per-item fields — the row you upsert. | `item_id` (primary key), `item_element_type` (`text` / `image` / `table`) |
| `<fieldName>` | The dense or sparse vector itself. | `text_dense`, `text_sparse` (the name you picked in `EmbeddingVector`) |

`chunk_*` fields — available on every chunk regardless of which modality items it produced:

| Source | Description |
|---|---|
| `chunk_id` | Id of the parent chunk |
| `chunk_source_file` | Document the chunk comes from |
| `chunk_content` | Full chunk content (text plus inline figure/table descriptions) — typical LLM context at retrieval |
| `chunk_header_path` | Section/heading hierarchy leading to the chunk |
| `chunk_pages` | Pages spanned by the chunk |

Modality-specific `item_*` fields — each is only present on items of the corresponding modality:

| Source | Text | Image | Table | Description |
|---|:---:|:---:|:---:|---|
| `item_content` | ✓ | | ✓ | Text content for text items and flattened content for table items |
| `item_description` | | ✓ | ✓ | Semantic description carried by image/table items |
| `item_extracted_text` | | ✓ | | OCR text extracted from the image |
| `item_data` | | | ✓ | Table data in key:value form |
| `item_legend` | | ✓ | ✓ | Legend / inline explanatory text |
| `item_image_base64` | | ✓ | | Base64-encoded image bytes |

```ts
import {
  CollectionSchema,
  FieldDef,
  FieldMapping,
  VectorDBConfig,
} from "neurolinker-sdk";

// A collection's schema — abstract dtypes, the provider translates them.
const collection = CollectionSchema.parse({
  name: "my_collection",
  description: "Documents indexed by SDK",
  fields: [
    FieldDef.parse({ name: "chunk_id", dtype: "text", isPrimary: true }),
    FieldDef.parse({ name: "content", dtype: "text" }),
    FieldDef.parse({ name: "text_dense", dtype: "dense_vector", dim: 1024, distance: "cosine" }),
  ],
});

// Map each collection field to a source from one of the three namespaces above.
const fieldMappings = [
  FieldMapping.parse({ name: "chunk_id", source: "item_id" }),
  FieldMapping.parse({ name: "content", source: "item_content" }),
  FieldMapping.parse({ name: "text_dense", source: "text_dense" }), // matches fieldName above
];

// Vector-DB connection — supply your cluster URI and its connection token.
const vdb = VectorDBConfig.parse({
  uri: "https://your-cluster-uri",
  apiKey: "<your-vector-db-token>",
});

await client.vectorStore.collections.create({ collection, vectorDbConfig: vdb });
const loadJob = await client.vectorStore.jobs.create({
  bucketUid: "<your-bucket-uid>",
  collectionName: "my_collection",
  fieldMappings,
  vectorDbConfig: vdb,
});
await client.vectorStore.jobs.wait("<your-bucket-uid>", loadJob.job_uid as string);
```

Supported `dtype` values: `text`, `int`, `float`, `bool`, `json`, `dense_vector` (requires `dim`), `sparse_vector`. Supported `distance` for `dense_vector`: `cosine` (default), `dot`, `euclidean`. Do not set `distance` on scalar or `sparse_vector` fields. A collection can have at most one field with `isPrimary=true`.

Provider-specific settings live in two places:

- **`FieldDef.options`** — per-field knobs (e.g. Milvus `max_length`).
- **`CollectionSchema.options`** — collection-wide knobs (e.g. Pinecone serverless `cloud` / `region`).

The common schema contract (`name`, `dtype`, `dim`, `distance`, `isPrimary`) is portable across providers — reach for `options` only when targeting a specific provider's capability. Unknown keys are rejected.

**Field options** (`FieldDef.options`):

| Provider | Applies to | Supported keys | Notes |
|---|---|---|---|
| Milvus / Zilliz | all fields | `description` | Adds a description to the field. |
| Milvus / Zilliz | `text` fields | `max_length`, `enable_analyzer`, `enable_match` | Maximum text length, analyzer, and exact-match indexing. |
| Milvus / Zilliz | primary key field | `auto_id` | Auto-generate the primary key value. Defaults to `false`. |

Pinecone and Qdrant do not currently take field options.

**Collection options** (`CollectionSchema.options`):

| Provider | Supported keys | Notes |
|---|---|---|
| Pinecone | `cloud`, `region` | Serverless index placement. Defaults to `aws` / `us-east-1`. |

Milvus / Zilliz and Qdrant do not currently take collection options.

Example — Pinecone serverless index in `eu-central-1`:

```ts
const collection = CollectionSchema.parse({
  name: "neurolinker-docs",
  options: { cloud: "aws", region: "eu-central-1" },
  fields: [
    FieldDef.parse({ name: "chunk_id",   dtype: "text", isPrimary: true }),
    FieldDef.parse({ name: "text_dense", dtype: "dense_vector", dim: 1024 }),
  ],
});
```

## Evaluation

Evaluate your RAG with [Ragas](https://docs.ragas.io) metrics, in two complementary modes:

- **One-shot** (`client.evaluation.oneshot`) — score a batch dataset of pre-computed RAG outputs.
- **Tracking** (`client.evaluation.tracking` + `instrument`) — attach to a live RAG and score every query automatically, continuously.

### One-shot

Upload a JSONL dataset of pre-computed RAG outputs; the service scores every row and returns the per-row scores plus an aggregated summary. Black-box: the dataset is the only input — not coupled to buckets or the rest of the pipeline.

The dataset is JSONL (one JSON object per line) with the Ragas-canonical columns. `user_input` and `response` are required; `retrieved_contexts` (`string[]`) and `reference` (`string`) are optional — including them unlocks more metrics (faithfulness, the context metrics, answer/factual correctness, ...).

- `client.evaluation.oneshot.jobs.create({ dataset: { filename, content } })`
Upload the JSONL dataset and enqueue the evaluation in one request. The dataset is passed in memory as `{ filename, content: Buffer }`; the filename must end with `.jsonl`. Returns the body carrying `eval_uid` + `status`.

- `client.evaluation.oneshot.jobs.get(evalUid)`
Retrieve the current state of an evaluation (`pending` → `processing` → `completed` / `failed`); on completion it also carries `metrics_computed` / `metrics_skipped`.

- `client.evaluation.oneshot.jobs.wait(evalUid, { timeoutS?, pollIntervalS?, pollMaxIntervalS? })`
Poll until terminal status (`completed` / `failed`).

- `client.evaluation.oneshot.results(evalUid)`
Fetch the result of a completed evaluation. Returns the parsed `result.json` — `{ eval_uid, rows, summary }`: per-row metric scores plus an aggregated summary (mean / percentiles / count per metric). Throws if the result isn't available yet — call `jobs.wait` first.

Example:

```ts
import { NeuroLinker } from "neurolinker-sdk";
import "dotenv/config";

async function main() {
  const rows = [
    {
      user_input: "What is the capital of France?",
      response: "The capital of France is Paris.",
      retrieved_contexts: ["Paris is the capital and largest city of France."],
      reference: "Paris is the capital of France.",
    },
  ];
  const dataset = {
    filename: "data.jsonl",
    content: Buffer.from(rows.map((r) => JSON.stringify(r)).join("\n"), "utf-8"),
  };

  const client = NeuroLinker.fromEnv();
  const job = await client.evaluation.oneshot.jobs.create({ dataset });
  const evalUid = job.eval_uid as string;
  await client.evaluation.oneshot.jobs.wait(evalUid);
  const result = await client.evaluation.oneshot.results(evalUid);
  console.log(result.summary);
}

main();
```

### Tracking (continuous)

Observe a RAG **in production**: attach the tracer once, and every query is traced to NeuroLinker, scored with Ragas, and surfaced in the dashboard. Same metrics as one-shot (the reference-free ones), computed continuously per query.

**1. Create a track (once).** The `track_uid` ties every traced query to this app — store it.

```ts
const track = await client.evaluation.tracking.tracks.create({ name: "prod-rag" });
console.log(track.track_uid);
```

**2. Instrument your app.** Tracking uses OpenTelemetry. Install the tracking peer deps + your framework's OpenInference instrumentor, then call `instrument()` at startup. Node has no entry-point auto-discovery, so you pass the instrumentation instances explicitly:

```bash
npm install @opentelemetry/api @opentelemetry/sdk-trace-node @opentelemetry/exporter-trace-otlp-proto @arizeai/openinference-semantic-conventions @opentelemetry/instrumentation
npm install @arizeai/openinference-instrumentation-langchain @langchain/core   # swap for -openai, -llama-index, ...
```

```ts
import { instrument } from "neurolinker-sdk";
import { LangChainInstrumentation } from "@arizeai/openinference-instrumentation-langchain";
import * as CallbackManagerModule from "@langchain/core/callbacks/manager";

const lc = new LangChainInstrumentation();
await instrument("<track_uid>", { instrumentations: [lc] }); // apiKey/baseUrl from env
lc.manuallyInstrument(CallbackManagerModule); // LangChain: patch its callbacks module
```

Your framework's calls are now traced **automatically**. Notes:

- Register instrumentations **before** importing the framework you're tracing (OpenTelemetry patches modules at import time).
- If your app already runs OpenTelemetry, on Node NeuroLinker cannot attach to its provider automatically — add a `BatchSpanProcessor` with the NeuroLinker OTLP exporter to your own provider, or call `instrument()` first. It warns rather than dropping spans silently.
- A short-lived script should call `await provider.forceFlush()` (on the returned provider) before exiting, so the last spans are sent.

**Custom RAG with no framework instrumentor.** Set `manual: true` and wrap each query, handing over the pieces explicitly:

```ts
import { instrument, recordQuery } from "neurolinker-sdk";

await instrument("<track_uid>", { manual: true }); // manual:true silences the "no instrumentations" notice

await recordQuery({ userInput: question }, async (q) => {
  const docs = await myRetriever(question);
  q.setContexts(docs.map((d) => d.text)); // unlocks the context metrics
  const resp = await myLlm(question, docs); // your own LLM call
  q.setResponse(resp.text);
  q.setLlm({
    // optional — values come from the LLM response
    model: resp.model,
    inputTokens: resp.usage.inputTokens,
    outputTokens: resp.usage.outputTokens,
  });
});
```

**Read the dashboard.**

- `client.evaluation.tracking.tracks.create({ name })` / `.list()` / `.setActive(trackUid, { active })`
Manage tracks. A disabled track stops accepting traces; its history stays readable.

- `client.evaluation.tracking.queries(trackUid, { limit })`
The per-query rows a track has accumulated (input/output, metrics, latency), most recent first.

- `client.evaluation.tracking.query(trackUid, traceId)`
Drill-down for one query — adds the retrieved contexts, model and token counts.

```ts
const res = await client.evaluation.tracking.queries(trackUid);
for (const row of res.queries as Array<Record<string, unknown>>) {
  console.log(row.user_input, row.metrics);
}
```

## End-to-end pipeline

The ingestion modules compose end to end — the client manually sequences each step; there is no automatic orchestrator. (Evaluation sits outside this chain: batch scoring via `oneshot`, plus continuous tracking of a live RAG.)

```ts
import {
  NeuroLinker,
  extractRequestUid,
  extractDocumentIds,
  SectionGreedyConfig,
  Content,
  EmbeddingVector,
  CollectionSchema,
  FieldDef,
  FieldMapping,
  VectorDBConfig,
} from "neurolinker-sdk";

const client = NeuroLinker.fromEnv();

// 1. Extract a PDF
const submit = await client.extraction.extract({
  urls: ["https://arxiv.org/pdf/2301.07041"],
});
const requestUid = extractRequestUid(submit);
const status = await client.extraction.waitForRequest(requestUid);
const docUids = extractDocumentIds(status);

// 2. Create a bucket and attach the extracted documents
const bucketUid = (await client.management.buckets.create({ name: "my-bucket" })).bucket_uid as string;
await client.management.buckets.addSources(bucketUid, {
  sources: [{ requestUid, docUids }],
});

// 3. Chunk
const chunkJob = await client.chunking.jobs.create({
  bucketUid,
  chunking: SectionGreedyConfig.parse({ method: "section_greedy", tMin: 100, tMax: 512 }),
});
await client.chunking.jobs.wait(bucketUid, chunkJob.job_uid as string);

// 4. Embed with an internal model (no key required)
const models = await client.embedding.listModels();
const model = (models.models as Array<Record<string, unknown>>).find(
  (m) => (m.vector_types as string[] | undefined)?.includes("dense"),
)!;
const embedJob = await client.embedding.jobs.create({
  bucketUid,
  embeddings: [
    Content.parse({
      contentType: "text",
      inputs: ["content"],
      vectors: [
        EmbeddingVector.parse({
          vectorType: "dense",
          fieldName: "text_dense",
          modelName: model.name as string,
        }),
      ],
    }),
  ],
});
await client.embedding.jobs.wait(bucketUid, embedJob.job_uid as string);

// 5. Create a collection and load the embeddings
const vdb = VectorDBConfig.parse({
  uri: "https://your-cluster-uri",
  apiKey: "<your-vector-db-token>",
});
await client.vectorStore.collections.create({
  collection: CollectionSchema.parse({
    name: "my_collection",
    fields: [
      FieldDef.parse({ name: "chunk_id", dtype: "text", isPrimary: true }),
      FieldDef.parse({ name: "content", dtype: "text" }),
      FieldDef.parse({ name: "text_dense", dtype: "dense_vector", dim: 1024 }),
    ],
  }),
  vectorDbConfig: vdb,
});
const loadJob = await client.vectorStore.jobs.create({
  bucketUid,
  collectionName: "my_collection",
  fieldMappings: [
    FieldMapping.parse({ name: "chunk_id", source: "item_id" }),
    FieldMapping.parse({ name: "content", source: "item_content" }),
    FieldMapping.parse({ name: "text_dense", source: "text_dense" }),
  ],
  vectorDbConfig: vdb,
});
await client.vectorStore.jobs.wait(bucketUid, loadJob.job_uid as string);
```

## Error handling

The SDK throws two error types, both importable from `neurolinker-sdk`:

- **`NeuroLinkerAPIError`** — non-2xx response from the API. Carries `statusCode`, `method`, `url`, `responseText`, `responseJson`.
- **`NeuroLinkerConfigError`** — client-side validation failure (missing config, invalid argument, schema validation).

## Support

- **Platform documentation** (pricing, quotas, account management): https://neurolinker.ainexxo.com/docs/
- **API key & dashboard**: https://neurolinker.ainexxo.com (login → API KEY section)
- **Bug reports & feature requests**: open an issue on the SDK repository.

## License

Released under the MIT License — see the [`LICENSE`](./LICENSE) file at the project root.
