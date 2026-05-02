export const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
export const OPENAI_EMBEDDING_DIMENSIONS = Number(process.env.OPENAI_EMBEDDING_DIMENSIONS ?? 1536);

export async function embedTextsWithOpenAI(
  texts,
  {
    apiKey = process.env.OPENAI_API_KEY,
    model = OPENAI_EMBEDDING_MODEL,
    dimensions = OPENAI_EMBEDDING_DIMENSIONS
  } = {}
) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to generate OpenAI embeddings.");
  }

  const body = { model, input: texts };
  if (dimensions) body.dimensions = dimensions;

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI embeddings request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.data
    .sort((left, right) => left.index - right.index)
    .map((item) => Float32Array.from(item.embedding));
}

export async function embedTextWithOpenAI(text, options = {}) {
  const [embedding] = await embedTextsWithOpenAI([text], options);
  return embedding;
}
