// Auto-pair "before" and "after" photos: same site, close GPS position, dates far apart.
const db = require('./db');
const { km } = require('./ingest');
const { isImage } = require('./media');
const DAY = 864e5;

function pairs({ project, minDays = 30, maxMeters = 1000 } = {}) {
  const rows = db.all().filter(r => r.status === 'ok' && r.taken_at && r.lat != null && isImage(r) && (!project || r.project === project));
  const bySite = {};
  rows.forEach(r => (bySite[r.site] = bySite[r.site] || []).push(r));
  const out = [];
  for (const [site, list] of Object.entries(bySite)) {
    list.sort((a, b) => a.taken_at.localeCompare(b.taken_at));
    const n = Math.max(1, Math.floor(list.length / 3));
    const before = list.slice(0, n), after = list.slice(-n), used = new Set();
    for (const b of before) {
      let best = null;
      for (const a of after) {
        const days = Math.round((new Date(a.taken_at) - new Date(b.taken_at)) / DAY);
        if (used.has(a.id) || days < minDays) continue;
        const d = km(b.lat, b.lng, a.lat, a.lng) * 1000;
        if (d <= maxMeters && (!best || d < best.d)) best = { a, d, days };
      }
      if (best) { used.add(best.a.id); out.push({ site, before: b, after: best.a, days: best.days, distance_m: Math.round(best.d) }); }
    }
  }
  return out;
}
module.exports = { pairs };
