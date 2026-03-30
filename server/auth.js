const express = require('express');
const router = express.Router();

// Auth middleware — checks session for all protected routes
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.status(401).json({ error: 'Ikke autentisert' });
}

// POST /api/auth/verify — check password, set session
router.post('/verify', (req, res) => {
  const { password } = req.body;
  const accessPassword = process.env.ACCESS_PASSWORD;

  if (!accessPassword) {
    return res.status(500).json({ error: 'Passord ikke konfigurert på serveren' });
  }

  if (password === accessPassword) {
    req.session.authenticated = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Feil passord' });
  }
});

// POST /api/auth/logout — destroy session
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Kunne ikke logge ut' });
    }
    res.json({ success: true });
  });
});

// GET /api/auth/status — check if authenticated
router.get('/status', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

module.exports = { router, requireAuth };
