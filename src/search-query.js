import { escapeSearchTerm, escapeTag, normalizeSearchText, searchTokens } from "../scripts/product-utils.js";

export function buildFilters({ category, franchise, audience, minPrice, maxPrice }) {
  const filters = [];
  if (category) filters.push(`@category:{${escapeTag(category)}}`);
  if (franchise) filters.push(`@franchise:{${escapeTag(franchise)}}`);
  if (audience) filters.push(`@audience:{${escapeTag(audience)}}`);
  if (minPrice || maxPrice) {
    filters.push(`@price:[${minPrice || "-inf"} ${maxPrice || "+inf"}]`);
  }
  return filters.join(" ");
}

export function buildTextQuery(term, filters) {
  const cleanTerm = escapeSearchTerm(term);
  const text = cleanTerm
    ? cleanTerm
        .split(" ")
        .filter(Boolean)
        .map((token) => `%${token}% | ${token}*`)
        .join(" ")
    : "*";
  return [filters, text].filter(Boolean).join(" ");
}

export function buildPatternQuery(term, filters) {
  const cleanTerm = normalizeSearchText(term);
  const tokens = searchTokens(term);

  if (!tokens.length) return [filters, "*"].filter(Boolean).join(" ");

  const tokenGroups = tokens.map((token) => {
    const reversedToken = [...token].reverse().join("");
    const clauses = [
      `${token}*`,
      `@exact_terms:{${escapeTag(token)}}`,
      `@reverse_tokens:${reversedToken}*`
    ];

    if (token.length >= 3) {
      clauses.push(`@contains_grams:{${escapeTag(token)}}`);
    }

    clauses.push(`%${token}%`);

    return `(${clauses.join(" | ")})`;
  });

  const exactName = `@name_exact:{${escapeTag(cleanTerm)}}`;
  const text = `(${exactName} | ${tokenGroups.join(" ")})`;

  return [filters, text].filter(Boolean).join(" ");
}
