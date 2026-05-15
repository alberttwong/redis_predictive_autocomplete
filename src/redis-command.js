import { INDEX_NAME, escapeTag, localeConfig, suggestionKeyForLocale } from "../scripts/product-utils.js";
import { buildFilters, buildPatternQuery, buildTextQuery } from "./search-query.js";

function quoteRedisCliArgument(argument) {
  return `"${String(argument).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function buildRedisCommand(activeMode, query, combine, filters, locale = "en") {
  const safeQuery = query.trim() || "*";
  const categoryFilter = filters.category || "Toy";
  const minPriceFilter = filters.minPrice || "20";
  const maxPriceFilter = filters.maxPrice || "60";
  const language = localeConfig(locale).redisLanguage;

  if (activeMode === "fuzzy") {
    return `FT.SUGGET ${suggestionKeyForLocale(locale)} ${quoteRedisCliArgument(safeQuery)} FUZZY MAX 8 WITHPAYLOADS`;
  }

  if (activeMode === "fulltext") {
    const textQuery = buildTextQuery(query, "", locale);
    return `FT.SEARCH ${INDEX_NAME} ${quoteRedisCliArgument(textQuery)} LANGUAGE ${language} LIMIT 0 8 LOAD 1 $ DIALECT 2`;
  }

  if (activeMode === "pattern") {
    const filterQuery = buildFilters(filters);
    const patternQuery = buildPatternQuery(query, filterQuery, locale);
    return `FT.SEARCH ${INDEX_NAME} ${quoteRedisCliArgument(patternQuery)} LANGUAGE ${language} LIMIT 0 8 LOAD 1 $ DIALECT 2`;
  }

  if (activeMode === "semantic") {
    return [
      `FT.SEARCH ${INDEX_NAME} ${quoteRedisCliArgument("*=>[KNN 8 @embedding $vector AS vector_score]")}`,
      "PARAMS 2 vector <query_embedding_float32_blob>",
      "SORTBY vector_score ASC",
      "LIMIT 0 8 LOAD 2 $ vector_score DIALECT 2"
    ].join("\n");
  }

  if (activeMode === "filters") {
    const filterQuery = [
      buildTextQuery(query, "", locale),
      `@category:{${escapeTag(categoryFilter)}}`,
      `@price:[${minPriceFilter} ${maxPriceFilter}]`
    ].join(" ");
    return `FT.SEARCH ${INDEX_NAME} ${quoteRedisCliArgument(filterQuery)} LANGUAGE ${language} LIMIT 0 8 LOAD 1 $ DIALECT 2`;
  }

  if (activeMode === "aggregate") {
    const textQuery = buildTextQuery(query, "", locale);
    return [
      `FT.AGGREGATE ${INDEX_NAME} ${quoteRedisCliArgument(textQuery)}`,
      "GROUPBY 1 @category",
      "REDUCE COUNT 0 AS products",
      "REDUCE AVG 1 @price AS avg_price",
      "REDUCE MAX 1 @popularity AS top_popularity",
      "SORTBY 2 @products DESC LIMIT 0 8 DIALECT 2"
    ].join("\n");
  }

  return [
    `FT.HYBRID ${INDEX_NAME}`,
    `SEARCH ${quoteRedisCliArgument(buildTextQuery(query, "", locale))} YIELD_SCORE_AS text_score`,
    "VSIM @embedding $vector KNN 2 K 8 YIELD_SCORE_AS vector_score",
    combine === "linear" ? "COMBINE LINEAR 4 ALPHA 0.65 BETA 0.35" : "COMBINE RRF 2 CONSTANT 60",
    "LIMIT 0 8 LOAD 3 $ @text_score @vector_score",
    "PARAMS 2 vector <query_embedding_float32_blob>"
  ].join("\n");
}
