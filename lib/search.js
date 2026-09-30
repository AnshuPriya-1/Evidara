const cfg = require('../config/projects.json');
const STOP = new Set(['a', 'an', 'the', 'near', 'of', 'in', 'on', 'at', 'and', 'with', 'to', 'for', 'by', 'from']);
const stem = t => t.length > 4 ? t.replace(/(ing|ed|es|s)$/, '') : t;
const words = s => (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t && !STOP.has(t)).map(stem);

function search(rows, { q, project, site, from, to, status } = {}) {
  let r = rows.filter(x =>
    (!project || x.project === project) && (!site || x.site === site) && (!status || x.status === status) &&
    (!from || (x.taken_at && x.taken_at >= from)) && (!to || (x.taken_at && x.taken_at <= to + 'T23:59:59Z')));
  const toks = words(q);
  const byDate = (a, b) => (b.taken_at || '').localeCompare(a.taken_at || '');
  if (!toks.length) return r.sort(byDate);
  const siteName = id => (cfg.sites.find(s => s.id === id) || {}).name;
  return r.map(x => {
    const hay = new Set(words([...(x.tags || []), x.caption, x.filename, x.project, siteName(x.site), x.site, x.activity].join(' ')));
    const score = toks.filter(t => hay.has(t)).length;
    return { x, score };
  }).filter(o => o.score > 0).sort((a, b) => b.score - a.score || byDate(a.x, b.x)).map(o => o.x);
}
module.exports = { search };
