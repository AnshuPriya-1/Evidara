const crypto = require('crypto'), fs = require('fs'), path = require('path');
const exifr = require('exifr');
const cloudinary = require('cloudinary').v2;
const db = require('./db');
const cfg = require('../config/projects.json');

const USE_CLOUD = !!process.env.CLOUDINARY_URL;
const FILES = path.join(__dirname, '..', 'data', 'files');
fs.mkdirSync(FILES, { recursive: true });

const km = (a, b, c, d) => {
  const r = x => x * Math.PI / 180;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const MAX_KM = 5; // a photo further than this from its site gets flagged

// Decide if a record needs a human to look at it. Runs at upload and after every manual edit.
function evaluate(r) {
  const why = [];
  if (r.lat == null) why.push('No GPS');
  if (!r.taken_at) why.push('No date');
  const s = cfg.sites.find(x => x.id === r.site);
  if (!s && r.lat != null) why.push('No matching site');
  if (s && r.lat != null && km(r.lat, r.lng, s.lat, s.lng) > MAX_KM) why.push('Location far from site');
  const p = cfg.projects.find(x => x.id === r.project);
  if (p && r.taken_at && (r.taken_at < p.start || r.taken_at > p.end + 'T23:59:59Z')) why.push('Date outside project period');
  r.flags = why;
  r.status = why.length ? 'needs_review' : 'ok';
  return r;
}

async function readMeta(buf) {
  const out = { lat: null, lng: null, taken_at: null };
  try { const g = await exifr.gps(buf); if (g && g.latitude != null) { out.lat = g.latitude; out.lng = g.longitude; } } catch {}
  try {
    const e = await exifr.parse(buf, ['DateTimeOriginal', 'CreateDate']);
    const d = e && (e.DateTimeOriginal || e.CreateDate);
    if (d instanceof Date && !isNaN(d)) out.taken_at = d.toISOString();
  } catch {}
  return out;
}

function nearestSite(lat, lng, project) {
  let best = null;
  for (const s of cfg.sites) {
    if (project && s.project !== project) continue;
    const d = km(lat, lng, s.lat, s.lng);
    if (d <= MAX_KM && (!best || d < best.d)) best = { s, d };
  }
  return best && best.s;
}

const cloudUpload = (buf, opts) => new Promise((res, rej) => cloudinary.uploader.upload_stream(opts, (e, r) => e ? rej(e) : res(r)).end(buf));

async function ingest(file, form = {}) {
  const buf = file.buffer;
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex'); // fingerprint of the ORIGINAL bytes
  const dup = db.all().find(r => r.sha256 === sha256);
  if (dup) return { duplicate: true, of: dup.id, filename: file.originalname };

  const meta = await readMeta(buf);
  const name = file.originalname.toLowerCase();
  let project = form.project || null, site = form.site || null;
  if (!site && meta.lat != null) { const s = nearestSite(meta.lat, meta.lng, project); if (s) { site = s.id; project = project || s.project; } }
  const activity = form.activity || cfg.activities.find(a => name.includes(a)) || null;

  const id = sha256.slice(0, 12);
  const ctx = { project, site, activity, sha256, taken_at: meta.taken_at, lat: meta.lat, lng: meta.lng, original_name: file.originalname };
  const isVideo = (file.mimetype || '').startsWith('video');
  const row = {
    id, filename: file.originalname, mimetype: file.mimetype, sha256, size: buf.length, uploaded_at: new Date().toISOString(),
    project, site, activity, ...meta, tags: [], caption: '', storage: USE_CLOUD ? 'cloudinary' : 'local', audit: []
  };

  if (USE_CLOUD) {
    const base = {
      folder: `evidara/${project || 'unassigned'}`, public_id: id, resource_type: 'auto', overwrite: false,
      tags: [project, site, activity].filter(Boolean),
      context: Object.fromEntries(Object.entries(ctx).filter(([, v]) => v != null))
    };
    const ai = { ...base };
    if (process.env.AI_TAGGING) { ai.categorization = process.env.AI_TAGGING; ai.auto_tagging = 0.6; }
    if (process.env.AI_CAPTIONING === '1') ai.detection = 'captioning';
        let r;
    const tagOnly = { ...base };
    if (process.env.AI_TAGGING) { tagOnly.categorization = process.env.AI_TAGGING; tagOnly.auto_tagging = 0.6; }
    try { r = await cloudUpload(buf, ai); }
    catch (e1) {
      try { r = await cloudUpload(buf, tagOnly); row.ai_warning = 'Captioning unavailable, tags only: ' + e1.message; }
      catch (e2) { row.ai_warning = 'AI add-on failed, uploaded without it: ' + e2.message; r = await cloudUpload(buf, base); }
    }
    row.public_id = r.public_id; row.resource_type = r.resource_type;
    row.original_url = r.secure_url; // untouched original, no transformation
    row.tags = r.tags || base.tags;
    row.caption = (r.info && r.info.detection && r.info.detection.captioning && r.info.detection.captioning.data && r.info.detection.captioning.data.caption) || '';
    row.thumb_url = cloudinary.url(r.public_id, {
      resource_type: r.resource_type, secure: true, ...(isVideo ? { format: 'jpg' } : {}),
      transformation: [{ width: 480, height: 320, crop: 'fill' }, { quality: 'auto' }]
    }); // derived copy: a transformation only, never overwrites the original
  } else {
    const local = id + path.extname(file.originalname);
    fs.writeFileSync(path.join(FILES, local), buf);
    row.original_url = row.thumb_url = '/files/' + local; row.local_name = local;
    row.tags = [project, site, activity].filter(Boolean);
  }
  evaluate(row);
  db.add(row);
  return row;
}

// Re-download the stored original and compare its hash to the one saved at upload.
async function verify(row) {
  let buf;
  if (row.storage === 'local') buf = fs.readFileSync(path.join(FILES, row.local_name));
  else { const res = await fetch(row.original_url); if (!res.ok) throw new Error('Could not fetch original: HTTP ' + res.status); buf = Buffer.from(await res.arrayBuffer()); }
  const now = crypto.createHash('sha256').update(buf).digest('hex');
  row.verification = { checked_at: new Date().toISOString(), match: now === row.sha256, expected: row.sha256, actual: now };
  db.save();
  return row.verification;
}

module.exports = { ingest, verify, evaluate, cfg, USE_CLOUD, FILES, km };
