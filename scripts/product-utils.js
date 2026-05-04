export const VECTOR_DIMENSIONS = 32;
export const INDEX_NAME = "idx:disney_products";
export const PRODUCT_PREFIX = "product:";
export const SUGGESTION_KEY = "suggest:disney_products";

const tokenWeights = new Map([
  ["mickey", 1.8],
  ["minnie", 1.7],
  ["stitch", 1.9],
  ["elsa", 1.8],
  ["moana", 1.6],
  ["marvel", 1.5],
  ["star", 1.4],
  ["wars", 1.4],
  ["princess", 1.6],
  ["plush", 1.3],
  ["toy", 1.2],
  ["apparel", 1.1],
  ["home", 1.1],
  ["collectible", 1.4],
  ["limited", 1.5],
  ["holiday", 1.3],
  ["light", 1.2],
  ["music", 1.2],
  ["kitchen", 1.1],
  ["park", 1.4]
]);

function hashToken(token, salt = 0) {
  let hash = 2166136261 + salt;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export function embedText(text) {
  const vector = new Float32Array(VECTOR_DIMENSIONS);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  for (const token of tokens) {
    const weight = tokenWeights.get(token) ?? 1;
    for (let salt = 0; salt < 3; salt += 1) {
      const slot = hashToken(token, salt) % VECTOR_DIMENSIONS;
      const direction = hashToken(`${token}:${salt}`, 17) % 2 === 0 ? 1 : -1;
      vector[slot] += direction * weight * (1 / (salt + 1));
    }
  }

  let magnitude = 0;
  for (const value of vector) magnitude += value * value;
  magnitude = Math.sqrt(magnitude) || 1;
  for (let index = 0; index < vector.length; index += 1) {
    vector[index] = vector[index] / magnitude;
  }

  return vector;
}

export function vectorToBuffer(vector) {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}

export function escapeTag(value) {
  return String(value).replace(/([,.<>{}\[\]"':;!@#$%^&*()\-+=~ ])/g, "\\$1");
}

export function escapeSearchTerm(value) {
  return String(value)
    .trim()
    .replace(/([,.<>{}\[\]"':;!@#$%^&*()\-+=~\/\\])/g, " ")
    .replace(/\s+/g, " ");
}

export function normalizeSearchText(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function searchTokens(value) {
  return normalizeSearchText(value).split(" ").filter(Boolean);
}

export function productSearchText(product) {
  return [
    product.name,
    product.franchise,
    product.character,
    product.category,
    product.audience,
    product.tags.join(" "),
    product.description
  ].join(" ");
}

export function productSearchMetadata(product) {
  const text = productSearchText(product);
  const tokens = [...new Set(searchTokens(text))];

  return {
    name_exact: normalizeSearchText(product.name),
    exact_terms: tokens
  };
}

export function enrichProductForSearch(product) {
  const {
    contains_grams: _legacyContainsGrams,
    reverse_tokens: _legacyReverseTokens,
    exact_terms: _legacyExactTerms,
    name_exact: _legacyNameExact,
    ...baseProduct
  } = product;

  return {
    ...baseProduct,
    ...productSearchMetadata(baseProduct)
  };
}

export async function createProductIndex(client, dimensions = VECTOR_DIMENSIONS) {
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
    "WITHSUFFIXTRIE",
    "$.description",
    "AS",
    "description",
    "TEXT",
    "WEIGHT",
    "1.0",
    "WITHSUFFIXTRIE",
    "$.name_exact",
    "AS",
    "name_exact",
    "TAG",
    "$.exact_terms[*]",
    "AS",
    "exact_terms",
    "TAG",
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
    String(dimensions),
    "DISTANCE_METRIC",
    "COSINE"
  ]);
}
