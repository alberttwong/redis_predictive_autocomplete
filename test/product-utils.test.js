import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createProductIndex,
  enrichProductForSearch,
  normalizeSearchText,
  productSearchMetadata,
  searchTokens
} from "../scripts/product-utils.js";

const sampleProduct = {
  id: "sample-1",
  name: "Classic Stitch Hoodie",
  description: "Warm alien apparel for park evenings.",
  franchise: "Lilo & Stitch",
  character: "Stitch",
  category: "Apparel",
  audience: "Kids",
  tags: ["hoodie", "cozy", "blue"],
  price: 49.99,
  rating: 4.8,
  popularity: 92
};

test("normalizes search text for exact and token matching", () => {
  assert.equal(normalizeSearchText("  Lilo & Stitch: Hoodie!  "), "lilo stitch hoodie");
  assert.deepEqual(searchTokens("Classic Stitch Hoodie"), ["classic", "stitch", "hoodie"]);
});

test("builds pattern-search metadata for exact, contains, suffix, and partial matching", () => {
  const metadata = productSearchMetadata(sampleProduct);

  assert.equal(metadata.name_exact, "classic stitch hoodie");
  assert.ok(metadata.exact_terms.includes("stitch"));
  assert.ok(metadata.exact_terms.includes("hoodie"));
  assert.ok(metadata.contains_grams.includes("itch"));
  assert.ok(metadata.contains_grams.includes("oodie"));
  assert.ok(metadata.contains_grams.includes("hood"));
  assert.match(metadata.reverse_tokens, /\bhctits\b/);
  assert.match(metadata.reverse_tokens, /\beidooh\b/);
});

test("enriches products without removing existing product fields", () => {
  const enriched = enrichProductForSearch(sampleProduct);

  assert.equal(enriched.id, sampleProduct.id);
  assert.equal(enriched.name, sampleProduct.name);
  assert.equal(enriched.name_exact, "classic stitch hoodie");
  assert.ok(Array.isArray(enriched.contains_grams));
});

test("creates an index with pattern-search helper fields", async () => {
  const sentCommands = [];
  const fakeClient = {
    sendCommand: async (command) => {
      sentCommands.push(command);
    }
  };

  await createProductIndex(fakeClient, 64);

  const command = sentCommands[0];
  const dimIndex = command.indexOf("DIM");
  assert.equal(command[0], "FT.CREATE");
  assert.equal(command[dimIndex + 1], "64");
  assert.ok(command.includes("$.name_exact"));
  assert.ok(command.includes("name_exact"));
  assert.ok(command.includes("$.exact_terms[*]"));
  assert.ok(command.includes("exact_terms"));
  assert.ok(command.includes("$.contains_grams[*]"));
  assert.ok(command.includes("contains_grams"));
  assert.ok(command.includes("$.reverse_tokens"));
  assert.ok(command.includes("reverse_tokens"));
});
