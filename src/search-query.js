import {
  escapeSearchTerm,
  escapeTag,
  localizedField,
  normalizeSearchText,
  searchTokens
} from "../scripts/product-utils.js";

function localizedTextFields(locale) {
  return [localizedField("name", locale), localizedField("description", locale)];
}

function fieldScopedClauses(fields, clauses) {
  return fields.map((field) => `@${field}:(${clauses.join(" | ")})`).join(" | ");
}

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

export function buildTextQuery(term, filters, locale = "en") {
  const tokens = searchTokens(term, locale);
  const fields = localizedTextFields(locale);
  const exactTermsField = localizedField("exact_terms", locale);
  const text = tokens.length
    ? tokens
        .map((token) => {
          const cleanToken = escapeSearchTerm(token);
          return `(${fieldScopedClauses(fields, [`%${cleanToken}%`, `${cleanToken}*`])} | @${exactTermsField}:{${escapeTag(token)}})`;
        })
        .join(" ")
    : "*";
  return [filters, text].filter(Boolean).join(" ");
}

export function buildPatternQuery(term, filters, locale = "en") {
  const cleanTerm = normalizeSearchText(term, locale);
  const tokens = searchTokens(term, locale);
  const fields = localizedTextFields(locale);
  const exactNameField = localizedField("name_exact", locale);
  const exactTermsField = localizedField("exact_terms", locale);

  if (!tokens.length) return [filters, "*"].filter(Boolean).join(" ");

  const tokenGroups = tokens.map((token) => {
    const cleanToken = escapeSearchTerm(token);
    const clauses = [
      fieldScopedClauses(fields, [`${cleanToken}*`, `w'*${cleanToken}*'`, `w'*${cleanToken}'`, `%${cleanToken}%`]),
      `@${exactTermsField}:{${escapeTag(token)}}`
    ];

    return `(${clauses.join(" | ")})`;
  });

  const exactName = `@${exactNameField}:{${escapeTag(cleanTerm)}}`;
  const text = `(${exactName} | ${tokenGroups.join(" ")})`;

  return [filters, text].filter(Boolean).join(" ");
}
