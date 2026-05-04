import { createClient } from "redis";
import {
  INDEX_NAME,
  PRODUCT_PREFIX,
  SUGGESTION_KEY,
  VECTOR_DIMENSIONS,
  embedText,
  vectorToBuffer
} from "../scripts/product-utils.js";
import { embedTextWithOpenAI } from "../scripts/openai-embeddings.js";
import { buildFilters, buildPatternQuery, buildTextQuery } from "./search-query.js";

export const client = createClient({
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
  socket: {
    connectTimeout: 10000,
    reconnectStrategy: false
  }
});

client.on("error", (error) => {
  console.error("Redis client error", error);
});

let connectPromise;

export async function connectRedis() {
  if (client.isReady) return;
  if (!connectPromise) {
    connectPromise = client.connect().finally(() => {
      connectPromise = undefined;
    });
  }
  await connectPromise;
}

const PRODUCT_RETURN_FIELDS = [
  "$.id",
  "$.name",
  "$.description",
  "$.franchise",
  "$.character",
  "$.category",
  "$.audience",
  "$.tags",
  "$.price",
  "$.rating",
  "$.popularity"
];

function returnProductFields(extraFields = []) {
  const fields = [...extraFields, ...PRODUCT_RETURN_FIELDS];
  return ["RETURN", String(fields.length), ...fields];
}

let indexedVectorDimensions;

async function getIndexedVectorDimensions() {
  if (indexedVectorDimensions) return indexedVectorDimensions;

  const info = await client.sendCommand(["FT.INFO", INDEX_NAME]);
  const attributesIndex = info.indexOf("attributes");
  const attributes = attributesIndex >= 0 ? info[attributesIndex + 1] ?? [] : [];
  const embeddingAttribute = attributes.find((attribute) => attribute.includes("embedding"));
  const dimensionIndex = embeddingAttribute?.indexOf("dim") ?? -1;
  indexedVectorDimensions =
    dimensionIndex >= 0 ? Number(embeddingAttribute[dimensionIndex + 1]) : VECTOR_DIMENSIONS;

  return indexedVectorDimensions;
}

function parseSuggestionRows(rows) {
  const suggestions = [];
  for (let index = 0; index < rows.length; index += 2) {
    const value = rows[index];
    const payload = rows[index + 1];
    let parsedPayload = {};
    try {
      parsedPayload = payload ? JSON.parse(payload) : {};
    } catch {
      parsedPayload = {};
    }
    suggestions.push({ value, ...parsedPayload });
  }
  return suggestions;
}

function parseSearchRows(rows) {
  if (rows[0] === "total_results") {
    const total = Number(rows[1] ?? 0);
    const resultIndex = rows.indexOf("results");
    const resultRows = resultIndex >= 0 ? rows[resultIndex + 1] ?? [] : [];
    return {
      total,
      products: resultRows.map((fields, index) => parseFields(`result:${index}`, fields))
    };
  }

  const total = Number(rows[0] ?? 0);
  const products = [];

  for (let index = 1; index < rows.length; index += 2) {
    const key = rows[index];
    const fields = rows[index + 1] ?? [];
    products.push(parseFields(key, fields));
  }

  return { total, products };
}

function parseFields(key, fields) {
  const record = { key };
  for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 2) {
    const field = fields[fieldIndex];
    const value = fields[fieldIndex + 1];
    if (field === "$") {
      Object.assign(record, JSON.parse(value));
      delete record.embedding;
    } else {
      const normalizedField = field.replace(/^\$\./, "").replace(/^@/, "").replace(/^__/, "");
      let parsedValue = value;
      if (typeof value === "string" && /^[\[{]/.test(value)) {
        try {
          parsedValue = JSON.parse(value);
        } catch {
          parsedValue = value;
        }
      }
      record[normalizedField] = Number.isNaN(Number(parsedValue)) ? parsedValue : Number(parsedValue);
    }
  }
  return record;
}

function parseAggregateRows(rows) {
  const total = Number(rows[0] ?? 0);
  const groups = [];

  for (let index = 1; index < rows.length; index += 1) {
    const fields = rows[index] ?? [];
    const group = {};
    for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 2) {
      const field = fields[fieldIndex].replace(/^@/, "");
      const value = fields[fieldIndex + 1];
      group[field] = Number.isNaN(Number(value)) ? value : Number(value);
    }
    groups.push(group);
  }

  return { total, groups };
}

export function patternSearchErrorMessage(error) {
  const message = String(error?.message ?? error);
  const missingPatternField =
    message.includes("Unknown field") &&
    ["name_exact", "exact_terms"].some((field) => message.includes(field));

  if (!missingPatternField) return message;

  return [
    "Pattern search needs the updated Redis index with name_exact, exact_terms, and suffix-trie TEXT fields.",
    "Click Seed Redis or run npm run seed, then retry the Pattern search."
  ].join(" ");
}

async function embedQueryText(text) {
  const dimensions = await getIndexedVectorDimensions();
  if (dimensions === VECTOR_DIMENSIONS) return embedText(text);

  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      `Semantic and hybrid search need OPENAI_API_KEY because ${INDEX_NAME} expects ${dimensions}-dimension vectors. Restart the server with OPENAI_API_KEY set, or rerun npm run seed to restore the local ${VECTOR_DIMENSIONS}-dimension demo vectors.`
    );
  }

  const vector = await embedTextWithOpenAI(text);
  if (vector.length !== dimensions) {
    throw new Error(
      `Semantic and hybrid search generated ${vector.length}-dimension vectors, but ${INDEX_NAME} expects ${dimensions}. Re-embed Redis with the same OpenAI model, or rerun npm run seed to restore the local ${VECTOR_DIMENSIONS}-dimension demo vectors.`
    );
  }

  return vector;
}

async function hybridSearch(query, vector, filters, combine, limit) {
  const args = [
    "FT.HYBRID",
    INDEX_NAME,
    "SEARCH",
    query || "*",
    "YIELD_SCORE_AS",
    "text_score",
    "VSIM",
    "@embedding",
    "$vector",
    "KNN",
    "2",
    "K",
    String(limit),
    "YIELD_SCORE_AS",
    "vector_score"
  ];

  if (filters) args.push("FILTER", filters);
  if (combine === "linear") {
    args.push("COMBINE", "LINEAR", "4", "ALPHA", "0.65", "BETA", "0.35");
  } else {
    args.push("COMBINE", "RRF", "2", "CONSTANT", "60");
  }

  args.push(
    "PARAMS",
    "2",
    "vector",
    vectorToBuffer(vector),
    "LIMIT",
    "0",
    String(limit),
    "LOAD",
    String(PRODUCT_RETURN_FIELDS.length + 2),
    ...PRODUCT_RETURN_FIELDS,
    "@text_score",
    "@vector_score"
  );

  return client.sendCommand(args);
}

async function fallbackVectorSearch(query, vector, limit) {
  return client.sendCommand([
    "FT.SEARCH",
    INDEX_NAME,
    `(${query || "*"})=>[KNN ${limit} @embedding $vector AS __vector_score]`,
    "PARAMS",
    "2",
    "vector",
    vectorToBuffer(vector),
    "SORTBY",
    "__vector_score",
    "ASC",
    ...returnProductFields(["__vector_score"]),
    "LIMIT",
    "0",
    String(limit),
    "DIALECT",
    "2"
  ]);
}

async function fullTextSearch(query, limit) {
  return client.sendCommand([
    "FT.SEARCH",
    INDEX_NAME,
    query || "*",
    ...returnProductFields(),
    "LIMIT",
    "0",
    String(limit),
    "DIALECT",
    "2"
  ]);
}

async function vectorSearch(vector, limit) {
  return client.sendCommand([
    "FT.SEARCH",
    INDEX_NAME,
    `*=>[KNN ${limit} @embedding $vector AS vector_score]`,
    "PARAMS",
    "2",
    "vector",
    vectorToBuffer(vector),
    "SORTBY",
    "vector_score",
    "ASC",
    ...returnProductFields(["vector_score"]),
    "LIMIT",
    "0",
    String(limit),
    "DIALECT",
    "2"
  ]);
}

export async function suggestions(term, limit = 8) {
  if (!term?.trim()) return [];
  const rows = await client.sendCommand([
    "FT.SUGGET",
    SUGGESTION_KEY,
    term.trim(),
    "FUZZY",
    "MAX",
    String(limit),
    "WITHPAYLOADS"
  ]);
  return parseSuggestionRows(rows);
}

export async function fullTextProducts(params) {
  const limit = Number(params.limit ?? 12);
  const filters = buildFilters(params);
  const query = buildTextQuery(params.q ?? "", filters);
  const rows = await fullTextSearch(query, limit);
  return { ...parseSearchRows(rows), mode: "FT.SEARCH TEXT" };
}

export async function semanticProducts(params) {
  const limit = Number(params.limit ?? 12);
  const vector = await embedQueryText(`${params.q ?? ""} ${params.category ?? ""} ${params.franchise ?? ""}`);
  const rows = await vectorSearch(vector, limit);
  return { ...parseSearchRows(rows), mode: "FT.SEARCH VECTOR KNN" };
}

export async function filteredProducts(params) {
  const limit = Number(params.limit ?? 12);
  const filters = buildFilters(params);
  const query = buildTextQuery(params.q ?? "", filters);
  const rows = await fullTextSearch(query, limit);
  return { ...parseSearchRows(rows), mode: "FT.SEARCH FILTERS" };
}

export async function patternProducts(params) {
  const limit = Number(params.limit ?? 12);
  const filters = buildFilters(params);
  const query = buildPatternQuery(params.q ?? "", filters);
  try {
    const rows = await fullTextSearch(query, limit);
    return { ...parseSearchRows(rows), mode: "FT.SEARCH PATTERN" };
  } catch (error) {
    throw new Error(patternSearchErrorMessage(error), { cause: error });
  }
}

export async function aggregateProducts(params) {
  const filters = buildFilters(params);
  const query = buildTextQuery(params.q ?? "", filters);
  const rows = await client.sendCommand([
    "FT.AGGREGATE",
    INDEX_NAME,
    query || "*",
    "GROUPBY",
    "1",
    "@category",
    "REDUCE",
    "COUNT",
    "0",
    "AS",
    "products",
    "REDUCE",
    "AVG",
    "1",
    "@price",
    "AS",
    "avg_price",
    "REDUCE",
    "MAX",
    "1",
    "@popularity",
    "AS",
    "top_popularity",
    "SORTBY",
    "2",
    "@products",
    "DESC",
    "LIMIT",
    "0",
    "8",
    "DIALECT",
    "2"
  ]);
  return { ...parseAggregateRows(rows), mode: "FT.AGGREGATE GROUPBY" };
}

export async function searchProducts(params) {
  const limit = Number(params.limit ?? 12);
  const filters = buildFilters(params);
  const query = buildTextQuery(params.q ?? "", filters);
  const vector = await embedQueryText(`${params.q ?? ""} ${params.category ?? ""} ${params.franchise ?? ""}`);

  try {
    const rows = await hybridSearch(query, vector, filters, params.combine, limit);
    return { ...parseSearchRows(rows), mode: `FT.HYBRID ${params.combine === "linear" ? "LINEAR" : "RRF"}` };
  } catch (error) {
    const rows = await fallbackVectorSearch(query, vector, limit);
    return {
      ...parseSearchRows(rows),
      mode: "FT.SEARCH KNN fallback",
      warning: String(error?.message ?? error)
    };
  }
}

export async function facets() {
  const rows = await client.sendCommand([
    "FT.SEARCH",
    INDEX_NAME,
    "*",
    "LIMIT",
    "0",
    "2000",
    "RETURN",
    "3",
    "$.category",
    "$.franchise",
    "$.audience",
    "DIALECT",
    "2"
  ]);
  const { products } = parseSearchRows(rows);
  const unique = (field) => [...new Set(products.map((product) => product[field]).filter(Boolean))].sort();
  return {
    categories: unique("category"),
    franchises: unique("franchise"),
    audiences: unique("audience")
  };
}

export async function health() {
  const ping = await client.ping();
  const count = await client.sendCommand(["FT.SEARCH", INDEX_NAME, "*", "LIMIT", "0", "0"]).catch(() => [0]);
  return { ping, index: INDEX_NAME, productPrefix: PRODUCT_PREFIX, count: Number(count[0] ?? 0) };
}
