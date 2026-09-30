// Uploads every file in ./demo-data one at a time through the running server (npm start first).
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'demo-data');
const base = `http://127.0.0.1:${process.env.PORT || 3000}`;

(async () => {
  const files = fs.readdirSync(dir).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort((a, b) => (/^DUPLICATE/.test(a) - /^DUPLICATE/.test(b)) || a.localeCompare(b));
  let added = 0, dups = 0, errs = 0; const review = [];
  for (const f of files) {
    let done = false;
    for (let t = 1; t <= 3 && !done; t++) {
      try {
        const fd = new FormData();
        fd.append('files', new Blob([fs.readFileSync(path.join(dir, f))], { type: 'image/jpeg' }), f);
        const res = await fetch(base + '/api/upload', { method: 'POST', body: fd });
        const j = await res.json();
        if (j.added && j.added.length) { added++; const a = j.added[0]; if (a.status !== 'ok') review.push(`${f} [${a.flags.join(', ')}]`); console.log('added    ', f); }
        else if (j.duplicates && j.duplicates.length) { dups++; console.log('duplicate', f); }
        else throw new Error((j.errors && j.errors[0] && j.errors[0].error) || 'unknown error');
        done = true;
      } catch (e) {
        console.log(`try ${t} failed for ${f}: ${e.cause ? e.cause.code : e.message}`);
        await new Promise(r => setTimeout(r, 1500));
      }
    }
    if (!done) errs++;
  }
  console.log(`\nadded ${added}, duplicates skipped ${dups}, errors ${errs}`);
  console.log('needs review:', review);
})();