const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { chunkText, embedTexts } = require('./rag');

const router = express.Router();

// Configure multer for file uploads
function createUploadMiddleware(dataDir) {
  const uploadDir = path.join(dataDir, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  return multer({
    dest: uploadDir,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (req, file, cb) => {
      const allowed = ['.txt', '.md', '.json', '.csv', '.xml', '.html', '.pdf'];
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowed.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error(`Filtype ${ext} støttes ikke. Bruk: ${allowed.join(', ')}`));
      }
    }
  });
}

// Setup routes with vector store dependency
function createDocumentRoutes(vectorStore) {
  const dataDir = vectorStore.dataDir;
  const upload = createUploadMiddleware(dataDir);

  // POST /api/upload — upload and process a document
  router.post('/upload', (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'Filen er for stor. Maks 50MB.' });
        }
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  }, async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Ingen fil mottatt' });
    }

    const { originalname, path: filePath, mimetype } = req.file;
    const documentId = `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Extract text based on file type
      let text;
      const ext = path.extname(originalname).toLowerCase();

      if (ext === '.pdf') {
        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);
        text = pdfData.text;
      } else {
        text = fs.readFileSync(filePath, 'utf8');
      }

      if (!text || text.trim().length === 0) {
        throw new Error('Ingen tekst funnet i dokumentet');
      }

      // Chunk the text
      const chunks = chunkText(text);
      console.log(`  Dokument "${originalname}": ${text.length} tegn → ${chunks.length} deler`);

      // Embed all chunks
      const embeddings = await embedTexts(chunks);

      // Store in vector store (scoped to session)
      const ownerId = req.sessionID;
      console.log(`  Upload av "${originalname}" for sesjon ${ownerId.slice(0, 8)}...`);
      vectorStore.addDocument(documentId, originalname, chunks, embeddings, ownerId);

      // Rename uploaded file to include document ID
      const newPath = path.join(dataDir, 'uploads', `${documentId}${ext}`);
      fs.renameSync(filePath, newPath);

      res.json({
        id: documentId,
        name: originalname,
        chunkCount: chunks.length,
        textLength: text.length
      });
    } catch (error) {
      // Clean up uploaded file on error
      try { fs.unlinkSync(filePath); } catch (e) {}
      console.error('Feil ved opplasting:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/documents — list this user's uploaded documents
  router.get('/documents', (req, res) => {
    const ownerId = req.sessionID;
    console.log(`  Dokument-liste for sesjon ${ownerId.slice(0, 8)}...: ${vectorStore.listDocuments(ownerId).length} dokumenter`);
    const docs = vectorStore.listDocuments(ownerId);
    res.json(docs);
  });

  // DELETE /api/documents/:id — remove a document
  router.delete('/documents/:id', (req, res) => {
    const { id } = req.params;

    // Remove from vector store
    vectorStore.removeDocument(id);

    // Try to remove the file from disk
    const uploadDir = path.join(dataDir, 'uploads');
    try {
      const files = fs.readdirSync(uploadDir);
      const match = files.find(f => f.startsWith(id));
      if (match) {
        fs.unlinkSync(path.join(uploadDir, match));
      }
    } catch (e) {
      // File may not exist, that's fine
    }

    res.json({ success: true });
  });

  return router;
}

module.exports = createDocumentRoutes;
