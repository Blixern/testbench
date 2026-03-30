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
app.set('trust proxy', 1); // Trust Railway's reverse proxy
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'lax' : false,
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

// Role definitions — system prompts from env vars
const ROLES = {
  interessent: {
    name: 'Interessent',
    color: '#4a9eff',
    description: 'Potensiell kjøper som vurderer bolig'
  },
  selger: {
    name: 'Selger',
    color: '#00ff88',
    description: 'Eier som selger bolig'
  },
  kjoper: {
    name: 'Kjøper',
    color: '#ff9f43',
    description: 'Aktiv kjøper i prosess'
  }
};

function buildSystemPrompt(role) {
  const base = process.env.SYSTEM_PROMPT || 'Du er en hjelpsom AI-assistent. Svar på norsk.';
  const roleAddition = process.env[`ROLE_CONTEXT_${role.toUpperCase()}`] || '';
  if (roleAddition) {
    return `${base}\n\n---\nROLLEKONTEKST (${ROLES[role].name}):\n${roleAddition}`;
  }
  return base;
}

// GET /api/roles — list available roles
app.get('/api/roles', (req, res) => {
  const roles = Object.entries(ROLES).map(([key, r]) => ({
    key,
    ...r,
    hasPrompt: !!process.env[`SYSTEM_PROMPT_${key.toUpperCase()}`]
  }));
  res.json(roles);
});

// Chat endpoint — RAG-enhanced with role support
app.post('/api/chat', async (req, res) => {
  const { messages, role } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Ingen meldinger mottatt' });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY er ikke konfigurert' });
  }

  const activeRole = role && ROLES[role] ? role : 'interessent';

  try {
    // Get the latest user message for RAG retrieval
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    let fullSystemPrompt = buildSystemPrompt(activeRole);

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
  console.log(`  Roller: ${Object.keys(ROLES).map(r => `${r}${process.env['SYSTEM_PROMPT_' + r.toUpperCase()] ? ' ✓' : ' ✗'}`).join(', ')}`);
});
