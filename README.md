# Redis Predictive Autocomplete Demo

This demo uses Redis 8.6 with JSON, Query Engine, autocomplete suggestions, tag/numeric filters, vector search, and native `FT.HYBRID` score fusion when available.

Redis docs used for the implementation:

- Redis 8.6 is the current docs entry for latest Redis Open Source.
- Redis 8 merged Redis Stack-style functionality into one Redis distribution.
- Autocomplete uses `FT.SUGADD` and fuzzy `FT.SUGGET`.
- Hybrid retrieval uses `FT.HYBRID` when supported, with an `FT.SEARCH` KNN fallback.

## Run it

For local Redis with the built-in demo embeddings:

```bash
npm install
docker compose up -d
npm run seed
npm run dev
```

Open the Vite URL, usually `http://localhost:5173`.

For the Redis Cloud database in this workspace, `.env` already points `REDIS_URL` at the non-Flex cloud database, so you do not need `docker compose up -d`.

## What gets loaded

`npm run seed` creates:

- `idx:disney_products`: Redis JSON search index over `product:*`
- 2000 Disney-style product documents
- HNSW FLOAT32 vectors with 32 dimensions
- English, Spanish, French, and Chinese product name/description fields
- helper fields for exact, contains, suffix, prefix, fuzzy, partial, and multi-word pattern search per language
- locale-specific autocomplete dictionaries with product names and character/category phrases

## Search modes

The UI at `http://localhost:5173` includes live examples for Redis search paths:

- Fuzzy autocomplete: `/api/suggest?q=stitc&limit=8`
- Full-text search: `/api/search/fulltext?q=stitch%20hoodie&limit=8`
- Pattern search: `/api/search/pattern?q=itch%20hood&limit=8`
- Semantic vector search: `/api/search/semantic?q=space%20robot%20collectible%20display&limit=8`
- Hybrid search: `/api/search?q=ocean%20adventure%20kids%20toy&combine=rrf&limit=8`
- Filters and facets: `/api/search/filters?q=classic&category=Toy&minPrice=20&maxPrice=60&limit=8`
- Aggregations: `/api/search/aggregate?q=classic`

All text-oriented endpoints accept `locale` or `lang` values of `en`, `es`, `fr`, or `zh`:

```bash
curl 'http://localhost:3001/api/suggest?q=史迪奇&locale=zh&limit=5'
curl 'http://localhost:3001/api/search/fulltext?q=camiseta%20stitch&locale=es&limit=5'
curl 'http://localhost:3001/api/search/pattern?q=figurine%20vinyle&locale=fr&limit=5'
curl 'http://localhost:3001/api/search?q=蓝色%20儿童%20毛绒玩具&locale=zh&combine=rrf&limit=5'
```

Run `npm run seed` after pulling multilingual search changes so Redis recreates `idx:disney_products` with the localized `TEXT` and helper fields plus `suggest:disney_products:es`, `suggest:disney_products:fr`, and `suggest:disney_products:zh`.

You can also write the generated sample set to disk:

```bash
npm run generate:data
```

That creates `data/disney-products.json`.

## OpenAI embeddings

The default seed path uses a local 32-dimension demo embedding so the app works without an API key. To replace the stored vectors with OpenAI `text-embedding-3-small` embeddings and rebuild the Redis vector index at 1536 dimensions:

```bash
read -s OPENAI_API_KEY
export OPENAI_API_KEY
npm run embeddings:openai -- --batch-size 50
```

Useful options:

```bash
npm run embeddings:openai -- --dry-run --limit 3
npm run embeddings:openai -- --limit 25
npm run embeddings:openai -- --batch-size 100
```

Expected output from a full run:

```text
Found 2000 product documents in Redis.
Embedding model: text-embedding-3-small
Embedding dimensions: 1536
Generated embeddings for 2000 / 2000
Updated Redis JSON for 2000 / 2000
Recreated idx:disney_products with 2000 indexed products.
```

After re-embedding Redis, restart the server with `OPENAI_API_KEY` set so semantic and hybrid search queries use the same model as the stored product vectors:

```bash
npm run dev
```

If `idx:disney_products` expects 1536-dimension vectors and the server is started without `OPENAI_API_KEY`, semantic and hybrid search will return an error. Fuzzy autocomplete, full-text search, filters/facets, and aggregations do not need OpenAI.

Pattern search uses regular Redis Query Engine fields plus generated helper fields:

- prefix, fuzzy, contains, and suffix clauses over normal `TEXT` fields with `WITHSUFFIXTRIE`
- `name_exact` and `exact_terms` `TAG` fields for exact matching
- one required match group per query token for multi-word search

The script keeps product JSON documents and autocomplete suggestions, drops only the search index, updates `$.embedding`, then recreates `idx:disney_products`. Running `npm run seed` later resets the dataset back to the local 32-dimension demo vectors.

Quick checks:

```bash
curl 'http://localhost:3001/api/health'
curl 'http://localhost:3001/api/search/semantic?q=warm%20blue%20alien%20plush%20for%20kids&limit=5'
curl 'http://localhost:3001/api/search?q=space%20robot%20collectible%20display&combine=rrf&limit=5'
```

## Redis Cloud deployment

This workspace is currently pointed at a non-Flex Redis Cloud database via `.env`.

- Subscription: `redis-disney-autocomplete-nonflex` (`3246065`)
- Database: `disney-autocomplete` (`14263116`)
- Endpoint: `digestion-touch-retrosweet-25097.db.redis.io:18440`
- Redis Cloud reported version: Redis `8.4`, Search `8.4.7`, RedisJSON `8.4.3`
- Verified: `FT.SUGGET`, `FT.SEARCH`, and native `FT.HYBRID` work against the cloud endpoint

The local Docker path still uses `redis:8.6` for current local Redis Open Source testing.

## Delete Redis Cloud resources

The deletion helper defaults to a dry run:

```bash
REDIS_CLOUD_API_KEY=... REDIS_CLOUD_API_SECRET=... npm run redis-cloud:delete
```

Delete only the demo database:

```bash
REDIS_CLOUD_API_KEY=... REDIS_CLOUD_API_SECRET=... npm run redis-cloud:delete -- --target database --execute
```

Delete the whole non-Flex demo subscription:

```bash
REDIS_CLOUD_API_KEY=... REDIS_CLOUD_API_SECRET=... npm run redis-cloud:delete -- --target subscription --execute
```
