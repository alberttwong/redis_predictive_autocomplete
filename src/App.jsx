import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  Database,
  ExternalLink,
  FileText,
  Layers,
  ListFilter,
  RotateCcw,
  Search,
  ScanSearch,
  SlidersHorizontal,
  Sparkles,
  TableProperties,
  WandSparkles
} from "lucide-react";
import { createRoot } from "react-dom/client";
import { buildRedisCommand } from "./redis-command.js";
import "./styles.css";

const api = async (path, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const signal = options.signal ?? controller.signal;

  try {
    const response = await fetch(path, { ...options, signal });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body;
  } finally {
    clearTimeout(timeout);
  }
};

const searchModes = [
  {
    id: "fuzzy",
    label: "Fuzzy",
    icon: Sparkles,
    example: "stitc",
    endpoint: "/api/suggest",
    command: "/api/suggest?q=stitc&limit=8",
    copy: "Autocomplete over curated suggestion phrases with typo tolerance."
  },
  {
    id: "fulltext",
    label: "Full Text",
    icon: FileText,
    example: "stitch hoodie",
    endpoint: "/api/search/fulltext",
    command: "/api/search/fulltext?q=stitch%20hoodie&limit=8",
    copy: "Text search over indexed product names and descriptions."
  },
  {
    id: "pattern",
    label: "Pattern",
    icon: ScanSearch,
    example: "itch hood",
    endpoint: "/api/search/pattern",
    command: "/api/search/pattern?q=itch%20hood&limit=8",
    copy: "Exact, prefix, contains, suffix, fuzzy, partial, and multi-word matching."
  },
  {
    id: "semantic",
    label: "Semantic",
    icon: Brain,
    example: "space robot collectible display",
    endpoint: "/api/search/semantic",
    command: "/api/search/semantic?q=space%20robot%20collectible%20display&limit=8",
    copy: "Vector search over product embeddings for meaning-based retrieval."
  },
  {
    id: "hybrid",
    label: "Hybrid",
    icon: Layers,
    example: "ocean adventure kids toy",
    endpoint: "/api/search",
    command: "/api/search?q=ocean%20adventure%20kids%20toy&combine=rrf&limit=8",
    copy: "Redis FT.HYBRID fuses full-text and vector rankings."
  },
  {
    id: "filters",
    label: "Filters & Facets",
    icon: ListFilter,
    example: "classic",
    endpoint: "/api/search/filters",
    command: "/api/search/filters?q=classic&category=Toy&minPrice=20&maxPrice=60&limit=8",
    copy: "TAG and NUMERIC filters narrow catalog results with exact constraints."
  },
  {
    id: "aggregate",
    label: "Aggregations",
    icon: TableProperties,
    example: "classic",
    endpoint: "/api/search/aggregate",
    command: "/api/search/aggregate?q=classic",
    copy: "FT.AGGREGATE groups products into counts, averages, and top metrics."
  }
];

const languages = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "zh", label: "Chinese" }
];

const localizedExamples = {
  en: {
    fuzzy: "stitc",
    fulltext: "stitch hoodie",
    pattern: "itch hood",
    semantic: "space robot collectible display",
    hybrid: "ocean adventure kids toy",
    filters: "classic",
    aggregate: "classic"
  },
  es: {
    fuzzy: "edicion stitch",
    fulltext: "stitch camiseta",
    pattern: "camiseta grafica",
    semantic: "juguete aventura oceano niños",
    hybrid: "peluche azul para niños",
    filters: "clasico",
    aggregate: "clasico"
  },
  fr: {
    fuzzy: "edition stitch",
    fulltext: "stitch t-shirt",
    pattern: "figurine vinyle",
    semantic: "jouet aventure ocean enfants",
    hybrid: "peluche bleue enfants",
    filters: "classique",
    aggregate: "classique"
  },
  zh: {
    fuzzy: "史迪奇",
    fulltext: "史迪奇 图案T恤",
    pattern: "毛绒玩具",
    semantic: "海洋 冒险 儿童 玩具",
    hybrid: "蓝色 儿童 毛绒玩具",
    filters: "经典",
    aggregate: "经典"
  }
};

const languageSearchExamples = [
  { locale: "en", label: "English", query: "stitch hoodie" },
  { locale: "es", label: "Spanish", query: "camiseta stitch" },
  { locale: "fr", label: "French", query: "t-shirt graphique" },
  { locale: "zh", label: "Chinese", query: "史迪奇" }
];

function modeExample(modeId, locale) {
  return localizedExamples[locale]?.[modeId] ?? searchModes.find((mode) => mode.id === modeId)?.example ?? "";
}

const redisCloudDatabaseUrl = "https://cloud.redis.io/#/subscriptions/3246065/databases/14263116";

function ProductCard({ product }) {
  return (
    <article className="product-card">
      <div className="product-art" data-category={product.category}>
        <span>{product.character?.slice(0, 2)}</span>
      </div>
      <div className="product-copy">
        <div className="product-meta">
          <span>{product.franchise}</span>
          <span>{product.category}</span>
        </div>
        <h3>{product.name}</h3>
        <p>{product.description}</p>
        <div className="product-footer">
          <strong>${Number(product.price).toFixed(2)}</strong>
          <span>{product.rating} stars</span>
          <span>{product.popularity} pop</span>
        </div>
      </div>
    </article>
  );
}

function SuggestionCard({ suggestion }) {
  return (
    <article className="suggestion-card">
      <Sparkles size={18} />
      <div>
        <h3>{suggestion.value}</h3>
        <p>
          {suggestion.franchise} / {suggestion.category}
        </p>
      </div>
    </article>
  );
}

function AggregateCard({ group }) {
  return (
    <article className="aggregate-card">
      <h3>{group.category}</h3>
      <div className="aggregate-metrics">
        <span>
          <strong>{group.products}</strong>
          products
        </span>
        <span>
          <strong>${Number(group.avg_price ?? 0).toFixed(2)}</strong>
          avg price
        </span>
        <span>
          <strong>{group.top_popularity}</strong>
          top pop
        </span>
      </div>
    </article>
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {label !== "Language" && <option value="">Any</option>}
        {options.map((option) => (
          <option key={option.code ?? option} value={option.code ?? option}>
            {option.label ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

function App() {
  const [activeMode, setActiveMode] = useState("hybrid");
  const [query, setQuery] = useState("ocean adventure kids toy");
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionResults, setSuggestionResults] = useState([]);
  const [results, setResults] = useState([]);
  const [aggregateResults, setAggregateResults] = useState([]);
  const [facets, setFacets] = useState({ categories: [], franchises: [], audiences: [] });
  const [category, setCategory] = useState("");
  const [franchise, setFranchise] = useState("");
  const [audience, setAudience] = useState("");
  const [locale, setLocale] = useState("en");
  const [combine, setCombine] = useState("rrf");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [status, setStatus] = useState("Connecting to Redis");
  const [mode, setMode] = useState("");
  const [warning, setWarning] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const searchAbort = useRef();
  const activeSearchMode = searchModes.find((mode) => mode.id === activeMode) ?? searchModes[0];
  const redisCommand = buildRedisCommand(activeMode, query, combine, { category, minPrice, maxPrice }, locale);

  const searchParams = useMemo(() => {
    const params = new URLSearchParams({ q: query, limit: "8", locale });
    if (activeMode === "hybrid") params.set("combine", combine);
    const defaultFilterMode = activeMode === "filters";
    if (category || defaultFilterMode) params.set("category", category || "Toy");
    if (franchise) params.set("franchise", franchise);
    if (audience) params.set("audience", audience);
    if (minPrice || defaultFilterMode) params.set("minPrice", minPrice || "20");
    if (maxPrice || defaultFilterMode) params.set("maxPrice", maxPrice || "60");
    return params;
  }, [activeMode, audience, category, combine, franchise, locale, maxPrice, minPrice, query]);

  const runSearch = useCallback(async () => {
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    const data = await api(`${activeSearchMode.endpoint}?${searchParams.toString()}`, { signal: controller.signal });

    if (activeMode === "fuzzy") {
      setSuggestionResults(data.suggestions);
      setResults([]);
      setAggregateResults([]);
      setMode("FT.SUGGET FUZZY");
      setWarning("");
      setStatus(`${data.suggestions.length} suggestions`);
      return;
    }

    if (activeMode === "aggregate") {
      setSuggestionResults([]);
      setResults([]);
      setAggregateResults(data.groups);
      setMode(data.mode);
      setWarning("");
      setStatus(`${data.total} groups`);
      return;
    }

    setSuggestionResults([]);
    setAggregateResults([]);
    setResults(data.products);
    setMode(data.mode);
    setWarning(data.warning ?? "");
    setStatus(`Showing ${data.products.length} of ${data.total} matches`);
  }, [activeMode, activeSearchMode.endpoint, searchParams]);

  useEffect(() => {
    api("/api/facets")
      .then(setFacets)
      .catch((error) => setStatus(error.message));
    api("/api/health")
      .then((data) => setStatus(`${data.count} indexed products`))
      .catch((error) => setStatus(error.message));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      runSearch().catch((error) => {
        if (error.name === "AbortError") return;
        setSuggestionResults([]);
        setAggregateResults([]);
        setResults([]);
        setMode(activeSearchMode.label);
        setWarning(error.message);
        setStatus("Search failed");
      });
    }, 180);
    return () => clearTimeout(timer);
  }, [activeSearchMode.label, runSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!query.trim()) {
        setSuggestions([]);
        return;
      }
      api(`/api/suggest?q=${encodeURIComponent(query)}&limit=8&locale=${locale}`)
        .then((data) => {
          setSuggestions(data.suggestions);
          setHighlightIndex(-1);
        })
        .catch(() => setSuggestions([]));
    }, 90);
    return () => clearTimeout(timer);
  }, [locale, query]);

  const seedRedis = async () => {
    setStatus("Seeding Redis");
    await api("/api/seed", { method: "POST" });
    const data = await api("/api/facets");
    setFacets(data);
    await runSearch();
  };

  const chooseSuggestion = (value) => {
    setQuery(value);
    setSuggestions([]);
  };

  const chooseMode = (mode) => {
    setActiveMode(mode.id);
    setQuery(modeExample(mode.id, locale));
    setSuggestions([]);
  };

  const chooseLocale = (nextLocale) => {
    setLocale(nextLocale);
    setQuery(modeExample(activeMode, nextLocale));
    setSuggestions([]);
  };

  const chooseLanguageExample = (example) => {
    setLocale(example.locale);
    setQuery(example.query);
    setSuggestions([]);
  };

  const onKeyDown = (event) => {
    if (!suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIndex((index) => Math.min(index + 1, suggestions.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex((index) => Math.max(index - 1, 0));
    }
    if (event.key === "Enter" && highlightIndex >= 0) {
      event.preventDefault();
      chooseSuggestion(suggestions[highlightIndex].value);
    }
  };

  return (
    <main>
      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">
              <Database size={16} /> Redis search modes on 2000 products
            </div>
            <h1>Disney product search lab</h1>
          </div>
          <div className="top-actions">
            <a
              className="icon-button"
              href={redisCloudDatabaseUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Open Redis Cloud database"
              title="Open Redis Cloud database"
            >
              <ExternalLink size={18} />
            </a>
            <button className="icon-button" type="button" onClick={seedRedis} aria-label="Seed Redis" title="Seed Redis">
              <RotateCcw size={18} />
            </button>
          </div>
        </header>

        <section className="mode-grid" aria-label="Search type selector">
          {searchModes.map((mode) => {
            const Icon = mode.icon;
            return (
              <button
                key={mode.id}
                type="button"
                className={activeMode === mode.id ? "mode-card selected" : "mode-card"}
                onClick={() => chooseMode(mode)}
              >
                <span className="mode-icon">
                  <Icon size={20} />
                </span>
                <span className="mode-label">{mode.label}</span>
                <span className="mode-copy">{mode.copy}</span>
                <code>{mode.command}</code>
              </button>
            );
          })}
        </section>

        <section className="search-shell">
          <div className="search-box">
            <Search size={22} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={`Try ${modeExample(activeMode, locale)}`}
              aria-label="Search Disney products"
            />
            <Sparkles size={20} />
          </div>

          {suggestions.length > 0 && (
            <div className="suggestions" role="listbox">
              {suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.value}-${index}`}
                  type="button"
                  className={index === highlightIndex ? "active" : ""}
                  onMouseDown={() => chooseSuggestion(suggestion.value)}
                >
                  <span>{suggestion.value}</span>
                  <small>
                    {suggestion.franchise} / {suggestion.category}
                  </small>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="language-examples" aria-label="Multilingual search examples">
          {languageSearchExamples.map((example) => (
            <button
              key={`${example.locale}-${example.query}`}
              type="button"
              className={locale === example.locale && query === example.query ? "selected" : ""}
              onClick={() => chooseLanguageExample(example)}
            >
              <span>{example.label}</span>
              <strong>{example.query}</strong>
            </button>
          ))}
        </section>

        <section className="control-band">
          <div className="control-title">
            <SlidersHorizontal size={18} />
            <span>{activeSearchMode.label} search controls</span>
          </div>
          <div className="controls">
            <Select label="Language" value={locale} options={languages} onChange={chooseLocale} />
            <Select label="Category" value={category} options={facets.categories} onChange={setCategory} />
            <Select label="Franchise" value={franchise} options={facets.franchises} onChange={setFranchise} />
            <Select label="Audience" value={audience} options={facets.audiences} onChange={setAudience} />
            <label className="field compact">
              <span>Min</span>
              <input value={minPrice} onChange={(event) => setMinPrice(event.target.value)} inputMode="numeric" />
            </label>
            <label className="field compact">
              <span>Max</span>
              <input value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} inputMode="numeric" />
            </label>
            <div className={activeMode === "hybrid" ? "segmented" : "segmented disabled"} aria-label="Score fusion mode">
              <button type="button" className={combine === "rrf" ? "selected" : ""} onClick={() => setCombine("rrf")}>
                RRF
              </button>
              <button type="button" className={combine === "linear" ? "selected" : ""} onClick={() => setCombine("linear")}>
                Linear
              </button>
            </div>
          </div>
        </section>

        <section className="command-panel" aria-label="Redis command used for this search">
          <div>
            <span>Redis command</span>
            <strong>{mode || activeSearchMode.label}</strong>
          </div>
          <pre>{redisCommand}</pre>
        </section>

        <section className="result-head">
          <div>
            <strong>{status}</strong>
            <span>{mode}</span>
          </div>
          {warning && <p>{warning}</p>}
        </section>

        {activeMode === "fuzzy" && (
          <section className="suggestion-results">
            {suggestionResults.map((suggestion, index) => (
              <SuggestionCard key={`${suggestion.value}-${index}`} suggestion={suggestion} />
            ))}
          </section>
        )}

        {activeMode === "aggregate" && (
          <section className="aggregate-results">
            {aggregateResults.map((group) => (
              <AggregateCard key={group.category} group={group} />
            ))}
          </section>
        )}

        {activeMode !== "fuzzy" && activeMode !== "aggregate" && (
          <section className="results">
            {results.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </section>
        )}
      </section>

      <aside className="side-panel">
        <WandSparkles size={26} />
        <h2>{activeSearchMode.label} data needs</h2>
        <p>
          {activeMode === "fuzzy" &&
            "A suggestion dictionary built with product names, character/category phrases, popularity scores, and payloads."}
          {activeMode === "fulltext" &&
            "Text fields like name and description indexed as TEXT, plus TAG and NUMERIC metadata for filtering."}
          {activeMode === "pattern" &&
            "Suffix-trie TEXT fields plus exact TAG helpers for prefix, contains, suffix, fuzzy, partial, and multi-word matching."}
          {activeMode === "semantic" &&
            "A numeric embedding on every product and a VECTOR HNSW index that can compare query meaning to product meaning."}
          {activeMode === "hybrid" &&
            "Both indexed text and product embeddings, so Redis can blend lexical precision with vector recall."}
          {activeMode === "filters" &&
            "TAG fields for exact facets and NUMERIC fields for ranges like price, rating, and popularity."}
          {activeMode === "aggregate" &&
            "Sortable/filterable fields that can be grouped and reduced by FT.AGGREGATE, like category, price, and popularity."}
        </p>
        <div className="stat-grid">
          <span>2000</span>
          <span>JSON docs</span>
          <span>32</span>
          <span>vector dims</span>
          <span>HNSW</span>
          <span>index</span>
        </div>
      </aside>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
