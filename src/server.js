import express from "express";
import { seed } from "../scripts/seed.js";
import {
  aggregateProducts,
  connectRedis,
  facets,
  filteredProducts,
  fullTextProducts,
  health,
  searchProducts,
  semanticProducts,
  suggestions
} from "./redis.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(express.json());

app.get("/api/health", async (_request, response, next) => {
  try {
    await connectRedis();
    response.json(await health());
  } catch (error) {
    next(error);
  }
});

app.post("/api/seed", async (_request, response, next) => {
  try {
    response.json(await seed());
  } catch (error) {
    next(error);
  }
});

app.get("/api/suggest", async (request, response, next) => {
  try {
    await connectRedis();
    response.json({ suggestions: await suggestions(String(request.query.q ?? ""), Number(request.query.limit ?? 8)) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/search", async (request, response, next) => {
  try {
    await connectRedis();
    response.json(await searchProducts(request.query));
  } catch (error) {
    next(error);
  }
});

app.get("/api/search/fulltext", async (request, response, next) => {
  try {
    await connectRedis();
    response.json(await fullTextProducts(request.query));
  } catch (error) {
    next(error);
  }
});

app.get("/api/search/semantic", async (request, response, next) => {
  try {
    await connectRedis();
    response.json(await semanticProducts(request.query));
  } catch (error) {
    next(error);
  }
});

app.get("/api/search/filters", async (request, response, next) => {
  try {
    await connectRedis();
    response.json(await filteredProducts(request.query));
  } catch (error) {
    next(error);
  }
});

app.get("/api/search/aggregate", async (request, response, next) => {
  try {
    await connectRedis();
    response.json(await aggregateProducts(request.query));
  } catch (error) {
    next(error);
  }
});

app.get("/api/facets", async (_request, response, next) => {
  try {
    await connectRedis();
    response.json(await facets());
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: String(error?.message ?? error) });
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
