import { createClient } from "redis";
import { buildProducts } from "./generate-data.js";
import {
  INDEX_NAME,
  LOCALES,
  PRODUCT_PREFIX,
  createProductIndex,
  embedText,
  enrichProductForSearch,
  productSearchText,
  suggestionKeyForLocale,
} from "./product-utils.js";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

async function dropIfExists(client, indexName) {
  try {
    await client.sendCommand(["FT.DROPINDEX", indexName, "DD"]);
  } catch (error) {
    const message = String(error?.message ?? error);
    if (!message.includes("Unknown Index name") && !message.includes("no such index")) throw error;
  }
}

export async function seed() {
  const client = createClient({
    url: redisUrl,
    socket: {
      connectTimeout: 10000,
      reconnectStrategy: false
    }
  });
  client.on("error", (error) => console.error("Redis client error", error));
  await client.connect();

  const products = buildProducts(2000).map((product) => {
    const multilingualText = Object.keys(LOCALES).map((locale) => productSearchText(product, locale)).join(" ");
    return enrichProductForSearch({
      ...product,
      embedding: Array.from(embedText(multilingualText))
    });
  });

  await dropIfExists(client, INDEX_NAME);
  await client.del(Object.keys(LOCALES).map((locale) => suggestionKeyForLocale(locale)));
  await createProductIndex(client);

  const pipeline = client.multi();
  for (const product of products) {
    pipeline.json.set(`${PRODUCT_PREFIX}${product.id}`, "$", product);
    for (const locale of Object.keys(LOCALES)) {
      const nameField = locale === "en" ? "name" : `name_${locale}`;
      const characterField = locale === "en" ? "character" : `character_${locale}`;
      const categoryField = locale === "en" ? "category" : `category_${locale}`;
      pipeline.sendCommand([
        "FT.SUGADD",
        suggestionKeyForLocale(locale),
        product[nameField],
        String(product.popularity),
        "PAYLOAD",
        JSON.stringify({ id: product.id, category: product.category, franchise: product.franchise, locale })
      ]);
      pipeline.sendCommand([
        "FT.SUGADD",
        suggestionKeyForLocale(locale),
        `${product[characterField] ?? product.character} ${product[categoryField] ?? product.category}`,
        String(Math.max(1, product.popularity - 10)),
        "PAYLOAD",
        JSON.stringify({ id: product.id, category: product.category, franchise: product.franchise, locale })
      ]);
    }
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
