const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const { router: authRouter, requireAuth } = require('./server/auth');
const createDocumentRoutes = require('./server/documents');
const VectorStore = require('./server/vectorStore');
const { retrieveContext } = require('./server/rag');

// Load .env in development
if (process.env.NODE_ENV !== 'production') {
  try { require('dotenv').config(); } catch (e) {}
}

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = process.env.DATA_DIR || './data';

// Initialize vector store
const vectorStore = new VectorStore(DATA_DIR);
vectorStore.load();

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && process.env.FORCE_HTTPS === 'true',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serve React build in production
app.use(express.static(path.join(__dirname, 'build')));

// Auth routes (no auth required)
app.use('/api/auth', authRouter);

// All other API routes require authentication
app.use('/api', requireAuth);

// Document routes
app.use('/api', createDocumentRoutes(vectorStore));

// Chat endpoint — RAG-enhanced
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Ingen meldinger mottatt' });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY er ikke konfigurert' });
  }

  const systemPrompt = process.env.SYSTEM_PROMPT || 'Du er en hjelpsom AI-assistent. Svar på norsk.';

  try {
    // Get the latest user message for RAG retrieval
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    let fullSystemPrompt = systemPrompt;

    // Retrieve relevant context if we have documents
    if (lastUserMessage && vectorStore.hasDocuments()) {
      try {
        const { contextText } = await retrieveContext(vectorStore, lastUserMessage.content, 5);
        if (contextText) {
          fullSystemPrompt += `\n\n---\nRELEVANT KONTEKST FRA DOKUMENTER:\n${contextText}`;
        }
      } catch (ragError) {
        console.error('RAG-feil (fortsetter uten kontekst):', ragError.message);
      }
    }

    // Call Claude Opus 4.6
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 4096,
        system: fullSystemPrompt,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content
        }))
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error('Anthropic API-feil:', data.error);
      return res.status(500).json({ error: data.error.message || 'API-feil' });
    }

    res.json(data);
  } catch (error) {
    console.error('Chat-feil:', error);
    res.status(500).json({ error: error.message });
  }
});

// Catch-all: serve React app for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✓ Server kjører på http://localhost:${PORT}`);
  console.log(`  Modell: Claude Opus 4.6`);
  console.log(`  Dokumenter: ${vectorStore.listDocuments().length} lastet`);
  console.log(`  Passord: ${process.env.ACCESS_PASSWORD ? 'Satt' : 'IKKE SATT!'}`);
});
