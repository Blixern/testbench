const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const { router: authRouter, requireAuth } = require('./server/auth');
const createDocumentRoutes = require('./server/documents');
const createReportRoutes = require('./server/reports');
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
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// --- AUTH ROUTES (public, no auth required) ---
app.use('/api/auth', authRouter);

// --- LOGIN PAGE (served to unauthenticated users) ---
const LOGIN_HTML = `<!DOCTYPE html>
<html lang="no">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI Chat Demo</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0a0a; color: #e0e0e0; font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { text-align: center; padding: 48px; background: #111; border-radius: 12px; border: 1px solid #1a1a1a; min-width: 360px; }
    .logo { font-size: 48px; color: #00ff88; margin-bottom: 16px; }
    h1 { font-size: 20px; font-weight: 600; color: #fff; margin-bottom: 8px; }
    .sub { font-size: 13px; color: #666; margin-bottom: 32px; }
    form { display: flex; flex-direction: column; gap: 12px; }
    input { padding: 12px 16px; font-size: 14px; font-family: inherit; background: #0a0a0a; border: 1px solid #333; border-radius: 8px; color: #e0e0e0; outline: none; text-align: center; }
    button { padding: 12px 24px; font-size: 14px; font-family: inherit; font-weight: 600; background: #00ff88; color: #000; border: none; border-radius: 8px; cursor: pointer; }
    button:disabled { opacity: 0.5; }
    .error { margin-top: 16px; padding: 10px; font-size: 12px; color: #ff4444; background: rgba(255,68,68,0.1); border-radius: 6px; border: 1px solid rgba(255,68,68,0.2); display: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">&#9672;</div>
    <h1>AI Chat Demo</h1>
    <p class="sub">Skriv inn passord for å fortsette</p>
    <form id="loginForm">
      <input type="password" id="pw" placeholder="Passord" autofocus required>
      <button type="submit" id="btn">Logg inn</button>
    </form>
    <div class="error" id="err"></div>
  </div>
  <script>
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pw = document.getElementById('pw');
      const btn = document.getElementById('btn');
      const err = document.getElementById('err');
      btn.disabled = true; btn.textContent = 'Logger inn...'; err.style.display = 'none';
      try {
        const res = await fetch('/api/auth/verify', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ password: pw.value })
        });
        const data = await res.json();
        if (data.success) { window.location.reload(); }
        else { err.textContent = data.error || 'Feil passord'; err.style.display = 'block'; pw.value = ''; }
      } catch(e) { err.textContent = 'Kunne ikke koble til serveren'; err.style.display = 'block'; }
      btn.disabled = false; btn.textContent = 'Logg inn';
    });
  </script>
</body>
</html>`;

// --- SERVER-SIDE AUTH GATE ---
// All requests (except /api/auth/*) must be authenticated
function serverAuthGate(req, res, next) {
  // Skip auth routes
  if (req.path.startsWith('/api/auth')) return next();

  // Check if authenticated
  if (req.session && req.session.authenticated) return next();

  // API requests get 401
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Ikke autentisert' });
  }

  // HTML/page requests get the login page
  return res.send(LOGIN_HTML);
}

app.use(serverAuthGate);

// --- PROTECTED ROUTES (only reached if authenticated) ---

// Serve React build
app.use(express.static(path.join(__dirname, 'build')));

// Document routes
app.use('/api', createDocumentRoutes(vectorStore));

// Report routes
app.use('/api', createReportRoutes(DATA_DIR));

// Role definitions
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

// GET /api/roles
app.get('/api/roles', (req, res) => {
  const roles = Object.entries(ROLES).map(([key, r]) => ({
    key,
    ...r,
    hasPrompt: !!process.env[`ROLE_CONTEXT_${key.toUpperCase()}`]
  }));
  res.json(roles);
});

// Chat endpoint — RAG-enhanced with role support
app.post('/api/chat', async (req, res) => {
  const { messages, role, noContext } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Ingen meldinger mottatt' });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY er ikke konfigurert' });
  }

  const activeRole = role && ROLES[role] ? role : 'interessent';

  try {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    let fullSystemPrompt = buildSystemPrompt(activeRole);

    // Retrieve relevant context from this user's documents (skip if noContext mode)
    const ownerId = req.sessionID;
    if (!noContext && lastUserMessage && vectorStore.hasDocuments(ownerId)) {
      try {
        const { contextText } = await retrieveContext(vectorStore, lastUserMessage.content, 5, ownerId);
        if (contextText) {
          fullSystemPrompt += `\n\n---\nRELEVANT KONTEKST FRA DOKUMENTER:\n${contextText}`;
        }
      } catch (ragError) {
        console.error('RAG-feil (fortsetter uten kontekst):', ragError.message);
      }
    }

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
        messages: messages.map(m => ({ role: m.role, content: m.content }))
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

// Catch-all: serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Global error handler — always return JSON, never HTML
app.use((err, req, res, next) => {
  console.error('Uventet feil:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Intern serverfeil' });
});

app.listen(PORT, () => {
  console.log(`✓ Server kjører på http://localhost:${PORT}`);
  console.log(`  Modell: Claude Opus 4.6`);
  console.log(`  Dokumenter: ${vectorStore.listDocuments().length} lastet`);
  console.log(`  Passord: ${process.env.ACCESS_PASSWORD ? 'Satt' : 'IKKE SATT!'}`);
  console.log(`  Roller: ${Object.keys(ROLES).map(r => `${r}${process.env['ROLE_CONTEXT_' + r.toUpperCase()] ? ' ✓' : ' ✗'}`).join(', ')}`);
});
