# neurolinker-sdk

NeuroLinker is a document intelligence service by Ainexxo S.R.L. that automates the full ingestion pipeline for RAG applications — from PDF extraction to vector-store loading. This SDK is the official Node.js / TypeScript client for the NeuroLinker API: it provides an async client for the complete pipeline (extraction full and field-based, bucket management, chunking, embedding, and vector-store loading).

## Table of contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Pipeline overview](#pipeline-overview)
- [Client](#client)
- [Extraction](#extraction)
- [Management](#management)
- [Bringing your own keys (BYOK)](#bringing-your-own-keys-byok)
- [Chunking](#chunking)
- [Embedding](#embedding)
- [Vector Store](#vector-store)
- [End-to-end pipeline](#end-to-end-pipeline)
- [Error handling](#error-handling)
- [Migrating from 0.1.x](#migrating-from-01x)
- [Support](#support)
- [License](#license)

## Installation

```bash
npm install neurolinker-sdk
```

Requires Node.js 18+. Works with both ESM and CommonJS, and ships TypeScript types.

## Quick start

Get your API key at https://neurolinker.ainexxo.com — login → API KEY section.

```bash
export NEUROLINKER_API_KEY="your_token"
```

Or store it in a `.env` file at the project root — load it once at startup and `NeuroLinker.fromEnv()` picks it up automatically:

```ts
import "dotenv/config"; // reads .env into process.env
```

**ESM / TypeScript**

```ts
import { NeuroLinker } from "neurolinker-sdk";

const client = new NeuroLinker({ token: "nl_****" });
const tasks = await client.extraction.listTasks();

// with .env (after loading dotenv)
const clientFromEnv = NeuroLinker.fromEnv();
const tasksFromEnv = await clientFromEnv.extraction.listTasks();
```

**CommonJS**

```js
const { NeuroLinker } = require("neurolinker-sdk");

async function main() {
  const client = new NeuroLinker({ token: process.env.NEUROLINKER_API_KEY });
  const tasks = await client.extraction.listTasks();
  console.log(tasks);
}

main();
```

## Pipeline overview

The five modules are designed to compose end-to-end. A typical RAG ingestion run goes through them in order:

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
Loads `NEUROLINKER_API_KEY` from the environment. Reads optional `NEUROLINKER_BASE_URL`, `NEUROLINKER_E2E_TIMEOUT_S`, `NEUROLINKER_E2E_POLL_INTERVAL_S`, `NEUROLINKER_E2E_POLL_MAX_INTERVAL_S` as well. Any parameter passed explicitly to `fromEnv(...)` overrides the corresponding env var.

> The SDK is async-only — every method returns a `Promise`. There is no separate sync client (Node.js is natively asynchronous, so a sync flavour would not be idiomatic).

### Modules

The SDK groups the API into five modules reachable as attributes on the client:

| Module | Purpose |
|---|---|
| `extraction` | PDF extraction — full and field-based |
| `management` | Buckets and secrets CRUD |
| `chunking` | Chunking jobs |
| `embedding` | Embedding jobs |
| `vectorStore` | Vector-store collections and load jobs |

## Extraction

PDF processing — full extraction or schema-based field extraction. The two pipelines are independent: pick one per document depending on what you want as output.

| Method | When to use it | Output |
|---|---|---|
| `extraction.extract(...)` | You want the full document content for downstream pipelines (RAG, search, chunking) | Markdown, structured JSON, per-page images, page/section summaries |
| `extraction.extractFields(...)` | You only need a structured payload that conforms to a JSON Schema you supply (invoices, forms, contracts) | A JSON object matching your schema, retrievable via `documents.fields(...)` |

Both reserve credits at submit time on a per-page basis (see the platform documentation for pricing).

- `client.extraction.extract({ documents?, urls?, alias?, description? })`
Submit a full-extraction job. Provide **either** `documents: [{ filename: "file.pdf", content: <Buffer> }]` (local PDFs uploaded as bytes) **or** `urls: ["https://..."]` (PDF URLs the backend downloads). The two are mutually exclusive — exactly one is required.

- `client.extraction.extractFields({ jsonSchema, documents?, urls?, alias?, description? })`
Submit a field-extraction job. `jsonSchema` is required and must follow JSON Schema Draft 7 (supported subset). Provide **either** `documents: [{ filename, content }]` (local PDFs) **or** `urls: ["https://..."]` (PDF URLs). Same XOR rule as `extract`. Example:

```ts
await client.extraction.extractFields({
  jsonSchema: {
    type: "object",
    properties: {
      invoice_number: { type: "string" },
      issue_date:     { type: "string", description: "ISO date (YYYY-MM-DD)" },
      total_amount:   { type: "number" },
      line_items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            quantity:    { type: "integer" },
            unit_price:  { type: "number" },
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

CRUD for the two resources that glue the extraction output to the rest of the pipeline.

- **Buckets** are the persistent containers that hold extracted documents for chunking, embedding, and vector-store jobs. Those modules always read from a `bucket_uid`, never from raw extraction request UIDs — create a bucket once, attach extraction outputs to it with `buckets.addSources`, and reuse it across runs.
- **Secrets** are managed credentials stored in Google Secret Manager. You upload an external API key or vector-DB token once, get back an opaque `secret_id`, and reference that id (instead of the raw value) in every job. See the [BYOK](#bringing-your-own-keys-byok) section for the full flow.

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

- `client.management.secrets.create({ name: "my-secret", value: "..." })`
Create a secret in Google Secret Manager. Naming is namespaced server-side as `neurolinker__{user_uid}__{name}`.

- `client.management.secrets.list()`
List secrets owned by the API key.

- `client.management.secrets.update(secretId, { value: "..." })`
Update an existing secret. Returns `void`.

- `client.management.secrets.delete(secretId)`
Delete a secret. Returns `void`.

> Secret values are redacted from any error response before being raised, so the value never appears in `NeuroLinkerAPIError` text or JSON.

## Bringing your own keys (BYOK)

Some modules call **third-party services on your behalf** and need the corresponding credential:

| Module | When you need a credential |
|---|---|
| `embedding` | Only if you target an **external provider** (Voyage, Jina). Internal models returned by `embedding.listModels()` are hosted by Ainexxo and need no key. |
| `vectorStore` | Always — the vector database cluster is yours, you supply its connection token. See [Vector Store](#vector-store) for the list of supported databases. |

Upload the value once with `secrets.create(...)`, get an opaque id back, and reference it in every job via `secretId`. The actual value never leaves Google Secret Manager — only the id flows through the API. Rotation, audit log and per-tenant isolation come for free.

```ts
import { NeuroLinker } from "neurolinker-sdk";

const client = NeuroLinker.fromEnv();

// Store each third-party credential once — do this once, then reuse the returned secret_id
const vdbSid = (await client.management.secrets.create({
  name: "my_vdb_token",
  value: "<your-vector-db-token>",
})).secret_id as string;

const voyageSid = (await client.management.secrets.create({
  name: "my_voyage_key",
  value: "<your-voyage-key>",
})).secret_id as string;
```

## Chunking

Chunking jobs over a bucket.

- `client.chunking.jobs.create({ bucketUid, chunking })`
Submit a chunking job. Pass an object matching one of the three chunking config shapes — `SectionGreedyConfig`, `MdHeaderLevelConfig`, or `BlockWindowConfig` — described below.

- `client.chunking.jobs.get(jobUid)`
Retrieve the current state of a chunking job.

- `client.chunking.jobs.wait(jobUid, { timeoutS?, pollIntervalS?, pollMaxIntervalS? })`
Poll until terminal status, with the same overrides as `waitForRequest`.

- `client.chunking.analyze(bucketUid)`
Run statistical analysis on a bucket **after a chunking job has completed** — returns chunk-size distribution and a base64-encoded plot built from the existing output. Useful for inspecting the result of a chunking pass and deciding whether to re-run with adjusted parameters.

- `client.chunking.results(bucketUid)`
Fetch the chunking output files for a bucket. Returns `Record<string, Buffer>` keyed by filename. File content transits directly between the client and storage, not through the API server.

### Choosing a chunking strategy

Three strategies are available — pick based on your document structure:

| Strategy | Best for | What it does |
|---|---|---|
| `SectionGreedyConfig` | Well-structured documents (papers, reports, manuals). **Recommended default.** | Respects natural section boundaries and packs each chunk to a token budget (`tMin`–`tMax`) |
| `MdHeaderLevelConfig` | FAQ-style or hierarchical knowledge bases where chunks should map 1:1 to headings | Splits at heading boundaries up to `chunkAtLevel` (1..6) |
| `BlockWindowConfig` | Unstructured or continuous text (transcripts, plain narratives) where natural boundaries don't help | Sliding window over blocks with configurable overlap |

Choosing is iterative: run a first pass with reasonable defaults, then call `client.chunking.analyze(bucketUid)` to inspect the resulting chunk-size distribution and re-run with adjusted `tMin`/`tMax` (or a different strategy) if needed. A new chunking job overwrites the previous output for the same bucket.

Example configurations:

```ts
import {
  BlockWindowConfig,
  MdHeaderLevelConfig,
  SectionGreedyConfig,
  type ChunkingConfigInput,
} from "neurolinker-sdk";

// (1) Structure-aware: respects natural sections, packs each chunk to a token budget.
const sectionGreedy: ChunkingConfigInput = {
  method: "section_greedy",
  tMin: 200,
  tMax: 1500,                              // token budget per chunk
  modelName: "Alibaba-NLP/gte-large-en-v1.5", // tokenizer used for the budget
  parseFigures: true,
  parseTables: true,
  parseHeaders: true,
  parseFooters: false,
};

// (2) Markdown-header-aware: splits at headings up to a given level (1..6).
const mdHeader: ChunkingConfigInput = {
  method: "md_header_level",
  chunkAtLevel: 2,
};

// (3) Sliding window over blocks with configurable overlap.
const blockWindow: ChunkingConfigInput = {
  method: "block_window",
  tMax: 1000,
  overlapBlocks: 2,
  overlapMode: "within_budget",            // or "extra_budget"
};

// Use a schema directly to validate runtime input:
SectionGreedyConfig.parse(sectionGreedy);

await client.chunking.jobs.create({ bucketUid: "<bucket>", chunking: sectionGreedy });
```

Each config is mutually exclusive — `chunkAtLevel` only exists on `MdHeaderLevelConfig`, `overlap*` only on `BlockWindowConfig`. The discriminator is the `method` field on each config.

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

`inputs` is the list of chunk fields concatenated before being passed to the embedding model. Each field is only valid on the modalities marked below — using a field on the wrong modality is rejected at submit time.

**Sensible defaults**: `["content"]` for text modality; `["caption", "detailed_description"]` for image and table modalities.

| Field | Text | Image | Table | Description |
|---|:---:|:---:|:---:|---|
| `content` | ✓ | | | Main text content of the chunk |
| `caption` | ✓ | ✓ | ✓ | Figure or table caption |
| `detailed_description` | ✓ | ✓ | ✓ | LLM-generated semantic description |
| `extracted_text` | ✓ | ✓ | | OCR text extracted from the element |
| `data` | ✓ | | ✓ | Table data in key:value format |
| `aliases` | ✓ | ✓ | ✓ | Symbol/abbreviation mappings |
| `header_path` | ✓ | | | Parent header hierarchy leading to this chunk |
| `image_base64` | | ✓ | | Base64-encoded image (required for vision models) |

### Methods

- `client.embedding.jobs.create({ bucketUid, modalities })`
Submit an embedding job. Pass an `EmbeddingModalities` instance describing which modalities to embed (text / image / table) and which dense / sparse vectors to compute per modality.

- `client.embedding.jobs.get(jobUid)`
Retrieve the current state of an embedding job.

- `client.embedding.jobs.wait(jobUid, { timeoutS?, pollIntervalS?, pollMaxIntervalS? })`
Poll until terminal status.

- `client.embedding.listModels()`
List the embedding models available on the backend.

- `client.embedding.results(bucketUid)`
Fetch the embedding output files for a bucket. Same shape as `chunking.results` (`Record<string, Buffer>`).

An `EmbeddingModalities` instance is a nested structure: up to three modalities (`text` / `image` / `table`), each with `dense` and/or `sparse` vectors, each referencing a model and the chunk fields to use as input.

```ts
import {
  type EmbeddingModalitiesInput,
  NeuroLinker,
} from "neurolinker-sdk";

const client = NeuroLinker.fromEnv();

// Use listModels() to discover available internal models
const models = await client.embedding.listModels();
const model = (models.models as Array<{ name: string; endpoint: string; vector_types?: string[] }>).find(
  (m) => (m.vector_types ?? []).includes("dense"),
)!;

// Single text dense embedding using an internal model
const modalities: EmbeddingModalitiesInput = {
  text: {
    vectors: {
      dense: {
        vectorName: "text_dense", // free name — referenced later as source in fieldMappings
        model: { endpoint: model.endpoint, modelName: model.name },
        inputs: ["content"],      // chunk fields to embed; default = []
      },
    },
  },
};

// Alternative: multi-modal — text dense + sparse, image dense, table dense
const multimodal: EmbeddingModalitiesInput = {
  text: {
    vectors: {
      dense: {
        vectorName: "text_dense",
        model: { endpoint: model.endpoint, modelName: model.name },
        inputs: ["content"],
      },
      sparse: {
        vectorName: "text_sparse",
        model: { endpoint: model.endpoint, modelName: model.name },
        inputs: ["content"],
      },
    },
  },
  image: {
    vectors: {
      dense: {
        vectorName: "image_dense",
        model: { endpoint: model.endpoint, modelName: model.name },
        inputs: ["caption", "detailed_description"],
      },
    },
  },
  table: {
    vectors: {
      dense: {
        vectorName: "table_dense",
        model: { endpoint: model.endpoint, modelName: model.name },
        inputs: ["caption", "detailed_description", "data"],
      },
    },
  },
};
```

Conventions worth knowing:
- `vectorName` cannot start with `item_` or `chunk_` — those prefixes are reserved for internal fields. The name you pick is what you reference later as `source` in a `FieldMapping` when loading into a vector store, so keep it stable across runs of the same project.
- For external providers add `secretId: "..."` on the `model` object — see the [Bringing your own keys (BYOK)](#bringing-your-own-keys-byok) section. **Currently supported external embedding providers** (auto-detected from endpoint domain): **Voyage** and **Jina**. `ModelRef` is passthrough, so any provider-specific extras (e.g. Voyage's `input_type`) are forwarded as-is.

## Vector Store

Vector-database collections and vector-load jobs. Bring your own cluster — the SDK upserts your embeddings into a collection on the vector database you specify in `VectorDBConfig`.

**Currently supported vector databases:**

- Milvus / Zilliz
- Qdrant
- Pinecone

You don't pass a `provider` field — the SDK figures it out from the URI of your cluster. Just supply the URI and a `secretId` referencing the cluster's connection token (uploaded once via `secrets.create`, see [BYOK](#bringing-your-own-keys-byok)).

- `client.vectorStore.collections.create({ collection, vectorDbConfig, database? })`
Create a vector-store collection. Idempotent — returns `already_existed: true` if it already exists. `collection` accepts a `CollectionSchema` shape (Zod-validated). `vectorDbConfig` is a `VectorDBConfig` shape selecting the backend and its connection details.

- `client.vectorStore.jobs.create({ bucketUid, collectionName, fieldMappings, vectorDbConfig, database? })`
Submit a vector-load job — reads the embedding output for `bucketUid` and writes it into `collectionName`. `fieldMappings` describes how chunk fields map to collection fields.

- `client.vectorStore.jobs.get(jobUid)`
Retrieve the current state of a vector-load job.

- `client.vectorStore.jobs.wait(jobUid, { timeoutS?, pollIntervalS?, pollMaxIntervalS? })`
Poll until terminal status.

Loading embeddings into a vector database needs three pieces: a `CollectionSchema` (the target collection's structure, made of `FieldDef` columns), a `VectorDBConfig` (cluster connection details), and a list of `FieldMapping`s (how to populate the collection columns from the embedded records).

The `source` of a `FieldMapping` references one of three namespaces. The data has two levels:

- **Parent chunk** — produced by the chunking step. Carries the full multimodal content of a section of the document (text plus inline figure/table descriptions). Typically what you feed to the LLM at retrieval time.
- **Embedding items** — derived from the parent, one per modality present in the chunk: a text item with the chunk's text content, one image item per figure (with its caption, image bytes, OCR text…), one table item per table (with its data and description). The vector embeddings live on these items.

For example, a chunk containing 2 figures and 1 table produces 4 items (1 text + 2 image + 1 table). At query time you match against the items' vectors but typically retrieve the parent's `chunk_content` to give the LLM the surrounding context.

| Namespace | When to use as `source` | Examples |
|---|---|---|
| `chunk_*` | Per-chunk fields — typically the **context you feed to the LLM** at retrieval time. | `chunk_id`, `chunk_source_file`, `chunk_content` (full chunk, multimodal), `chunk_header_path`, `chunk_pages` |
| `item_*` | Per-item fields — the row you upsert. | `item_id` (primary key), `item_element_type` (`text` / `image` / `table`) |
| `<vector_name>` | The dense or sparse vector itself. | `text_dense`, `text_sparse` (the name you picked in `EmbeddingModalities`) |

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
| `item_content` | ✓ | | | Text content of the item |
| `item_caption` | | ✓ | ✓ | Caption of the figure or table |
| `item_detailed_description` | | ✓ | ✓ | LLM-generated semantic description |
| `item_extracted_text` | | ✓ | | OCR text from the figure |
| `item_data` | | | ✓ | Table data in key:value format |
| `item_aliases` | | ✓ | ✓ | Symbol/abbreviation mappings |
| `item_url` | | ✓ | | URL of the figure |
| `item_image_base64` | | ✓ | | Base64-encoded image bytes |

```ts
import {
  type CollectionSchemaInput,
  type FieldMappingInput,
  type VectorDBConfigInput,
} from "neurolinker-sdk";

// A collection's schema — abstract dtypes, the provider translates them.
const collection: CollectionSchemaInput = {
  name: "my_collection",
  description: "Documents indexed by SDK",
  fields: [
    { name: "chunk_id",   dtype: "text", isPrimary: true },
    { name: "content",    dtype: "text" },
    { name: "text_dense", dtype: "dense_vector", dim: 1024, distance: "cosine" },
  ],
};

// Map each collection field to a source from one of the three namespaces above.
const fieldMappings: FieldMappingInput[] = [
  { name: "chunk_id",   source: "item_id" },
  { name: "content",    source: "item_content" },
  { name: "text_dense", source: "text_dense" }, // matches vectorName above
];

// Vector-DB connection — supply your cluster URI and the managed secret id
// returned by management.secrets.create(...).
const vdb: VectorDBConfigInput = {
  uri: "https://your-cluster-uri",
  secretId: "<secret_id from secrets.create>",
};

await client.vectorStore.collections.create({ collection, vectorDbConfig: vdb });
const loadJob = await client.vectorStore.jobs.create({
  bucketUid: "<your-bucket-uid>",
  collectionName: "my_collection",
  fieldMappings,
  vectorDbConfig: vdb,
});
await client.vectorStore.jobs.wait(loadJob.job_uid as string);
```

Supported `dtype` values: `text`, `int`, `float`, `bool`, `json`, `dense_vector` (requires `dim`), `sparse_vector`. Supported `distance` for vectors: `cosine` (default), `dot`, `euclidean`. A collection can have at most one field with `isPrimary: true`.

## End-to-end pipeline

The five modules are designed to compose. The client manually sequences each step — there is no automatic orchestrator.

```ts
import {
  NeuroLinker,
  extractDocumentIds,
  extractRequestUid,
  type CollectionSchemaInput,
  type EmbeddingModalitiesInput,
  type FieldMappingInput,
  type VectorDBConfigInput,
} from "neurolinker-sdk";

async function runPipeline(): Promise<void> {
  const client = NeuroLinker.fromEnv();

  // 0. Store the vector-DB credential as a managed secret (see BYOK section above)
  const secretCreated = await client.management.secrets.create({
    name: "my_vdb_token",
    value: "<your-vdb-token>",
  });
  const secretId = secretCreated.secret_id as string;

  // 1. Extract a PDF
  const submit = await client.extraction.extract({
    urls: ["https://arxiv.org/pdf/2301.07041"],
  });
  const requestUid = extractRequestUid(submit);
  const status = await client.extraction.waitForRequest(requestUid);
  const docUids = extractDocumentIds(status);

  // 2. Create a bucket and attach the extracted documents
  const bucket = await client.management.buckets.create({ name: "my-bucket" });
  const bucketUid = bucket.bucket_uid as string;
  await client.management.buckets.addSources(bucketUid, {
    sources: [{ requestUid, docUids }],
  });

  // 3. Chunk
  const chunkJob = await client.chunking.jobs.create({
    bucketUid,
    chunking: { method: "section_greedy", tMin: 100, tMax: 512 },
  });
  await client.chunking.jobs.wait(chunkJob.job_uid as string);

  // 4. Embed with an internal model (no key required)
  const models = await client.embedding.listModels();
  const model = (models.models as Array<{ name: string; endpoint: string; vector_types?: string[] }>).find(
    (m) => (m.vector_types ?? []).includes("dense"),
  )!;
  const modalities: EmbeddingModalitiesInput = {
    text: {
      vectors: {
        dense: {
          vectorName: "text_dense",
          model: { endpoint: model.endpoint, modelName: model.name },
          inputs: ["content"],
        },
      },
    },
  };
  const embedJob = await client.embedding.jobs.create({ bucketUid, modalities });
  await client.embedding.jobs.wait(embedJob.job_uid as string);

  // 5. Create a collection and load the embeddings
  const vdb: VectorDBConfigInput = {
    uri: "https://your-cluster-uri",
    secretId,
  };
  const collection: CollectionSchemaInput = {
    name: "my_collection",
    fields: [
      { name: "chunk_id",   dtype: "text", isPrimary: true },
      { name: "content",    dtype: "text" },
      { name: "text_dense", dtype: "dense_vector", dim: 1024 },
    ],
  };
  await client.vectorStore.collections.create({ collection, vectorDbConfig: vdb });

  const fieldMappings: FieldMappingInput[] = [
    { name: "chunk_id",   source: "item_id" },
    { name: "content",    source: "item_content" },
    { name: "text_dense", source: "text_dense" },
  ];
  const loadJob = await client.vectorStore.jobs.create({
    bucketUid,
    collectionName: "my_collection",
    fieldMappings,
    vectorDbConfig: vdb,
  });
  await client.vectorStore.jobs.wait(loadJob.job_uid as string);
}
```

## Error handling

The SDK throws two error types, both importable from `neurolinker-sdk`:

- **`NeuroLinkerAPIError`** — non-2xx response from the API. Carries `statusCode`, `method`, `url`, `responseText`, `responseJson`.
- **`NeuroLinkerConfigError`** — client-side validation failure (missing config, invalid argument, schema validation).

## Migrating from 0.1.x

`0.2.0` is a breaking release: the flat client API was reorganised into five domain modules to match the Python SDK. Mapping table:

| 0.1.x | 0.2.0 |
|---|---|
| `client.tasks.list()` | `client.extraction.listTasks()` |
| `client.extract.extract(...)` | `client.extraction.extract(...)` |
| `client.status.request(id)` | `client.extraction.status.request(id)` |
| `client.status.document(id)` | `client.extraction.status.document(id)` |
| `client.documents.markdown(...)` etc. | `client.extraction.documents.markdown(...)` etc. |
| `client.zip.makeZip(...)` | `client.extraction.makeZip(...)` |
| `client.waitForRequestCompletion({ requestUid, ...overrides })` | `client.extraction.waitForRequest(requestUid, overrides)` |
| `NeuroLinker.extractRequestUid(...)` (static) | `extractRequestUid(...)` top-level export |
| `NeuroLinker.extractDocumentIds(...)` (static) | `extractDocumentIds(...)` top-level export |

New in 0.2.0 (no migration needed — additions only):

- `client.extraction.extractFields(...)`, `client.extraction.generateSchema(...)`, `client.extraction.documents.fields(...)`, `client.extraction.documents.sectionSummaries(...)`
- New modules: `client.management`, `client.chunking`, `client.embedding`, `client.vectorStore`
- New types: `ContentType`, `SummaryType`, `ChunkingConfig`, `EmbeddingModalities`, `CollectionSchema`, `VectorDBConfig`, `FieldDef`, `FieldMapping`, `ModelRef`, `BucketSource`, etc.

The `/v1/make-zip` endpoint URL was also corrected — `client.extraction.makeZip` now hits the right path. If you were using `client.zip.makeZip` and got a 404, the upgrade fixes that.

## Support

- **Platform documentation** (pricing, quotas, account management): https://neurolinker.ainexxo.com/docs/index.html
- **API key & dashboard**: https://neurolinker.ainexxo.com (login → API KEY section)
- **Bug reports & feature requests**: open an issue on the SDK repository.

## License

Released under the MIT License — see the [`LICENSE`](./LICENSE) file at the project root.
