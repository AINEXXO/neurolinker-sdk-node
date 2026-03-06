# neurolinker-sdk
A Node.js/TypeScript SDK for the NeuroLinker API from Ainexxo S.R.L. The SDK provides an async client to submit documents, track extraction jobs, and retrieve processed results.

**Download**

```bash
npm install neurolinker-sdk
```

**Initial Setup**

The steps below are for contributors or anyone running tests locally.

```bash
npm install
```

Build:

```bash
npm run build
```

Optional linting:

```bash
npm run lint
```

Run tests:

```bash
npm test
```

**Usage**

Set credentials in environment variables (API key is required).

`NEUROLINKER_API_KEY` (required): generate it from the official NeuroLinker website https://neurolinker.ainexxo.com/ (login and go to the API KEY section).

`NEUROLINKER_BASE_URL` (optional): overrides the default API endpoint. If not set, the SDK uses `https://neurolinker.api.ainexxo.com`.

```bash
export NEUROLINKER_API_KEY="your_token"
# Optional (override default API endpoint)
export NEUROLINKER_BASE_URL="https://neurolinker.api.ainexxo.com"
```

If you prefer `.env`, load it in your app (for example with `dotenv/config`) before creating the client.

### Quick start

- Explicit token:

```ts
import { NeuroLinker } from "neurolinker-sdk";

const client = new NeuroLinker({ token: "nl_****" });
const tasks = await client.tasks.list();
```

- From environment:

```ts
import "dotenv/config";
import { NeuroLinker } from "neurolinker-sdk";

const client = NeuroLinker.fromEnv();
const tasks = await client.tasks.list();
```

- CommonJS:

```js
const { NeuroLinker } = require("neurolinker-sdk");

async function main() {
  const client = new NeuroLinker({ token: process.env.NEUROLINKER_API_KEY });
  const tasks = await client.tasks.list();
  console.log(tasks);
}

main();
```

### SDK functionality (minimal usage + parameters)

#### Client constructor

```ts
new NeuroLinker({
  token,
  baseUrl,
  timeoutS,
  pollIntervalS,
  pollMaxIntervalS,
});
```

Minimal constructor is `new NeuroLinker({ token })`. Other parameters are optional:
- `baseUrl` defaults to `NEUROLINKER_BASE_URL` if set, otherwise `https://neurolinker.api.ainexxo.com`
- `timeoutS` defaults to `600`
- `pollIntervalS` defaults to `2`
- `pollMaxIntervalS` defaults to `10`

Or with environment variables:

```ts
NeuroLinker.fromEnv({ timeoutS, pollIntervalS, pollMaxIntervalS });
```

`fromEnv()` reads:
- `NEUROLINKER_API_KEY` (required)
- `NEUROLINKER_BASE_URL` (optional)
- `NEUROLINKER_E2E_TIMEOUT_S`, (optional)
- `NEUROLINKER_E2E_POLL_INTERVAL_S`, (optional)
- `NEUROLINKER_E2E_POLL_MAX_INTERVAL_S` (optional)

### Available methods

> Note: many extraction actions are asynchronous server-side. The SDK includes a polling helper (`waitForRequestCompletion`) to wait for terminal status.

| Method | Description |
| --- | --- |
| `await client.tasks.list()` | List processing tasks available in the system. |
| `await client.extract.extract({ documents: [{ filename, content: Buffer }], urls, alias, description })` | Submit an extraction request. `documents` and `urls` are mutually exclusive. |
| `await client.status.request(requestId)` | Check extraction request status by request ID. |
| `await client.status.document(documentId)` | Check status for a single document by document ID. |
| `NeuroLinker.extractRequestUid(extractResponse)` or `extractRequestUid(extractResponse)` | Extract `request_uid` from extract response (supports top-level and nested `data`). |
| `NeuroLinker.extractDocumentIds(statusResponse)` or `extractDocumentIds(statusResponse)` | Extract document IDs from a request-status response. |
| `await client.waitForRequestCompletion({ requestUid, timeoutS, pollIntervalS, pollMaxIntervalS })` | Poll until terminal status (`completed`, `failed`, `pending`). Handles transient `404` during early processing. |
| `await client.documents.markdown(documentIds, { contentTypes })` | Retrieve markdown results for document IDs. |
| `await client.documents.json(documentIds, { contentTypes })` | Retrieve JSON results for document IDs. |
| `await client.documents.images(documentIds)` | Retrieve extracted image metadata for document IDs. |
| `await client.documents.pageSummaries(documentIds)` | Retrieve per-page summaries. |
| `await client.documents.sectionSummaries(documentIds)` | Retrieve summaries grouped by detected sections. |
| `await client.documents.documentSummary(documentIds, { summaryType })` | Retrieve a consolidated summary. `summaryType`: `"page"` or `"section"`. |
| `await client.zip.makeZip({ jobUid, documentUid, localImages, contentTypes })` | Request a ZIP archive URL for an extraction job (or a specific document). |
| `ContentType` | Use `ContentType.TEXT`, `ContentType.FORMULA`, `ContentType.TABLES`, `ContentType.IMAGES` for markdown/json/zip content filters. |
| `SummaryType` | Use `SummaryType.PAGE` or `SummaryType.SECTION` for `documentSummary`. |
| `NeuroLinkerAPIError`, `NeuroLinkerConfigError` | Exceptions for non-2xx API responses or missing/invalid configuration. |

Tests in this repository cover URL-based extraction, local file uploads, polling behavior, section endpoints, content type filters, and ZIP creation. See `tests/`.

E2E tests use these environment variables:

- `NEUROLINKER_API_KEY` (required): generate it from https://neurolinker.ainexxo.com/ (API KEY section).
- `NEUROLINKER_BASE_URL` (optional): overrides default API endpoint.
- `NEUROLINKER_TEST_PDF_URL` (required for URL-based E2E tests): web URL of a PDF downloadable by backend (example: `https://arxiv.org/pdf/...`).
- `NEUROLINKER_TEST_PDF_PATH` or `NEUROLINKER_TEST_PDF_PATHS` (required for local upload E2E tests): local PDF path(s), comma-separated for multiple files.
- `NEUROLINKER_E2E_TIMEOUT_S`, `NEUROLINKER_E2E_POLL_INTERVAL_S`, `NEUROLINKER_E2E_POLL_MAX_INTERVAL_S` (optional): defaults are `600`, `2`, `10`.
