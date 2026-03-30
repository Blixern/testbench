const fs = require('fs');
const path = require('path');

class VectorStore {
  constructor(dataDir) {
    this.dataDir = dataDir || process.env.DATA_DIR || './data';
    this.vectors = [];
    this.documents = new Map(); // documentId -> { name, uploadedAt, chunkCount }
    this.filePath = path.join(this.dataDir, 'vectors.json');
  }

  // Load from disk on startup
  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        this.vectors = data.vectors || [];
        this.documents = new Map(Object.entries(data.documents || {}));
        console.log(`  Lastet ${this.vectors.length} vektorer fra ${this.documents.size} dokumenter`);
      }
    } catch (err) {
      console.error('Kunne ikke laste vektordata:', err.message);
      this.vectors = [];
      this.documents = new Map();
    }
  }

  // Save to disk
  save() {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      const data = {
        vectors: this.vectors,
        documents: Object.fromEntries(this.documents)
      };
      fs.writeFileSync(this.filePath, JSON.stringify(data));
    } catch (err) {
      console.error('Kunne ikke lagre vektordata:', err.message);
    }
  }

  // Add document chunks with embeddings
  addDocument(documentId, documentName, chunks, embeddings) {
    for (let i = 0; i < chunks.length; i++) {
      this.vectors.push({
        id: `${documentId}-${i}`,
        documentId,
        documentName,
        chunkIndex: i,
        text: chunks[i],
        embedding: embeddings[i]
      });
    }

    this.documents.set(documentId, {
      name: documentName,
      uploadedAt: new Date().toISOString(),
      chunkCount: chunks.length
    });

    this.save();
  }

  // Search for most relevant chunks using cosine similarity
  search(queryEmbedding, topK = 5) {
    if (this.vectors.length === 0) return [];

    const scored = this.vectors.map(vec => ({
      ...vec,
      score: cosineSimilarity(queryEmbedding, vec.embedding)
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  // Remove all chunks for a document
  removeDocument(documentId) {
    this.vectors = this.vectors.filter(v => v.documentId !== documentId);
    this.documents.delete(documentId);
    this.save();
  }

  // List all documents
  listDocuments() {
    return Array.from(this.documents.entries()).map(([id, doc]) => ({
      id,
      ...doc
    }));
  }

  // Check if store has any documents
  hasDocuments() {
    return this.documents.size > 0;
  }
}

// Cosine similarity between two vectors
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

module.exports = VectorStore;
