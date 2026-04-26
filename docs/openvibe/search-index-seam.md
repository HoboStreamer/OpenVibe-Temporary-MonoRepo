# Search-index seam

`openvibe-ai` ships with a built-in **local SQLite-backed** search
index (`search_documents` table) so that every product can index and
query without external infrastructure.

## API

| Endpoint | Purpose |
| --- | --- |
| `POST /api/v1/ai/search/index`   | upsert a document |
| `POST /api/v1/ai/search/query`   | query — supports `q`, `index_key`, `document_type`, `visibility` |
| `POST /api/v1/ai/search/delete`  | remove a document by `(index_key, document_type, document_id)` |
| `GET  /api/v1/ai/search/status`  | provider + per-status counts |

The local provider id is `local-sqlite`. Documents with
`indexing_status='blocked'` are filtered from results, and
`visibility` is honored in `querySearchIndex`.

## Future adapters

The `searchIndexStatus()` envelope returns `provider`, so future
phases can swap in **Meilisearch**, **Typesense**, or **OpenSearch**
adapters by providing an alternate implementation while keeping the
SDK contract (`AiClient.indexSearchDocument` / `querySearchIndex` /
`deleteSearchDocument`) unchanged. Configuration env-var name
prefixes for those adapters are already reserved in `config.ai.allowedKeyEnvPrefixes`.
