// Uploads everything in ./demo-data directly (no server needed). Stop `npm start` before running this.
require('dotenv').config();
const fs = require('fs'), path = require('path');
const { ingest } = require('../lib/ingest');
const dir = path.join(__dirname, '..', 'demo-data');

(async () => {
  let added = 0, dups = 0, errs = 0; const review = [];
  const files = fs.readdirSync(dir).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort((a, b) => (/^DUPLICATE/.test(a) - /^DUPLICATE/.test(b)) || a.localeCompare(b));
  for (const f of files) {
    try {
      const r = await ingest({ buffer: fs.readFileSync(path.join(dir, f)), originalname: f, mimetype: 'image/jpeg' }, {});
      if (r.duplicate) { dups++; console.log('duplicate', f); }
      else {
        added++; console.log('added    ', f, '-', r.status, r.ai_warning ? '(AI warning: ' + r.ai_warning + ')' : '');
        if (r.status !== 'ok') review.push(`${f} [${r.flags.join(', ')}]`);
      }
    } catch (e) { errs++; console.log('FAILED   ', f, '-', e.message); }
  }
  console.log(`\nadded ${added}, duplicates skipped ${dups}, errors ${errs}`);
  console.log('needs review:', review);
})();