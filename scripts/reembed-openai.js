import { createClient } from "redis";
import {
  INDEX_NAME,
  LOCALES,
  PRODUCT_PREFIX,
  SUGGESTION_KEY,
  createProductIndex,
  enrichProductForSearch,
  productSearchText
} from "./product-utils.js";
import {
  OPENAI_EMBEDDING_DIMENSIONS,
  OPENAI_EMBEDDING_MODEL,
  embedTextsWithOpenAI
} from "./openai-embeddings.js";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const DEFAULT_BATCH_SIZE = Number(process.env.OPENAI_EMBEDDING_BATCH_SIZE ?? 100);

function parseArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    dimensions: OPENAI_EMBEDDING_DIMENSIONS,
    dryRun: false,
    limit: Infinity
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") options.dryRun = true;
    if (arg === "--batch-size") options.batchSize = Number(argv[index + 1]);
    if (arg === "--dimensions") options.dimensions = Number(argv[index + 1]);
    if (arg === "--limit") options.limit = Number(argv[index + 1]);
  }

  if (!Number.isFinite(options.batchSize) || options.batchSize < 1) {
    throw new Error("--batch-size must be a positive number.");
  }
  if (!Number.isFinite(options.dimensions) || options.dimensions < 1) {
    throw new Error("--dimensions must be a positive number.");
  }
  if (options.limit !== Infinity && (!Number.isFinite(options.limit) || options.limit < 1)) {
    throw new Error("--limit must be a positive number.");
  }

  return options;
}

async function dropIndexKeepDocuments(client) {
  try {
    await client.sendCommand(["FT.DROPINDEX", INDEX_NAME]);
  } catch (error) {
    const message = String(error?.message ?? error);
    if (!message.includes("Unknown Index name") && !message.includes("no such index")) throw error;
  }
}

async function scanProductKeys(client, limit) {
  let cursor = "0";
  const keys = [];

  do {
    const [nextCursor, pageKeys] = await client.sendCommand([
      "SCAN",
      cursor,
      "MATCH",
      `${PRODUCT_PREFIX}*`,
      "COUNT",
      "500"
    ]);
    cursor = nextCursor;
    keys.push(...pageKeys);
  } while (cursor !== "0" && keys.length < limit);

  return keys.slice(0, limit);
}

async function loadProduct(client, key) {
  const raw = await client.sendCommand(["JSON.GET", key, "$"]);
  const [product] = JSON.parse(raw);
  return product;
}

async function loadProducts(client, limit) {
  const keys = await scanProductKeys(client, limit);
  const products = [];

  for (const key of keys) {
    const product = await loadProduct(client, key);
    products.push({ key, product });
  }

  return products;
}

async function updateBatch(client, batch) {
  const pipeline = client.multi();
  for (let index = 0; index < batch.length; index += 1) {
    const product = enrichProductForSearch({
      ...batch[index].product,
      embedding: Array.from(batch[index].vector)
    });
    pipeline.sendCommand(["JSON.SET", batch[index].key, "$", JSON.stringify(product)]);
  }
  await pipeline.exec();
}

function multilingualProductSearchText(product) {
  return Object.keys(LOCALES).map((locale) => productSearchText(product, locale)).join(" ");
}

export async function reembedOpenAI() {
  const options = parseArgs(process.argv.slice(2));
  const client = createClient({
    url: redisUrl,
    socket: {
      connectTimeout: 10000,
      reconnectStrategy: false
    }
  });
  client.on("error", (error) => console.error("Redis client error", error));
  console.log(`Connecting to Redis at ${new URL(redisUrl).host}...`);
  await client.connect();
  console.log("Connected to Redis. Loading product documents...");

  try {
    const products = await loadProducts(client, options.limit);
    console.log(`Found ${products.length} product documents in Redis.`);
    console.log(`Embedding model: ${OPENAI_EMBEDDING_MODEL}`);
    console.log(`Embedding dimensions: ${options.dimensions}`);

    if (options.dryRun) {
      console.log("Dry run only. No embeddings, JSON documents, or indexes were changed.");
      for (const { key, product } of products.slice(0, 3)) {
        console.log(`${key}: ${multilingualProductSearchText(product)}`);
      }
      return { count: products.length, dryRun: true };
    }

    const embeddedProducts = [];

    for (let index = 0; index < products.length; index += options.batchSize) {
      const batch = products.slice(index, index + options.batchSize);
      const texts = batch.map(({ product }) => multilingualProductSearchText(product));
      const vectors = await embedTextsWithOpenAI(texts, { dimensions: options.dimensions });
      for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
        embeddedProducts.push({ ...batch[batchIndex], vector: vectors[batchIndex] });
      }
      console.log(`Generated embeddings for ${Math.min(index + batch.length, products.length)} / ${products.length}`);
    }

    await dropIndexKeepDocuments(client);

    for (let index = 0; index < embeddedProducts.length; index += options.batchSize) {
      const batch = embeddedProducts.slice(index, index + options.batchSize);
      await updateBatch(client, batch);
      console.log(`Updated Redis JSON for ${Math.min(index + batch.length, embeddedProducts.length)} / ${embeddedProducts.length}`);
    }

    await createProductIndex(client, options.dimensions);
    const count = await client.sendCommand(["FT.SEARCH", INDEX_NAME, "*", "LIMIT", "0", "0"]);
    console.log(`Recreated ${INDEX_NAME} with ${Number(count[0] ?? 0)} indexed products.`);
    console.log(`Autocomplete suggestions remain in ${SUGGESTION_KEY}.`);

    return { count: products.length, dryRun: false };
  } finally {
    await client.quit();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await reembedOpenAI();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
