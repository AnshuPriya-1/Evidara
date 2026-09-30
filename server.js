require('dotenv').config();
const express = require('express'), multer = require('multer'), path = require('path');
const db = require('./lib/db');
const { ingest, verify, evaluate, cfg, USE_CLOUD, FILES } = require('./lib/ingest');
const { search } = require('./lib/search');
const { pairs } = require('./lib/pairs');
const { derived } = require('./lib/media');
const report = require('./lib/report');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/files', express.static(FILES));

app.get('/api/config', (_, res) => res.json({ ...cfg, mode: USE_CLOUD ? 'cloudinary' : 'local' }));

app.post('/api/upload', upload.array('files', 500), async (req, res) => {
  const results = { added: [], duplicates: [], errors: [] };
  for (const f of req.files || []) { // sequential on purpose: keeps duplicate detection reliable
    try {
      const r = await ingest(f, req.body);
      (r.duplicate ? results.duplicates : results.added).push(r.duplicate ? { filename: r.filename, of: r.of } : { id: r.id, filename: r.filename, status: r.status, flags: r.flags });
    } catch (e) { results.errors.push({ filename: f.originalname, error: e.message }); }
  }
  res.json(results);
});

app.get('/api/assets', (req, res) => res.json(search(db.all(), req.query)));

app.get('/api/timeline', (req, res) => {
  const m = {};
  for (const r of search(db.all(), req.query)) { const k = r.taken_at ? r.taken_at.slice(0, 7) : 'unknown'; m[k] = (m[k] || 0) + 1; }
  res.json(Object.entries(m).sort().map(([month, count]) => ({ month, count })));
});

app.post('/api/assets/:id/verify', async (req, res) => {
  const r = db.find(req.params.id); if (!r) return res.status(404).json({ error: 'Not found' });
  try { res.json(await verify(r)); } catch (e) { res.status(500).json({ error: e.message }); }
});

// Human fixes metadata for "needs review" files. The original file is never touched; every edit is logged.
app.patch('/api/assets/:id', (req, res) => {
  const r = db.find(req.params.id); if (!r) return res.status(404).json({ error: 'Not found' });
  const before = {};
  for (const k of ['project', 'site', 'activity', 'taken_at', 'lat', 'lng']) if (k in req.body) { before[k] = r[k]; r[k] = req.body[k]; }
  r.audit.push({ at: new Date().toISOString(), before, after: req.body });
  evaluate(r); db.save(); res.json(r);
});

// ---- Phase 2 ----
app.get('/api/pairs', (req, res) => {
  const blur = req.query.blur === '1', o = { w: 640, h: 420, blur };
  res.json(pairs({ project: req.query.project || undefined, minDays: +req.query.minDays || 30 }).map(p => ({
    site: p.site, days: p.days, distance_m: p.distance_m, before: p.before, after: p.after,
    before_label: 'BEFORE ' + p.before.taken_at.slice(0, 10), after_label: 'AFTER ' + p.after.taken_at.slice(0, 10),
    before_url: derived(p.before, { ...o, label: 'BEFORE ' + p.before.taken_at.slice(0, 10) }),
    after_url: derived(p.after, { ...o, label: 'AFTER ' + p.after.taken_at.slice(0, 10) })
  })));
});
const wrap = fn => async (req, res) => { try { await fn(req, res); } catch (e) { if (!res.headersSent) res.status(400).json({ error: e.message }); } };
app.post('/api/reports', wrap((req, res) => res.json(report.build(req.body))));
app.get('/api/reports/:id', wrap((req, res) => { const r = report.get(req.params.id); r ? res.json(r) : res.status(404).json({ error: 'Not found' }); }));
app.post('/api/reports/:id/approve/:cid', wrap((req, res) => res.json(report.approve(req.params.id, req.params.cid, req.body.approved))));
app.get('/api/reports/:id/pdf', wrap(async (req, res) => {
  const r = report.get(req.params.id); if (!r) throw new Error('Report not found');
  res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="evidara-report-${r.id}.pdf"`);
  await report.pdf(r, res);
}));
app.post('/api/reports/:id/reel', wrap(async (req, res) => res.json({ url: await report.reel(report.get(req.params.id)) })));
app.get('/api/reports/:id/social', wrap((req, res) => res.json(report.social(report.get(req.params.id)))));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Evidara running on http://localhost:${port}  (storage: ${USE_CLOUD ? 'Cloudinary' : 'local demo mode'})`));

process.on('unhandledRejection', e => console.error('Unhandled error:', e));
process.on('uncaughtException', e => console.error('Uncaught error:', e));