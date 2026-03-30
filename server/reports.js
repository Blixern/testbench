const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

function createReportRoutes(dataDir) {
  const reportsFile = path.join(dataDir, 'reports.json');

  function loadReports() {
    try {
      if (fs.existsSync(reportsFile)) {
        return JSON.parse(fs.readFileSync(reportsFile, 'utf8'));
      }
    } catch (e) {
      console.error('Kunne ikke laste rapporter:', e.message);
    }
    return [];
  }

  function saveReports(reports) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(reportsFile, JSON.stringify(reports, null, 2));
    } catch (e) {
      console.error('Kunne ikke lagre rapport:', e.message);
    }
  }

  // POST /api/report — submit a chat report
  router.post('/report', (req, res) => {
    const { question, answer, comment, role } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ error: 'Spørsmål og svar er påkrevd' });
    }

    const report = {
      id: `report-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      question,
      answer,
      comment: comment || '',
      role: role || 'ukjent',
      sessionId: req.sessionID.slice(0, 8),
      createdAt: new Date().toISOString()
    };

    const reports = loadReports();
    reports.unshift(report);
    saveReports(reports);

    console.log(`  Ny rapport fra sesjon ${req.sessionID.slice(0, 8)}... rolle: ${role}`);
    res.json({ success: true, id: report.id });
  });

  // GET /api/reports — list all reports (admin access via secret key)
  router.get('/reports', (req, res) => {
    const adminKey = process.env.ADMIN_KEY;
    const providedKey = req.query.key;

    if (!adminKey || providedKey !== adminKey) {
      return res.status(403).json({ error: 'Ingen tilgang' });
    }

    const reports = loadReports();

    // If ?format=html, return a readable HTML page
    if (req.query.format === 'html') {
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Rapporter</title>
<style>
  body { font-family: system-ui; background: #0a0a0a; color: #e0e0e0; padding: 40px; max-width: 900px; margin: 0 auto; }
  h1 { color: #00ff88; }
  .count { color: #888; font-size: 14px; }
  .report { background: #111; border: 1px solid #1a1a1a; border-radius: 8px; padding: 20px; margin: 16px 0; }
  .meta { font-size: 12px; color: #666; margin-bottom: 12px; }
  .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 4px; }
  .question { color: #4a9eff; margin-bottom: 12px; }
  .answer { color: #ccc; margin-bottom: 12px; white-space: pre-wrap; max-height: 200px; overflow-y: auto; }
  .comment { color: #ff9f43; font-style: italic; }
  .role { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: #1a1a1a; }
  .empty { text-align: center; color: #555; padding: 60px; }
</style></head><body>
<h1>Chat-rapporter</h1>
<p class="count">${reports.length} rapport(er)</p>
${reports.length === 0 ? '<div class="empty">Ingen rapporter ennå</div>' :
  reports.map(r => `
<div class="report">
  <div class="meta"><span class="role">${r.role}</span> &middot; ${r.createdAt} &middot; Sesjon: ${r.sessionId}</div>
  <div class="label">Spørsmål</div>
  <div class="question">${escapeHtml(r.question)}</div>
  <div class="label">Svar fra Claude</div>
  <div class="answer">${escapeHtml(r.answer)}</div>
  ${r.comment ? `<div class="label">Kommentar</div><div class="comment">${escapeHtml(r.comment)}</div>` : ''}
</div>`).join('')}
</body></html>`;
      return res.send(html);
    }

    res.json(reports);
  });

  return router;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = createReportRoutes;
