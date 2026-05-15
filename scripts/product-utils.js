export const VECTOR_DIMENSIONS = 32;
export const INDEX_NAME = "idx:disney_products";
export const PRODUCT_PREFIX = "product:";
export const SUGGESTION_KEY = "suggest:disney_products";

export const LOCALES = {
  en: { label: "English", redisLanguage: "english", suffix: "" },
  es: { label: "Spanish", redisLanguage: "spanish", suffix: "_es" },
  fr: { label: "French", redisLanguage: "french", suffix: "_fr" },
  zh: { label: "Chinese", redisLanguage: "chinese", suffix: "_zh" }
};

export function normalizeLocale(value) {
  const locale = String(value ?? "en").toLowerCase().split(/[-_]/)[0];
  return LOCALES[locale] ? locale : "en";
}

export function localeConfig(locale) {
  return LOCALES[normalizeLocale(locale)];
}

export function localizedField(field, locale) {
  return `${field}${localeConfig(locale).suffix}`;
}

export function suggestionKeyForLocale(locale) {
  const normalized = normalizeLocale(locale);
  return normalized === "en" ? SUGGESTION_KEY : `${SUGGESTION_KEY}:${normalized}`;
}

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
  const tokens = searchTokens(text);

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

export function normalizeSearchText(value, locale = "en") {
  return tokenizeSearchText(value, locale).join(" ");
}

export function tokenizeSearchText(value, locale = "en") {
  const normalized = normalizeLocale(locale);
  const text = String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();

  if (!text) return [];

  if (normalized === "zh") {
    return text.split(/\s+/).filter(Boolean);
  }

  return text.split(/\s+/).filter(Boolean);
}

export function searchTokens(value, locale = "en") {
  return tokenizeSearchText(value, locale);
}

export function productSearchText(product, locale = "en") {
  const normalized = normalizeLocale(locale);
  const name = localizedField("name", normalized);
  const description = localizedField("description", normalized);
  const character = localizedField("character", normalized);
  const category = localizedField("category", normalized);
  const audience = localizedField("audience", normalized);
  return [
    product[name] ?? product.name,
    product.franchise,
    product[character] ?? product.character,
    product[category] ?? product.category,
    product[audience] ?? product.audience,
    product.tags.join(" "),
    product[description] ?? product.description
  ].join(" ");
}

export function productSearchMetadata(product) {
  const metadata = {};

  for (const locale of Object.keys(LOCALES)) {
    const nameField = localizedField("name", locale);
    const nameExactField = localizedField("name_exact", locale);
    const exactTermsField = localizedField("exact_terms", locale);
    const text = productSearchText(product, locale);
    const tokens = [...new Set(searchTokens(text, locale))];

    metadata[nameExactField] = normalizeSearchText(product[nameField] ?? product.name, locale);
    metadata[exactTermsField] = tokens;
  }

  return metadata;
}

export function enrichProductForSearch(product) {
  const {
    contains_grams: _legacyContainsGrams,
    reverse_tokens: _legacyReverseTokens,
    exact_terms: _legacyExactTerms,
    name_exact: _legacyNameExact,
    exact_terms_es: _legacyExactTermsEs,
    name_exact_es: _legacyNameExactEs,
    exact_terms_fr: _legacyExactTermsFr,
    name_exact_fr: _legacyNameExactFr,
    exact_terms_zh: _legacyExactTermsZh,
    name_exact_zh: _legacyNameExactZh,
    ...baseProduct
  } = product;

  return {
    ...baseProduct,
    ...productSearchMetadata(baseProduct)
  };
}

export async function createProductIndex(client, dimensions = VECTOR_DIMENSIONS) {
  const textSchema = Object.keys(LOCALES).flatMap((locale) => {
    const weight = locale === "en" ? ["WEIGHT", "5.0"] : ["WEIGHT", "4.0"];
    return [
      `$.${localizedField("name", locale)}`,
      "AS",
      localizedField("name", locale),
      "TEXT",
      ...weight,
      "WITHSUFFIXTRIE",
      `$.${localizedField("description", locale)}`,
      "AS",
      localizedField("description", locale),
      "TEXT",
      "WEIGHT",
      "1.0",
      "WITHSUFFIXTRIE",
      `$.${localizedField("name_exact", locale)}`,
      "AS",
      localizedField("name_exact", locale),
      "TAG",
      `$.${localizedField("exact_terms", locale)}[*]`,
      "AS",
      localizedField("exact_terms", locale),
      "TAG"
    ];
  });

  await client.sendCommand([
    "FT.CREATE",
    INDEX_NAME,
    "ON",
    "JSON",
    "PREFIX",
    "1",
    PRODUCT_PREFIX,
    "SCHEMA",
    ...textSchema,
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
