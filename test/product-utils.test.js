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
  assert.deepEqual(searchTokens("Clásico Stitch camiseta gráfica", "es"), ["clásico", "stitch", "camiseta", "gráfica"]);
  assert.ok(searchTokens("经典史迪奇毛绒玩具", "zh").length > 0);
});

test("builds pattern-search metadata without storing n-grams", () => {
  const metadata = productSearchMetadata(sampleProduct);

  assert.equal(metadata.name_exact, "classic stitch hoodie");
  assert.equal(metadata.name_exact_es, "classic stitch hoodie");
  assert.ok(metadata.exact_terms.includes("stitch"));
  assert.ok(metadata.exact_terms.includes("hoodie"));
  assert.equal("contains_grams" in metadata, false);
  assert.equal("reverse_tokens" in metadata, false);
});

test("enriches products without removing product fields and drops legacy n-grams", () => {
  const enriched = enrichProductForSearch({
    ...sampleProduct,
    contains_grams: ["itch"],
    reverse_tokens: "hctits"
  });

  assert.equal(enriched.id, sampleProduct.id);
  assert.equal(enriched.name, sampleProduct.name);
  assert.equal(enriched.name_exact, "classic stitch hoodie");
  assert.equal("contains_grams" in enriched, false);
  assert.equal("reverse_tokens" in enriched, false);
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
  assert.ok(command.includes("$.name_es"));
  assert.ok(command.includes("name_es"));
  assert.ok(command.includes("$.description_fr"));
  assert.ok(command.includes("description_fr"));
  assert.ok(command.includes("$.exact_terms_zh[*]"));
  assert.ok(command.includes("exact_terms_zh"));
  assert.equal(command.includes("$.contains_grams[*]"), false);
  assert.equal(command.includes("contains_grams"), false);
  assert.equal(command.includes("$.reverse_tokens"), false);
  assert.equal(command.includes("reverse_tokens"), false);
  assert.equal(command.filter((part) => part === "WITHSUFFIXTRIE").length, 8);
});
