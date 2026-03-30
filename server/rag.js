// RAG pipeline: chunking, embedding (Voyage AI), retrieval

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3-lite';

// Split text into chunks of approximately chunkSize characters with overlap
function chunkText(text, chunkSize = 1500, overlap = 200) {
  if (!text || text.length === 0) return [];

  // Split by paragraphs first, then combine into chunks
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const chunks = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    // If adding this paragraph would exceed chunk size, save current and start new
    if (currentChunk.length > 0 && currentChunk.length + paragraph.length > chunkSize) {
      chunks.push(currentChunk.trim());
      // Keep overlap from end of current chunk
      const overlapText = currentChunk.slice(-overlap);
      currentChunk = overlapText + '\n\n' + paragraph;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  // If text had no paragraph breaks, split by sentences
  if (chunks.length === 0 && text.trim().length > 0) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let chunk = '';
    for (const sentence of sentences) {
      if (chunk.length + sentence.length > chunkSize && chunk.length > 0) {
        chunks.push(chunk.trim());
        chunk = chunk.slice(-overlap) + sentence;
      } else {
        chunk += sentence;
      }
    }
    if (chunk.trim().length > 0) {
      chunks.push(chunk.trim());
    }
  }

  return chunks;
}

// Embed texts using Voyage AI
async function embedTexts(texts) {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error('VOYAGE_API_KEY er ikke satt');
  }

  // Voyage AI supports batches of up to 128 texts
  const batchSize = 128;
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    const response = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: VOYAGE_MODEL,
        input: batch,
        input_type: i === 0 && texts.length === 1 ? 'query' : 'document'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Voyage AI feil: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const embeddings = data.data.map(d => d.embedding);
    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}

// Embed a single query (uses input_type: 'query' for better retrieval)
async function embedQuery(text) {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error('VOYAGE_API_KEY er ikke satt');
  }

  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: [text],
      input_type: 'query'
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Voyage AI feil: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// Retrieve relevant context for a query
async function retrieveContext(vectorStore, query, topK = 5) {
  if (!vectorStore.hasDocuments()) {
    return { chunks: [], contextText: '' };
  }

  const queryEmbedding = await embedQuery(query);
  const results = vectorStore.search(queryEmbedding, topK);

  const contextText = results
    .map((r, i) => `[Kilde: ${r.documentName}, del ${r.chunkIndex + 1}]\n${r.text}`)
    .join('\n\n---\n\n');

  return { chunks: results, contextText };
}

module.exports = { chunkText, embedTexts, embedQuery, retrieveContext };
