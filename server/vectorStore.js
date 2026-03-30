const fs = require('fs');
const path = require('path');

class VectorStore {
  constructor(dataDir) {
    this.dataDir = dataDir || process.env.DATA_DIR || './data';
    this.vectors = [];
    this.documents = new Map(); // documentId -> { name, uploadedAt, chunkCount, ownerId }
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

  // Add document chunks with embeddings (scoped to owner)
  addDocument(documentId, documentName, chunks, embeddings, ownerId) {
    for (let i = 0; i < chunks.length; i++) {
      this.vectors.push({
        id: `${documentId}-${i}`,
        documentId,
        documentName,
        ownerId,
        chunkIndex: i,
        text: chunks[i],
        embedding: embeddings[i]
      });
    }

    this.documents.set(documentId, {
      name: documentName,
      ownerId,
      uploadedAt: new Date().toISOString(),
      chunkCount: chunks.length
    });

    this.save();
  }

  // Search only within an owner's documents
  search(queryEmbedding, topK = 5, ownerId = null) {
    const pool = ownerId
      ? this.vectors.filter(v => v.ownerId === ownerId)
      : this.vectors;

    if (pool.length === 0) return [];

    const scored = pool.map(vec => ({
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

  // List documents for a specific owner
  listDocuments(ownerId = null) {
    return Array.from(this.documents.entries())
      .filter(([id, doc]) => !ownerId || doc.ownerId === ownerId)
      .map(([id, doc]) => ({ id, ...doc }));
  }

  // Check if an owner has any documents
  hasDocuments(ownerId = null) {
    if (!ownerId) return this.documents.size > 0;
    return Array.from(this.documents.values()).some(d => d.ownerId === ownerId);
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
