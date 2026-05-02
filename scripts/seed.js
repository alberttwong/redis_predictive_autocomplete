import { createClient } from "redis";
import { buildProducts } from "./generate-data.js";
import {
  INDEX_NAME,
  PRODUCT_PREFIX,
  SUGGESTION_KEY,
  VECTOR_DIMENSIONS,
  embedText,
  productSearchText,
  vectorToBuffer
} from "./product-utils.js";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

async function dropIfExists(client, indexName) {
  try {
    await client.sendCommand(["FT.DROPINDEX", indexName, "DD"]);
  } catch (error) {
    if (!String(error?.message ?? error).includes("Unknown Index name")) throw error;
  }
}

async function createIndex(client) {
  await client.sendCommand([
    "FT.CREATE",
    INDEX_NAME,
    "ON",
    "JSON",
    "PREFIX",
    "1",
    PRODUCT_PREFIX,
    "SCHEMA",
    "$.name",
    "AS",
    "name",
    "TEXT",
    "WEIGHT",
    "5.0",
    "$.description",
    "AS",
    "description",
    "TEXT",
    "WEIGHT",
    "1.0",
    "$.franchise",
    "AS",
    "franchise",
    "TAG",
    "SORTABLE",
    "$.character",
    "AS",
    "character",
    "TAG",
    "$.category",
    "AS",
    "category",
    "TAG",
    "SORTABLE",
    "$.audience",
    "AS",
    "audience",
    "TAG",
    "$.tags[*]",
    "AS",
    "tags",
    "TAG",
    "$.price",
    "AS",
    "price",
    "NUMERIC",
    "SORTABLE",
    "$.rating",
    "AS",
    "rating",
    "NUMERIC",
    "SORTABLE",
    "$.popularity",
    "AS",
    "popularity",
    "NUMERIC",
    "SORTABLE",
    "$.embedding",
    "AS",
    "embedding",
    "VECTOR",
    "HNSW",
    "6",
    "TYPE",
    "FLOAT32",
    "DIM",
    String(VECTOR_DIMENSIONS),
    "DISTANCE_METRIC",
    "COSINE"
  ]);
}

export async function seed() {
  const client = createClient({ url: redisUrl });
  client.on("error", (error) => console.error("Redis client error", error));
  await client.connect();

  const products = buildProducts(2000).map((product) => ({
    ...product,
    embedding: Array.from(embedText(productSearchText(product)))
  }));

  await dropIfExists(client, INDEX_NAME);
  await client.del(SUGGESTION_KEY);
  await createIndex(client);

  const pipeline = client.multi();
  for (const product of products) {
    pipeline.json.set(`${PRODUCT_PREFIX}${product.id}`, "$", product);
    pipeline.sendCommand([
      "FT.SUGADD",
      SUGGESTION_KEY,
      product.name,
      String(product.popularity),
      "PAYLOAD",
      JSON.stringify({ id: product.id, category: product.category, franchise: product.franchise })
    ]);
    pipeline.sendCommand([
      "FT.SUGADD",
      SUGGESTION_KEY,
      `${product.character} ${product.category}`,
      String(Math.max(1, product.popularity - 10)),
      "PAYLOAD",
      JSON.stringify({ id: product.id, category: product.category, franchise: product.franchise })
    ]);
  }
  await pipeline.exec();

  const info = await client.sendCommand(["FT.INFO", INDEX_NAME]);
  await client.quit();

  return { count: products.length, indexInfo: info };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = await seed();
    console.log(`Seeded ${result.count} Disney products into ${redisUrl}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
