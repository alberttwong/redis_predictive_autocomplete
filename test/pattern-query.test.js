import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRedisCommand } from "../src/redis-command.js";
import { patternSearchErrorMessage } from "../src/redis.js";
import { buildPatternQuery } from "../src/search-query.js";

test("builds a wildcard query for blank pattern searches", () => {
  assert.equal(buildPatternQuery("", ""), "*");
  assert.equal(buildPatternQuery("   ", "@category:{Toy}"), "@category:{Toy} *");
});

test("builds exact, prefix, suffix, contains, fuzzy, partial, and multi-word clauses", () => {
  const query = buildPatternQuery("itch hood", "");

  assert.ok(query.startsWith("(@name_exact:{itch\\ hood} | "));
  assert.match(query, /\(itch\* \| @exact_terms:\{itch\} \| w'\*itch\*' \| w'\*itch' \| %itch%\)/);
  assert.match(query, /\(hood\* \| @exact_terms:\{hood\} \| w'\*hood\*' \| w'\*hood' \| %hood%\)/);
  assert.ok(query.includes(") ("));
});

test("uses wildcard contains clauses for short tokens without stored n-grams", () => {
  const query = buildPatternQuery("up", "");

  assert.match(query, /\(up\* \| @exact_terms:\{up\} \| w'\*up\*' \| w'\*up' \| %up%\)/);
  assert.doesNotMatch(query, /@contains_grams:\{up\}/);
  assert.doesNotMatch(query, /@reverse_tokens/);
});

test("prepends filters while preserving pattern matching", () => {
  const query = buildPatternQuery("Stitch Hoodie", "@category:{Apparel} @price:[20 60]");

  assert.ok(query.startsWith("@category:{Apparel} @price:[20 60] "));
  assert.match(query, /@name_exact:\{stitch\\ hoodie\}/);
  assert.match(query, /stitch\*/);
  assert.match(query, /hoodie\*/);
});

test("escapes exact tag values in generated pattern clauses", () => {
  const query = buildPatternQuery("Lilo Stitch", "");

  assert.match(query, /@name_exact:\{lilo\\ stitch\}/);
  assert.match(query, /@exact_terms:\{lilo\}/);
  assert.match(query, /@exact_terms:\{stitch\}/);
});

test("builds a pasteable redis-cli pattern command from the real query", () => {
  const command = buildRedisCommand("pattern", "itch hood", "rrf", {
    category: "",
    minPrice: "",
    maxPrice: ""
  });

  assert.equal(
    command,
    'FT.SEARCH idx:disney_products "(@name_exact:{itch\\\\ hood} | (itch* | @exact_terms:{itch} | w\'*itch*\' | w\'*itch\' | %itch%) (hood* | @exact_terms:{hood} | w\'*hood*\' | w\'*hood\' | %hood%))" LIMIT 0 8 LOAD 1 $ DIALECT 2'
  );
});

test("explains stale indexes that are missing pattern-search fields", () => {
  const message = patternSearchErrorMessage(new Error("Unknown field at offset 1 near name_exact"));

  assert.match(message, /updated Redis index/);
  assert.match(message, /npm run seed/);
});

test("preserves unrelated Redis search errors", () => {
  const message = patternSearchErrorMessage(new Error("Syntax error at offset 18 near wildcard"));

  assert.equal(message, "Syntax error at offset 18 near wildcard");
});
