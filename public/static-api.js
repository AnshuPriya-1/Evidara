// Static demo mode for GitHub Pages (no Node server there).
// Answers the app's /api/... calls from files in ./demo. Loaded only on github.io, file://, or ?static=1.
(function () {
  var isStatic = /github\.io$/.test(location.hostname) || location.protocol === 'file:' || /[?&]static=1/.test(location.search);
  if (!isStatic) return;

  var realFetch = window.fetch.bind(window), cache = {};
  var load = function (path) {
    return cache[path] || (cache[path] = realFetch(path).then(function (r) {
      if (!r.ok) throw new Error('Missing ' + path);
      return r.json();
    }));
  };
  var reply = function (body, status) {
    return Promise.resolve(new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json' } }));
  };
  var fixUrl = function (u) { return u && u.charAt(0) === '/' ? 'demo' + u : u; }; // /files/x.jpg -> demo/files/x.jpg
  var fixRow = function (r) { return Object.assign({}, r, { thumb_url: fixUrl(r.thumb_url), original_url: fixUrl(r.original_url) }); };

  // Same search logic as lib/search.js
  var STOP = new Set(['a', 'an', 'the', 'near', 'of', 'in', 'on', 'at', 'and', 'with', 'to', 'for', 'by', 'from']);
  var stem = function (t) { return t.length > 4 ? t.replace(/(ing|ed|es|s)$/, '') : t; };
  var words = function (s) { return (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(function (t) { return t && !STOP.has(t); }).map(stem); };
  function search(rows, cfg, o) {
    var r = rows.filter(function (x) {
      return (!o.project || x.project === o.project) && (!o.site || x.site === o.site) && (!o.status || x.status === o.status) &&
        (!o.from || (x.taken_at && x.taken_at >= o.from)) && (!o.to || (x.taken_at && x.taken_at <= o.to + 'T23:59:59Z'));
    });
    var byDate = function (a, b) { return (b.taken_at || '').localeCompare(a.taken_at || ''); };
    var toks = words(o.q);
    if (!toks.length) return r.sort(byDate);
    var siteName = function (id) { return (cfg.sites.find(function (s) { return s.id === id; }) || {}).name; };
    return r.map(function (x) {
      var hay = new Set(words([].concat(x.tags || [], [x.caption, x.filename, x.project, siteName(x.site), x.site, x.activity]).join(' ')));
      return { x: x, score: toks.filter(function (t) { return hay.has(t); }).length };
    }).filter(function (o2) { return o2.score > 0; })
      .sort(function (a, b) { return b.score - a.score || byDate(a.x, b.x); })
      .map(function (o2) { return o2.x; });
  }

  var NEEDS_SERVER = 'Not available on the GitHub Pages demo. This needs the Node server (run "npm start" locally).';

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : input.url;
    if (url.indexOf('/api/') !== 0) return realFetch(input, init);
    var u = new URL(url, 'http://x'), p = u.pathname, q = Object.fromEntries(u.searchParams);
    var m;

    if (p === '/api/config') return load('demo/config.json').then(reply);

    if (p === '/api/assets') {
      return Promise.all([load('demo/assets.json'), load('demo/config.json')]).then(function (d) { return reply(search(d[0], d[1], q).map(fixRow)); });
    }
    if (p === '/api/timeline') {
      return Promise.all([load('demo/assets.json'), load('demo/config.json')]).then(function (d) {
        var months = {};
        search(d[0], d[1], q).forEach(function (r) { var k = r.taken_at ? r.taken_at.slice(0, 7) : 'unknown'; months[k] = (months[k] || 0) + 1; });
        return reply(Object.keys(months).sort().map(function (k) { return { month: k, count: months[k] }; }));
      });
    }
    if (p === '/api/pairs') {
      return load('demo/pairs-' + (q.project || 'all') + '.json').catch(function () { return load('demo/pairs-all.json'); }).then(function (rows) {
        return reply(rows.map(function (r) {
          return Object.assign({}, r, { before: fixRow(r.before), after: fixRow(r.after), before_url: fixUrl(r.before_url), after_url: fixUrl(r.after_url) });
        }));
      });
    }
    // Real check, done in the browser: hash the stored file and compare with the SHA-256 recorded at upload.
    if ((m = p.match(/^\/api\/assets\/([^/]+)\/verify$/))) {
      return load('demo/assets.json').then(function (rows) {
        var r = rows.find(function (x) { return x.id === m[1]; });
        if (!r) return reply({ error: 'Not found' }, 404);
        return realFetch(fixUrl(r.original_url)).then(function (res) { return res.arrayBuffer(); })
          .then(function (buf) { return crypto.subtle.digest('SHA-256', buf); })
          .then(function (h) {
            var hex = Array.from(new Uint8Array(h)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
            return reply({ match: hex === r.sha256, checked_at: new Date().toISOString() });
          });
      }).catch(function (e) { return reply({ error: e.message }, 500); });
    }
    if (p === '/api/upload') return reply({ added: [], duplicates: [], errors: [{ filename: 'upload', error: NEEDS_SERVER }] });
    return reply({ error: NEEDS_SERVER }, 400); // reports, PDF, reel, social, edits
  };

  document.addEventListener('DOMContentLoaded', function () {
    var b = document.createElement('div');
    b.style.cssText = 'background:#fff4e5;border-bottom:1px solid #e0b877;padding:8px 16px;font:13px system-ui,sans-serif';
    b.textContent = 'Static demo on GitHub Pages: browsing, search, map, timeline, before/after and Verify original work. Upload and reports need the Node server.';
    document.body.insertBefore(b, document.body.firstChild);
  });
})();