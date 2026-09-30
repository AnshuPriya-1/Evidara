const fs = require('fs'), path = require('path'), crypto = require('crypto');
const PDFDocument = require('pdfkit');
const cloudinary = require('cloudinary').v2;
const db = require('./db');
const { cfg, USE_CLOUD, FILES } = require('./ingest');
const { pairs } = require('./pairs');
const { derived, isImage } = require('./media');

const RF = path.join(__dirname, '..', 'data', 'reports.json');
const reports = fs.existsSync(RF) ? JSON.parse(fs.readFileSync(RF, 'utf8')) : [];
const saveR = () => { fs.mkdirSync(path.dirname(RF), { recursive: true }); fs.writeFileSync(RF, JSON.stringify(reports, null, 1)); };
const d10 = s => (s || '').slice(0, 10);
const sname = id => (cfg.sites.find(s => s.id === id) || {}).name || 'Unassigned site';
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// Rule: no linked evidence, no claim. add() silently drops any claim without evidence ids.
function build({ project, from, to, blur }) {
  const proj = cfg.projects.find(p => p.id === project);
  if (!proj) throw new Error('Choose a project first.');
  const inRange = r => r.project === project && (!from || (r.taken_at && r.taken_at >= from)) && (!to || (r.taken_at && r.taken_at <= to + 'T23:59:59Z'));
  const all = db.all().filter(inRange), good = all.filter(r => r.status === 'ok'), bad = all.filter(r => r.status !== 'ok');
  const claims = []; let n = 0;
  const add = (type, text, evidence, extra = {}) => { if (evidence && evidence.length) claims.push({ id: 'c' + (++n), type, text, evidence: [...new Set(evidence)], approved: false, ...extra }); };

  if (good.length) {
    const dates = good.map(r => r.taken_at).sort(), sites = [...new Set(good.map(r => r.site))];
    add('overview', `${plural(good.length, 'file')} with checked location and date were collected for ${proj.name} between ${d10(dates[0])} and ${d10(dates[dates.length - 1])}, across ${plural(sites.length, 'site')}.`, good.map(r => r.id));
    const acts = {}; good.forEach(r => (acts[r.activity || 'other'] = acts[r.activity || 'other'] || []).push(r));
    for (const [a, list] of Object.entries(acts)) add('activity', `${plural(list.length, 'file')} document ${a} at ${[...new Set(list.map(r => sname(r.site)))].join(', ')}.`, list.map(r => r.id));
  }
  const ids = new Set(good.map(r => r.id));
  const ps = pairs({ project }).filter(p => ids.has(p.before.id) && ids.has(p.after.id));
  const seen = {}; // spread the pair claims across sites instead of taking four from one site
  ps.sort((a, b) => (seen[a.site] = (seen[a.site] || 0) + 1) - (seen[b.site] = (seen[b.site] || 0) + 1));
  const rank = {}; const ordered = ps.map(p => ({ p, k: (rank[p.site] = (rank[p.site] || 0) + 1) })).sort((a, b) => a.k - b.k).map(o => o.p);
  ordered.slice(0, 4).forEach(p =>
    add('pair', `Visible change to review at ${sname(p.site)}: two photos of the same area taken ${p.days} days apart (${d10(p.before.taken_at)} and ${d10(p.after.taken_at)}), ${p.distance_m} m apart. A person must confirm what has changed.`, [p.before.id, p.after.id], { site: p.site, pair: [p.before.id, p.after.id] }));
  if (bad.length) {
    const why = {}; bad.forEach(r => r.flags.forEach(f => (why[f] = (why[f] || 0) + 1)));
    add('excluded', `${plural(bad.length, 'file')} were left out because they need review (${Object.entries(why).map(([k, v]) => `${k}: ${v}`).join(', ')}).`, bad.map(r => r.id));
  }
  const rep = { id: crypto.randomBytes(5).toString('hex'), project, project_name: proj.name, from: from || null, to: to || null, blur: !!blur, created_at: new Date().toISOString(), claims };
  reports.push(rep); saveR(); return rep;
}

const get = id => reports.find(r => r.id === id);
function approve(id, cid, val) { const r = get(id); if (!r) return null; r.claims.forEach(c => { if (cid === 'all' || c.id === cid) c.approved = !!val; }); saveR(); return r; }

async function imgBuf(r, blur) {
  if (r.storage === 'local') return fs.readFileSync(path.join(FILES, r.local_name));
  const res = await fetch(derived(r, { w: 480, h: 320, blur }));
  if (!res.ok) throw new Error('image fetch failed');
  return Buffer.from(await res.arrayBuffer());
}

async function pdf(rep, out) {
  const ok = rep.claims.filter(c => c.approved);
  if (!ok.length) throw new Error('Approve at least one claim first.');
  const byId = Object.fromEntries(db.all().map(r => [r.id, r]));
  const doc = new PDFDocument({ margin: 48, size: 'A4' }); doc.pipe(out);
  const L = doc.page.margins.left;
  doc.fontSize(22).text('Impact evidence report'); doc.fontSize(12).fillColor('#444').text(rep.project_name);
  doc.text(`Period: ${rep.from || 'start'} to ${rep.to || 'today'}    Generated: ${d10(new Date().toISOString())}`);
  doc.text(`${ok.length} of ${rep.claims.length} claims were approved by a human reviewer.${rep.blur ? ' Faces are blurred.' : ''}`).moveDown();
  const cited = new Set();
  for (const c of ok) {
    if (doc.y > 660) doc.addPage();
    doc.fillColor('#000').fontSize(12).text(c.text).moveDown(.3);
    const imgs = (c.pair || c.evidence.slice(0, 2)).map(i => byId[i]).filter(r => r && isImage(r));
    const y = doc.y; let x = L;
    for (const r of imgs) { try { doc.image(await imgBuf(r, rep.blur), x, y, { fit: [230, 155] }); x += 240; } catch {} }
    if (x > L) doc.y = y + 165;
    doc.x = L; doc.fontSize(8).fillColor('#555');
    c.evidence.forEach(i => cited.add(i));
    c.evidence.slice(0, 6).forEach(i => { const r = byId[i]; if (r) doc.text(`Evidence: ${r.filename} | ${d10(r.taken_at) || 'no date'} | ${sname(r.site)} | SHA-256 ${r.sha256.slice(0, 16)}...`); });
    if (c.evidence.length > 6) doc.text(`+ ${c.evidence.length - 6} more files, listed in the appendix.`);
    doc.moveDown();
  }
  doc.addPage().fontSize(14).fillColor('#000').text('Appendix: source files').moveDown(.5).fontSize(7).fillColor('#333');
  [...cited].map(i => byId[i]).filter(Boolean).forEach(r => doc.text(`${r.filename} | ${d10(r.taken_at) || 'no date'} | ${sname(r.site)} | ${r.lat != null ? r.lat.toFixed(4) + ',' + r.lng.toFixed(4) : 'no GPS'}\nSHA-256 ${r.sha256}\n${r.original_url}\n`));
  doc.addPage().fontSize(14).fillColor('#000').text('What this report can and cannot show').moveDown(.5).fontSize(10).fillColor('#333')
    .text('It can show: each item links to an original file, with its date, place and a fingerprint (SHA-256) taken at upload. Anyone can re-check that the stored file still matches its fingerprint.\n\nIt cannot show: that a photo is genuine before upload. Photo metadata can be edited. Checks catch missing or inconsistent date and place, and exact duplicates. They do not catch every reused or staged photo.\n\nBefore/after pairs are shown for a person to judge. Evidara does not measure change.');
  doc.end();
}

async function reel(rep) {
  if (!USE_CLOUD) throw new Error('The video reel needs Cloudinary. Add CLOUDINARY_URL to .env and restart.');
  const byId = Object.fromEntries(db.all().map(r => [r.id, r]));
  const ok = rep.claims.filter(c => c.approved);
  const order = [...ok.filter(c => c.pair).flatMap(c => c.pair), ...ok.flatMap(c => c.evidence)];
  const rows = [...new Set(order)].map(i => byId[i]).filter(r => r && isImage(r) && r.storage === 'cloudinary').slice(0, 8);
  if (rows.length < 2) throw new Error('Approve claims that cite at least 2 images first.');
  const manifest = { w: 1080, h: 1080, duration: rows.length * 3, fps: 25, vars: { sdur: 3000, tdur: 500, transition: 's:circlecrop', slides: rows.map(r => ({ media: 'i:' + r.public_id.replace(/\//g, ':') })) } };
  const r = await cloudinary.uploader.create_slideshow({ manifest_json: manifest, resource_type: 'video', public_id: 'evidara/reels/' + rep.id, overwrite: true, tags: ['evidara-reel'] });
  rep.reel_url = cloudinary.url(r.public_id || 'evidara/reels/' + rep.id, { resource_type: 'video', format: 'mp4', secure: true });
  saveR(); return rep.reel_url;
}

function social(rep) {
  const ok = rep.claims.filter(c => c.approved);
  if (!ok.length) throw new Error('Approve at least one claim first.');
  const ov = ok.find(c => c.type === 'overview'), pr = ok.find(c => c.type === 'pair');
  const tags = '#FieldEvidence #Sustainability #Transparency';
  const long = [`${rep.project_name}: field update.`, ov ? ov.text : '', pr ? `See the visible change at ${sname(pr.site)}.` : '', 'Every photo is fingerprint-checked and traceable to its original file.', tags].filter(Boolean).join('\n\n');
  const short = `${rep.project_name}: ${ov ? ov.text.split(' were collected')[0] + ' collected' : 'new field evidence'}, each traceable to its original. ${tags}`.slice(0, 280);
  return { long, short };
}
module.exports = { build, get, approve, pdf, reel, social };
