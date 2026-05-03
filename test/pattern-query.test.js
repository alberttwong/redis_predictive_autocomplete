import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPatternQuery, patternSearchErrorMessage } from "../src/redis.js";

test("builds a wildcard query for blank pattern searches", () => {
  assert.equal(buildPatternQuery("", ""), "*");
  assert.equal(buildPatternQuery("   ", "@category:{Toy}"), "@category:{Toy} *");
});

test("builds exact, prefix, suffix, contains, fuzzy, partial, and multi-word clauses", () => {
  const query = buildPatternQuery("itch hood", "");

  assert.ok(query.startsWith("(@name_exact:{itch\\ hood} | "));
  assert.match(query, /\(itch\* \| @exact_terms:\{itch\} \| @reverse_tokens:hcti\* \| @contains_grams:\{itch\} \| %itch%\)/);
  assert.match(query, /\(hood\* \| @exact_terms:\{hood\} \| @reverse_tokens:dooh\* \| @contains_grams:\{hood\} \| %hood%\)/);
  assert.ok(query.includes(") ("));
});

test("skips n-gram contains clauses for tokens shorter than three characters", () => {
  const query = buildPatternQuery("up", "");

  assert.match(query, /\(up\* \| @exact_terms:\{up\} \| @reverse_tokens:pu\* \| %up%\)/);
  assert.doesNotMatch(query, /@contains_grams:\{up\}/);
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

test("explains stale indexes that are missing pattern-search fields", () => {
  const message = patternSearchErrorMessage(new Error("Unknown field at offset 1 near name_exact"));

  assert.match(message, /updated Redis index/);
  assert.match(message, /npm run seed/);
});

test("preserves unrelated Redis search errors", () => {
  const message = patternSearchErrorMessage(new Error("Syntax error at offset 18 near exact_terms"));

  assert.equal(message, "Syntax error at offset 18 near exact_terms");
});
