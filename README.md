# Redis Predictive Autocomplete Demo

This demo uses Redis 8.6 with JSON, Query Engine, autocomplete suggestions, tag/numeric filters, vector search, and native `FT.HYBRID` score fusion when available.

Redis docs used for the implementation:

- Redis 8.6 is the current docs entry for latest Redis Open Source.
- Redis 8 merged Redis Stack-style functionality into one Redis distribution.
- Autocomplete uses `FT.SUGADD` and fuzzy `FT.SUGGET`.
- Hybrid retrieval uses `FT.HYBRID` when supported, with an `FT.SEARCH` KNN fallback.

## Run it

```bash
npm install
docker compose up -d
npm run seed
npm run dev
```

Open the Vite URL, usually `http://localhost:5173`.

## What gets loaded

`npm run seed` creates:

- `idx:disney_products`: Redis JSON search index over `product:*`
- 2000 Disney-style product documents
- HNSW FLOAT32 vectors with 32 dimensions
- `suggest:disney_products`: autocomplete dictionary with product names and character/category phrases

## Search modes

The UI at `http://localhost:5173` includes live examples for four Redis search paths:

- Fuzzy autocomplete: `/api/suggest?q=stitc&limit=8`
- Full-text search: `/api/search/fulltext?q=stitch%20hoodie&limit=8`
- Semantic vector search: `/api/search/semantic?q=space%20robot%20collectible%20display&limit=8`
- Hybrid search: `/api/search?q=ocean%20adventure%20kids%20toy&combine=rrf&limit=8`
- Filters and facets: `/api/search/filters?q=classic&category=Toy&minPrice=20&maxPrice=60&limit=8`
- Aggregations: `/api/search/aggregate?q=classic`

You can also write the generated sample set to disk:

```bash
npm run generate:data
```

That creates `data/disney-products.json`.

## OpenAI embeddings

The default seed path uses a local 32-dimension demo embedding so the app works without an API key. To replace the stored vectors with OpenAI `text-embedding-3-small` embeddings and rebuild the Redis vector index at 1536 dimensions:

```bash
OPENAI_API_KEY=... npm run embeddings:openai
```

Useful options:

```bash
OPENAI_API_KEY=... npm run embeddings:openai -- --batch-size 50
OPENAI_API_KEY=... npm run embeddings:openai -- --limit 25
npm run embeddings:openai -- --dry-run --limit 3
```

After re-embedding Redis, restart the server with `OPENAI_API_KEY` set so semantic and hybrid search queries use the same model as the stored product vectors. The script keeps product JSON documents and autocomplete suggestions, drops only the search index, updates `$.embedding`, then recreates `idx:disney_products`.

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
